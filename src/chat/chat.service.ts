import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';
import { chatAttachmentUrl } from '../media/storage';
import { PushService } from '../push/push.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly safety: SafetyService,
    private readonly push: PushService,
  ) {}

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
    const otherId = userId === userAId ? userBId : userAId;
    if (await this.safety.isBlockedBetween(userId, otherId)) {
      throw new ForbiddenException('This conversation is no longer available');
    }
    return { conv, otherId };
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
    let messages;
    if (after != null && !Number.isNaN(after)) {
      messages = await this.prisma.message.findMany({
        where: { conversationId, id: { gt: after } },
        orderBy: { id: 'asc' },
        take: 200,
      });
    } else {
      const rows = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { id: 'desc' },
        take: limit,
      });
      messages = rows.reverse();
    }
    // The highest id among MY messages the other party has read → drives "Seen".
    const lastRead = await this.prisma.message.findFirst({
      where: { conversationId, senderId: userId, NOT: { readAt: null } },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    return { messages, otherLastReadId: lastRead?.id ?? null };
  }

  async send(userId: string, conversationId: string, body: string) {
    const { otherId } = await this.authorize(conversationId, userId);
    const trimmed = body.trim();
    if (!trimmed) throw new BadRequestException('Message is empty');
    const message = await this.prisma.message.create({
      data: { conversationId, senderId: userId, body: trimmed },
    });

    void this.notify(userId, otherId, conversationId, trimmed);
    return message;
  }

  async sendAttachment(userId: string, conversationId: string, filename: string) {
    const { otherId } = await this.authorize(conversationId, userId);
    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        body: '',
        attachmentUrl: chatAttachmentUrl(filename),
      },
    });

    void this.notify(userId, otherId, conversationId, 'Sent a photo');
    return message;
  }

  /**
   * Push the recipient. Fire-and-forget -- the message is already stored, so a
   * push failure must not fail the send.
   *
   * The preview is truncated rather than sent whole: notification text lands on
   * a lock screen, where the whole message would be readable by anyone holding
   * the phone.
   */
  private async notify(
    senderId: string,
    recipientId: string,
    conversationId: string,
    preview: string,
  ) {
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });
    if (!sender) return;

    await this.push.sendToUser(recipientId, {
      title: sender.name,
      body: preview.length > 120 ? `${preview.slice(0, 117)}...` : preview,
      data: { type: 'message', conversationId },
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
