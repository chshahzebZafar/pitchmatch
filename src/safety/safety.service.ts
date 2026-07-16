import { BadRequestException, Injectable } from '@nestjs/common';
import { MatchStatus, ReportReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every user id blocked by me OR who blocked me — excluded from discovery. */
  async blockedIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.block.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true },
    });
    return rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId));
  }

  async isBlockedBetween(a: string, b: string): Promise<boolean> {
    const hit = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
      select: { id: true },
    });
    return !!hit;
  }

  async block(userId: string, targetId: string) {
    if (userId === targetId) throw new BadRequestException("You can't block yourself");
    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: targetId } },
      create: { blockerId: userId, blockedId: targetId },
      update: {},
    });
    // Blocking closes the conversation for both sides (spec §8.1).
    const [a, b] = [userId, targetId].sort();
    await this.prisma.match.updateMany({
      where: { userAId: a, userBId: b },
      data: { status: MatchStatus.BLOCKED },
    });
    return { blocked: true };
  }

  async unblock(userId: string, targetId: string) {
    await this.prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
    // Restore the match only if the other side hasn't also blocked.
    const stillBlocked = await this.isBlockedBetween(userId, targetId);
    if (!stillBlocked) {
      const [a, b] = [userId, targetId].sort();
      await this.prisma.match.updateMany({
        where: { userAId: a, userBId: b, status: MatchStatus.BLOCKED },
        data: { status: MatchStatus.ACTIVE },
      });
    }
    return { blocked: false };
  }

  async listBlocks(userId: string) {
    const rows = await this.prisma.block.findMany({
      where: { blockerId: userId },
      include: { blocked: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((b) => ({
      userId: b.blockedId,
      firstName: b.blocked.name.split(' ')[0],
      photoUrl: b.blocked.photoUrl,
      role: b.blocked.role,
      createdAt: b.createdAt,
    }));
  }

  async report(userId: string, targetId: string, reason: ReportReason, details?: string) {
    if (userId === targetId) throw new BadRequestException("You can't report yourself");
    await this.prisma.report.create({
      data: { reporterId: userId, reportedId: targetId, reason, details },
    });
    return { reported: true };
  }
}
