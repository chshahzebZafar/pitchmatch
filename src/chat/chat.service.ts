import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private conversationForMatch(matchId: string) {
    return this.prisma.conversation.upsert({
      where: { matchId },
      create: { matchId },
      update: {},
    });
  }

  private async authorize(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { match: true },
    });
    if (!conv) throw new NotFoundException('Conversation not found');
    const { userAId, userBId } = conv.match;
    if (userId !== userAId && userId !== userBId) {
      throw new ForbiddenException('Not your conversation');
    }
    return { conv, otherId: userId === userAId ? userBId : userAId };
  }

  // One conversation per active match, with the other user, last message and unread count.
  async list(userId: string) {
    const matches = await this.prisma.match.findMany({
      where: { status: 'ACTIVE', OR: [{ userAId: userId }, { userBId: userId }] },
      include: { userA: true, userB: true },
      orderBy: { matchedAt: 'desc' },
    });

    const out: Array<Record<string, unknown>> = [];
    for (const m of matches) {
      const conv = await this.conversationForMatch(m.id);
      const other = m.userAId === userId ? m.userB : m.userA;
      const last = await this.prisma.message.findFirst({
        where: { conversationId: conv.id },
        orderBy: { id: 'desc' },
      });
      const unreadCount = await this.prisma.message.count({
        where: { conversationId: conv.id, senderId: { not: userId }, readAt: null },
      });
      out.push({
        conversationId: conv.id,
        matchId: m.id,
        user: {
          id: other.id,
          firstName: other.name.split(' ')[0],
          photoUrl: other.photoUrl,
          role: other.role,
        },
        lastMessage: last
          ? { body: last.body, createdAt: last.createdAt, mine: last.senderId === userId }
          : null,
        unreadCount,
      });
    }
    return out;
  }

  async messages(userId: string, conversationId: string, after?: number, limit = 50) {
    await this.authorize(conversationId, userId);
    if (after != null && !Number.isNaN(after)) {
      return this.prisma.message.findMany({
        where: { conversationId, id: { gt: after } },
        orderBy: { id: 'asc' },
        take: 200,
      });
    }
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { id: 'desc' },
      take: limit,
    });
    return rows.reverse();
  }

  async send(userId: string, conversationId: string, body: string) {
    await this.authorize(conversationId, userId);
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Message is empty');
    return this.prisma.message.create({
      data: { conversationId, senderId: userId, body: trimmed },
    });
  }

  async markRead(userId: string, conversationId: string) {
    await this.authorize(conversationId, userId);
    await this.prisma.message.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
