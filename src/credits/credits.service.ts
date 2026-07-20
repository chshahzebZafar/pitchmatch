import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditReason, Prisma, PurchaseState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Credits.
 *
 * Two rules drive the whole design:
 *
 *  1. Every balance change writes a ledger row in the SAME transaction as the
 *     balance update. `users.credits` is a cache; `credit_ledger` is the record
 *     of truth. A balance you cannot reconstruct is a balance you cannot defend
 *     when a paying user disputes it.
 *
 *  2. Granting is keyed on Google's purchaseToken, which is UNIQUE in the
 *     schema. A replayed client call, a retry after a timeout, or two devices
 *     racing all collapse to one grant, because the second insert violates the
 *     constraint rather than adding credits again.
 */

/** What each action costs. Central so pricing is one edit, not a hunt. */
export const CREDIT_COSTS = {
  REVEAL: 1,
} as const;

/** Credits granted on first sign-in, so the paywall can be experienced before it bites. */
const SIGNUP_BONUS = 3;

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async balance(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return { credits: user.credits, costs: CREDIT_COSTS };
  }

  async history(userId: string, take = 50) {
    return this.prisma.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        delta: true,
        balance: true,
        reason: true,
        refId: true,
        createdAt: true,
      },
    });
  }

  /**
   * Move a balance and record why, atomically.
   *
   * Spending uses a conditional update (`credits: { gte: cost }`) rather than
   * read-then-write: two concurrent reveals on the same account would otherwise
   * both read the same balance and both succeed, letting someone spend credits
   * they do not have.
   */
  private async move(
    tx: Prisma.TransactionClient,
    userId: string,
    delta: number,
    reason: CreditReason,
    refId?: string,
  ): Promise<number> {
    if (delta < 0) {
      const cost = -delta;
      const updated = await tx.user.updateMany({
        where: { id: userId, credits: { gte: cost } },
        data: { credits: { decrement: cost } },
      });
      if (updated.count === 0) {
        throw new BadRequestException('Not enough credits');
      }
    } else {
      await tx.user.update({
        where: { id: userId },
        data: { credits: { increment: delta } },
      });
    }

    const after = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    const balance = after?.credits ?? 0;

    await tx.creditLedger.create({
      data: { userId, delta, balance, reason, refId },
    });

    return balance;
  }

  /** One-time welcome grant. Idempotent via the ledger, not a flag on the user. */
  async grantSignupBonus(userId: string): Promise<void> {
    const existing = await this.prisma.creditLedger.findFirst({
      where: { userId, reason: CreditReason.SIGNUP_BONUS },
      select: { id: true },
    });
    if (existing) return;

    try {
      await this.prisma.$transaction((tx) =>
        this.move(tx, userId, SIGNUP_BONUS, CreditReason.SIGNUP_BONUS),
      );
      this.logger.log(`Signup bonus of ${SIGNUP_BONUS} granted to ${userId}`);
    } catch (err) {
      // Never block sign-in over a promotional grant.
      this.logger.error(`Signup bonus failed for ${userId}: ${(err as Error).message}`);
    }
  }

  /**
   * Spend a credit to reveal who someone is.
   *
   * The Reveal row and the debit share a transaction, so a crash between them
   * cannot charge without revealing, or reveal without charging. Re-revealing
   * the same person is free and returns quietly — the unique constraint means
   * the second attempt is a no-op, not an error the user has to understand.
   */
  async reveal(userId: string, revealedId: string) {
    if (userId === revealedId) throw new BadRequestException("You can't reveal yourself");

    const already = await this.prisma.reveal.findUnique({
      where: { userId_revealedId: { userId, revealedId } },
      select: { id: true },
    });
    if (already) {
      const { credits } = await this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { credits: true },
      });
      return { revealed: true, charged: false, credits };
    }

    const target = await this.prisma.user.findUnique({
      where: { id: revealedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    const credits = await this.prisma.$transaction(async (tx) => {
      await tx.reveal.create({ data: { userId, revealedId } });
      return this.move(tx, userId, -CREDIT_COSTS.REVEAL, CreditReason.SPEND_REVEAL, revealedId);
    });

    return { revealed: true, charged: true, credits };
  }

  /** Ids this user has already paid to see — used to unmask list responses. */
  async revealedIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.reveal.findMany({
      where: { userId },
      select: { revealedId: true },
    });
    return new Set(rows.map((r) => r.revealedId));
  }

  /**
   * Record and grant a verified Google Play purchase.
   *
   * `purchaseToken` is unique, so this is safe to call repeatedly: a duplicate
   * returns the original result instead of granting again.
   */
  async redeemPurchase(input: {
    userId: string;
    productId: string;
    purchaseToken: string;
    credits: number;
    raw?: Prisma.InputJsonValue;
  }) {
    const existing = await this.prisma.purchase.findUnique({
      where: { purchaseToken: input.purchaseToken },
      select: { id: true, userId: true, state: true, credits: true },
    });

    if (existing) {
      // A token belongs to whoever redeemed it first. Seeing it again under a
      // different account means a shared or replayed token, not a second sale.
      if (existing.userId !== input.userId) {
        throw new ConflictException('This purchase has already been redeemed');
      }
      const { credits } = await this.prisma.user.findUniqueOrThrow({
        where: { id: input.userId },
        select: { credits: true },
      });
      return { granted: false, credits, purchaseId: existing.id };
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.create({
        data: {
          userId: input.userId,
          productId: input.productId,
          purchaseToken: input.purchaseToken,
          credits: input.credits,
          state: PurchaseState.VERIFIED,
          raw: input.raw,
        },
      });
      const balance = await this.move(
        tx,
        input.userId,
        input.credits,
        CreditReason.PURCHASE,
        purchase.id,
      );
      return { purchaseId: purchase.id, balance };
    });

    this.logger.log(
      `Purchase ${input.productId} granted ${input.credits} credits to ${input.userId}`,
    );
    return { granted: true, credits: result.balance, purchaseId: result.purchaseId };
  }

  /** Admin correction or goodwill refund. Always leaves a ledger trail. */
  async adjust(userId: string, delta: number, note?: string) {
    const balance = await this.prisma.$transaction((tx) =>
      this.move(
        tx,
        userId,
        delta,
        delta >= 0 ? CreditReason.ADMIN_ADJUST : CreditReason.ADMIN_ADJUST,
        note,
      ),
    );
    return { userId, credits: balance };
  }
}
