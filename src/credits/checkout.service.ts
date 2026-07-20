import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayProvider, PurchaseState } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from './credits.service';

/**
 * Provider-agnostic checkout.
 *
 * Shaped around the two-step flow every real processor uses — create an order,
 * then capture it after the buyer approves — so PayPal slots in by implementing
 * `createOrder` / `captureOrder` without touching the endpoints, the ledger, or
 * the client.
 *
 * The dummy provider settles instantly and is the reason for the guard below.
 */

export interface CreditPack {
  productId: string;
  credits: number;
  /** Minor units (cents/paisa) so no float ever touches a price. */
  priceMinor: number;
  currency: string;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly credits: CreditsService,
  ) {}

  /**
   * The dummy provider grants credits for free. That is correct for testing and
   * catastrophic in production, where it is an open faucet for anyone who can
   * call the API. So it is off unless explicitly switched on, and it refuses to
   * switch on when NODE_ENV is production.
   */
  get dummyAllowed(): boolean {
    const flag = this.config.get<string>('payments.allowDummy') === 'true';
    const prod = this.config.get<string>('payments.nodeEnv') === 'production';
    return flag && !prod;
  }

  packs(): CreditPack[] {
    return (this.config.get<CreditPack[]>('payments.packs') ?? []).slice();
  }

  private pack(productId: string): CreditPack {
    const found = this.packs().find((p) => p.productId === productId);
    if (!found) throw new NotFoundException('Unknown credit pack');
    return found;
  }

  /**
   * Step 1 — create a pending order.
   *
   * The row is written before the buyer pays, so an abandoned checkout leaves a
   * PENDING record rather than nothing. That is what makes "they say they paid
   * and got no credits" answerable.
   */
  async createOrder(userId: string, productId: string, provider: PayProvider) {
    if (provider === PayProvider.DUMMY && !this.dummyAllowed) {
      throw new ForbiddenException('Test checkout is disabled on this server');
    }
    if (provider === PayProvider.PAYPAL) {
      throw new BadRequestException('PayPal is not configured yet');
    }

    const pack = this.pack(productId);
    // A real provider returns its own order id here; the dummy mints one so the
    // shape of the flow is identical either way.
    const orderId = `dummy_${randomUUID()}`;

    const purchase = await this.prisma.purchase.create({
      data: {
        userId,
        provider,
        productId: pack.productId,
        purchaseToken: orderId,
        credits: pack.credits,
        state: PurchaseState.PENDING,
        raw: { priceMinor: pack.priceMinor, currency: pack.currency },
      },
    });

    this.logger.log(`Checkout opened: ${provider} ${pack.productId} for ${userId}`);

    return {
      orderId,
      purchaseId: purchase.id,
      productId: pack.productId,
      credits: pack.credits,
      priceMinor: pack.priceMinor,
      currency: pack.currency,
      /** A real provider returns a URL to send the buyer to. */
      approvalUrl: null as string | null,
      provider,
    };
  }

  /**
   * Step 2 — capture, and grant on success.
   *
   * With a real provider this is where the processor is asked whether the money
   * actually moved. The dummy skips that, which is precisely why it is gated.
   *
   * Idempotent: the grant runs through CreditsService.redeemPurchase, keyed on
   * the unique purchaseToken, so a double-tapped Pay button grants once.
   */
  async captureOrder(userId: string, orderId: string, approve = true) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { purchaseToken: orderId },
    });
    if (!purchase) throw new NotFoundException('Order not found');
    if (purchase.userId !== userId) {
      // Do not confirm that someone else's order exists.
      throw new NotFoundException('Order not found');
    }

    if (purchase.state === PurchaseState.VERIFIED) {
      const { credits } = await this.credits.balance(userId);
      return { status: 'already_captured', credits, credited: purchase.credits };
    }
    if (purchase.state === PurchaseState.REJECTED) {
      throw new BadRequestException('This order was cancelled');
    }

    if (purchase.provider === PayProvider.DUMMY && !this.dummyAllowed) {
      throw new ForbiddenException('Test checkout is disabled on this server');
    }

    // Simulated failure path, so the client's error handling is exercised
    // rather than assumed.
    if (!approve) {
      await this.prisma.purchase.update({
        where: { id: purchase.id },
        data: { state: PurchaseState.REJECTED },
      });
      return { status: 'cancelled', credits: (await this.credits.balance(userId)).credits };
    }

    // Delete the PENDING row and let redeemPurchase write the VERIFIED one, so
    // the grant and the record stay in the single place that owns idempotency.
    await this.prisma.purchase.delete({ where: { id: purchase.id } });

    const result = await this.credits.redeemPurchase({
      userId,
      productId: purchase.productId,
      purchaseToken: orderId,
      credits: purchase.credits,
      provider: purchase.provider,
      raw: (purchase.raw ?? undefined) as never,
    });

    this.logger.log(`Checkout captured: ${orderId} -> ${purchase.credits} credits for ${userId}`);

    return {
      status: result.granted ? 'captured' : 'already_captured',
      credits: result.credits,
      credited: purchase.credits,
    };
  }

  /** Orders this user has opened, newest first — a receipts list. */
  async orders(userId: string) {
    return this.prisma.purchase.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        provider: true,
        productId: true,
        credits: true,
        state: true,
        createdAt: true,
      },
    });
  }
}
