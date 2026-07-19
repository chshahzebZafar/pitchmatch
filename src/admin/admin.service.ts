import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MediatorVerificationStatus,
  ReportStatus,
  Role,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

/** Fields safe to return about a user in an admin list. Never the password hash. */
const USER_SUMMARY = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  photoUrl: true,
  country: true,
  city: true,
  createdAt: true,
} as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Counts for the dashboard — the two queues that need action come first. */
  async stats() {
    const [pendingMediators, pendingReports, users, matches, suspended] = await Promise.all([
      this.prisma.mediatorProfile.count({
        where: { verificationStatus: MediatorVerificationStatus.PENDING },
      }),
      this.prisma.report.count({ where: { status: ReportStatus.PENDING } }),
      this.prisma.user.groupBy({ by: ['role'], _count: true }),
      this.prisma.match.count(),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
    ]);

    return {
      actionRequired: { pendingMediators, pendingReports },
      users: Object.fromEntries(users.map((u) => [u.role, u._count])),
      matches,
      suspended,
    };
  }

  // ---------------------------------------------------------------------
  // Mediator verification
  //
  // Mediators land in PENDING_VERIFICATION at signup and, until now, had no
  // way out: nothing in the API could change verificationStatus, so the role
  // was unusable in practice.
  // ---------------------------------------------------------------------

  async listMediators(status: MediatorVerificationStatus = MediatorVerificationStatus.PENDING) {
    const rows = await this.prisma.mediatorProfile.findMany({
      where: { verificationStatus: status },
      include: { user: { select: USER_SUMMARY } },
      orderBy: { user: { createdAt: 'asc' } }, // oldest first — a queue, not a stack
    });

    return rows.map((m) => ({
      user: m.user,
      credentials: {
        profTitle: m.profTitle,
        qualification: m.qualification,
        licenseNo: m.licenseNo,
        licenseBody: m.licenseBody,
        jurisdictions: m.jurisdictions,
        yearsExp: m.yearsExp,
        specializations: m.specializations,
        firm: m.firm,
        feeModel: m.feeModel,
        feeRange: m.feeRange,
      },
      verificationStatus: m.verificationStatus,
    }));
  }

  async decideMediator(
    userId: string,
    status: MediatorVerificationStatus,
    note?: string,
  ) {
    const profile = await this.prisma.mediatorProfile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true, emailVerified: true } } },
    });
    if (!profile) throw new NotFoundException('Mediator profile not found');

    const approved = status === MediatorVerificationStatus.VERIFIED;

    await this.prisma.$transaction(async (tx) => {
      await tx.mediatorProfile.update({
        where: { userId },
        data: { verificationStatus: status },
      });

      // Approval is what actually releases the account. Guard on emailVerified
      // so approving someone who never confirmed their email does not skip that
      // step for them.
      if (approved && profile.user.emailVerified) {
        await tx.user.update({
          where: { id: userId },
          data: { status: UserStatus.ACTIVE },
        });
      }
    });

    void this.mail.sendMediatorDecision(
      profile.user.email,
      profile.user.name,
      approved,
      note,
    );

    this.logger.log(`Mediator ${userId} -> ${status}`);
    return { userId, verificationStatus: status };
  }

  // ---------------------------------------------------------------------
  // Reports
  // ---------------------------------------------------------------------

  async listReports(status?: ReportStatus) {
    const rows = await this.prisma.report.findMany({
      where: status ? { status } : undefined,
      include: {
        reporter: { select: USER_SUMMARY },
        reported: { select: USER_SUMMARY },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    // Repeat offenders are the signal worth surfacing: one report is noise,
    // four against the same account is a pattern.
    const counts = await this.prisma.report.groupBy({
      by: ['reportedId'],
      where: { reportedId: { in: rows.map((r) => r.reportedId) } },
      _count: true,
    });
    const totalAgainst = new Map(counts.map((c) => [c.reportedId, c._count]));

    return rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt,
      reporter: r.reporter,
      reported: r.reported,
      totalReportsAgainstReported: totalAgainst.get(r.reportedId) ?? 1,
    }));
  }

  async decideReport(reportId: string, status: ReportStatus) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Report not found');

    await this.prisma.report.update({ where: { id: reportId }, data: { status } });
    this.logger.log(`Report ${reportId} -> ${status}`);
    return { id: reportId, status };
  }

  // ---------------------------------------------------------------------
  // Moderation
  // ---------------------------------------------------------------------

  async setUserStatus(userId: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // An admin suspending an admin — including themselves — locks the panel.
    if (user.role === Role.ADMIN) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status } });

      if (status === UserStatus.SUSPENDED) {
        // Suspension has to end the session too. The access token stays valid
        // until it expires, but revoking refresh tokens caps that at one TTL
        // instead of thirty days.
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        // Stop pushing to a suspended account's devices.
        await tx.pushToken.deleteMany({ where: { userId } });
      }
    });

    this.logger.log(`User ${userId} -> ${status}`);
    return { userId, status };
  }
}
