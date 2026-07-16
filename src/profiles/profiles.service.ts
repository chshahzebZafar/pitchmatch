import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { InvestorProfileDto } from './dto/investor-profile.dto';
import { InnovatorProfileDto } from './dto/innovator-profile.dto';
import { MediatorProfileDto } from './dto/mediator-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
  ) {}

  /** Another user's full profile. Never exposes email/phone. */
  async getPublicProfile(viewerId: string, userId: string) {
    if (await this.safety.isBlockedBetween(viewerId, userId)) {
      throw new NotFoundException('Profile not available');
    }
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { investorProfile: true, innovatorProfile: true, mediatorProfile: true },
    });
    if (!u || u.status !== UserStatus.ACTIVE) throw new NotFoundException('User not found');

    const profile =
      u.role === Role.INVESTOR
        ? u.investorProfile
        : u.role === Role.INNOVATOR
          ? u.innovatorProfile
          : u.role === Role.MEDIATOR
            ? u.mediatorProfile
            : null;

    return {
      id: u.id,
      firstName: u.name.split(' ')[0],
      role: u.role,
      photoUrl: u.photoUrl,
      country: u.country,
      city: u.city,
      bio: u.bio,
      linkedinUrl: u.linkedinUrl,
      profile,
    };
  }

  async getMyProfile(userId: string, role: Role) {
    switch (role) {
      case Role.INVESTOR:
        return this.prisma.investorProfile.findUnique({ where: { userId } });
      case Role.INNOVATOR:
        return this.prisma.innovatorProfile.findUnique({ where: { userId } });
      case Role.MEDIATOR:
        return this.prisma.mediatorProfile.findUnique({ where: { userId } });
      default:
        return null;
    }
  }

  async upsertInvestor(userId: string, role: Role, dto: InvestorProfileDto) {
    this.assertRole(role, Role.INVESTOR);
    const profile = await this.prisma.investorProfile.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: { ...dto },
    });
    await this.markCompleted(userId);
    return profile;
  }

  async upsertInnovator(userId: string, role: Role, dto: InnovatorProfileDto) {
    this.assertRole(role, Role.INNOVATOR);
    const profile = await this.prisma.innovatorProfile.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: { ...dto },
    });
    await this.markCompleted(userId);
    return profile;
  }

  async upsertMediator(userId: string, role: Role, dto: MediatorProfileDto) {
    this.assertRole(role, Role.MEDIATOR);
    const profile = await this.prisma.mediatorProfile.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: { ...dto },
    });
    await this.markCompleted(userId);
    return profile;
  }

  private assertRole(role: Role, expected: Role) {
    if (role !== expected) {
      throw new ForbiddenException(
        `This endpoint is only for ${expected.toLowerCase()} accounts`,
      );
    }
  }

  private async markCompleted(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { profileCompleted: true },
    });
  }
}
