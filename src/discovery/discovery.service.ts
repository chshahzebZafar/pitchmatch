import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, SwipeDirection } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { scorePair } from './matching';

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
  ) {}

  async feed(userId: string, role: Role, limit = 20, offset = 0) {
    const opposite =
      role === Role.INVESTOR
        ? Role.INNOVATOR
        : role === Role.INNOVATOR
          ? Role.INVESTOR
          : null;
    if (!opposite) return { total: 0, items: [] };

    const viewer = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { investorProfile: true, innovatorProfile: true },
    });
    if (role === Role.INVESTOR && !viewer?.investorProfile) return { total: 0, items: [] };
    if (role === Role.INNOVATOR && !viewer?.innovatorProfile) return { total: 0, items: [] };

    const swiped = await this.prisma.swipe.findMany({
      where: { swiperId: userId },
      select: { targetId: true },
    });
    const blocked = await this.safety.blockedIds(userId);
    const excludeIds = [userId, ...swiped.map((s) => s.targetId), ...blocked];

    const candidates = await this.prisma.user.findMany({
      where: {
        role: opposite,
        status: 'ACTIVE',
        profileCompleted: true,
        id: { notIn: excludeIds },
      },
      include: { investorProfile: true, innovatorProfile: true },
    });

    const scored = candidates
      .map((c) => {
        let score = 0;
        if (role === Role.INVESTOR && viewer?.investorProfile && c.innovatorProfile) {
          score = scorePair(viewer.investorProfile, c.innovatorProfile);
        } else if (role === Role.INNOVATOR && viewer?.innovatorProfile && c.investorProfile) {
          score = scorePair(c.investorProfile, viewer.innovatorProfile);
        }
        const hasProfile =
          opposite === Role.INNOVATOR ? !!c.innovatorProfile : !!c.investorProfile;
        return { c, score, hasProfile };
      })
      .filter((x) => x.hasProfile)
      .sort((a, b) => b.score - a.score);

    return {
      total: scored.length,
      items: scored.slice(offset, offset + limit).map(({ c, score }) => this.toCard(c, score)),
    };
  }

  /**
   * People who swiped RIGHT on me and I haven't swiped on yet — one tap from a match.
   * Excludes anyone blocked either way.
   */
  async interestedInMe(userId: string, role: Role) {
    const opposite =
      role === Role.INVESTOR ? Role.INNOVATOR : role === Role.INNOVATOR ? Role.INVESTOR : null;
    if (!opposite) return { total: 0, items: [] };

    const admirers = await this.prisma.swipe.findMany({
      where: { targetId: userId, direction: SwipeDirection.RIGHT },
      select: { swiperId: true },
    });
    const admirerIds = admirers.map((s) => s.swiperId);
    if (admirerIds.length === 0) return { total: 0, items: [] };

    const mine = await this.prisma.swipe.findMany({
      where: { swiperId: userId, targetId: { in: admirerIds } },
      select: { targetId: true },
    });
    const alreadySwiped = new Set(mine.map((s) => s.targetId));
    const blocked = new Set(await this.safety.blockedIds(userId));
    const pending = admirerIds.filter((id) => !alreadySwiped.has(id) && !blocked.has(id));
    if (pending.length === 0) return { total: 0, items: [] };

    const viewer = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { investorProfile: true, innovatorProfile: true },
    });

    const users = await this.prisma.user.findMany({
      where: { id: { in: pending }, status: 'ACTIVE', profileCompleted: true },
      include: { investorProfile: true, innovatorProfile: true },
    });

    const scored = users
      .map((c) => {
        let score = 0;
        if (role === Role.INVESTOR && viewer?.investorProfile && c.innovatorProfile) {
          score = scorePair(viewer.investorProfile, c.innovatorProfile);
        } else if (role === Role.INNOVATOR && viewer?.innovatorProfile && c.investorProfile) {
          score = scorePair(c.investorProfile, viewer.innovatorProfile);
        }
        return { c, score };
      })
      .sort((a, b) => b.score - a.score);

    return { total: scored.length, items: scored.map(({ c, score }) => this.toCard(c, score)) };
  }

  async swipe(userId: string, targetId: string, direction: SwipeDirection) {
    if (targetId === userId) throw new BadRequestException("You can't swipe yourself");
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('User not found');
    if (await this.safety.isBlockedBetween(userId, targetId)) {
      throw new ForbiddenException('This profile is not available');
    }

    await this.prisma.swipe.upsert({
      where: { swiperId_targetId: { swiperId: userId, targetId } },
      create: { swiperId: userId, targetId, direction },
      update: { direction },
    });

    if (direction !== SwipeDirection.RIGHT) return { matched: false };

    const reciprocal = await this.prisma.swipe.findUnique({
      where: { swiperId_targetId: { swiperId: targetId, targetId: userId } },
    });
    if (reciprocal?.direction === SwipeDirection.RIGHT) {
      const [a, b] = [userId, targetId].sort();
      const match = await this.prisma.match.upsert({
        where: { userAId_userBId: { userAId: a, userBId: b } },
        create: { userAId: a, userBId: b },
        update: {},
      });
      return { matched: true, matchId: match.id };
    }
    return { matched: false };
  }

  // List the user's swipes in one direction, with the target's preview info.
  async swipeHistory(userId: string, direction: SwipeDirection) {
    const rows = await this.prisma.swipe.findMany({
      where: { swiperId: userId, direction },
      include: { target: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((s) => ({
      targetId: s.targetId,
      direction: s.direction,
      createdAt: s.createdAt,
      user: {
        id: s.target.id,
        firstName: s.target.name.split(' ')[0],
        photoUrl: s.target.photoUrl,
        role: s.target.role,
        country: s.target.country,
      },
    }));
  }

  // Undo a single swipe (and any match it created) — the target returns to the deck.
  async undoSwipe(userId: string, targetId: string) {
    await this.prisma.swipe.deleteMany({ where: { swiperId: userId, targetId } });
    const [a, b] = [userId, targetId].sort();
    await this.prisma.match.deleteMany({ where: { userAId: a, userBId: b } });
    return { undone: true };
  }

  // Clear the user's swipes (and any matches involving them) so the deck repopulates.
  async reset(userId: string) {
    const [swipes, matches] = await this.prisma.$transaction([
      this.prisma.swipe.deleteMany({ where: { swiperId: userId } }),
      this.prisma.match.deleteMany({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
      }),
    ]);
    return { swipesCleared: swipes.count, matchesCleared: matches.count };
  }

  async matches(userId: string) {
    const rows = await this.prisma.match.findMany({
      where: { status: 'ACTIVE', OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: true, userB: true },
      orderBy: { matchedAt: 'desc' },
    });
    return rows.map((m) => {
      const other = m.userAId === userId ? m.userB : m.userA;
      return {
        matchId: m.id,
        matchedAt: m.matchedAt,
        user: {
          id: other.id,
          firstName: other.name.split(' ')[0],
          photoUrl: other.photoUrl,
          role: other.role,
        },
      };
    });
  }

  // Pre-unlock preview card (spec §6.1). Innovator project title is intentionally omitted.
  private toCard(u: any, score: number) {
    const base = {
      userId: u.id,
      firstName: (u.name as string).split(' ')[0],
      photoUrl: u.photoUrl,
      country: u.country,
      role: u.role,
      score,
    };
    if (u.role === Role.INNOVATOR && u.innovatorProfile) {
      const p = u.innovatorProfile;
      return {
        ...base,
        sector: p.sector,
        stage: p.stage,
        oneLiner: p.oneLiner,
        fundingBracket: p.fundingMin,
      };
    }
    if (u.role === Role.INVESTOR && u.investorProfile) {
      const p = u.investorProfile;
      return {
        ...base,
        investorType: p.investorType,
        sectors: p.sectors,
        ticketBracket: p.ticketMin,
        stages: p.stages,
      };
    }
    return base;
  }
}
