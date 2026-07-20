import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreditsService } from './credits.service';
import { PlayBillingService } from './play-billing.service';
import {
  CaptureOrderDto,
  CreateOrderDto,
  PurchaseDto,
  RevealDto,
} from './dto/credits.dto';
import { CheckoutService } from './checkout.service';
import { PayProvider } from '@prisma/client';

@ApiTags('credits')
@ApiBearerAuth()
@Controller('credits')
export class CreditsController {
  constructor(
    private readonly credits: CreditsService,
    private readonly play: PlayBillingService,
    private readonly config: ConfigService,
    private readonly checkout: CheckoutService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current balance and what each action costs' })
  balance(@CurrentUser('id') userId: string) {
    return this.credits.balance(userId);
  }

  @Get('history')
  @ApiOperation({ summary: 'Recent ledger entries for this user' })
  history(@CurrentUser('id') userId: string) {
    return this.credits.history(userId);
  }

  @Get('packs')
  @ApiOperation({ summary: 'Purchasable credit packs, for the store screen' })
  packs() {
    return {
      packs: this.checkout.packs(),
      // The client uses these to decide which buttons to show, rather than
      // guessing and failing at capture time.
      testCheckoutEnabled: this.checkout.dummyAllowed,
      playBillingEnabled: this.play.enabled,
    };
  }

  @Get('orders')
  @ApiOperation({ summary: 'Checkout history for this user' })
  orders(@CurrentUser('id') userId: string) {
    return this.checkout.orders(userId);
  }

  @Post('checkout')
  @ApiOperation({ summary: 'Open an order for a credit pack' })
  createOrder(@CurrentUser('id') userId: string, @Body() dto: CreateOrderDto) {
    // Only the test rail for now; PayPal registers here when it lands.
    return this.checkout.createOrder(userId, dto.productId, PayProvider.DUMMY);
  }

  @Post('checkout/capture')
  @ApiOperation({ summary: 'Complete an order and grant its credits' })
  captureOrder(@CurrentUser('id') userId: string, @Body() dto: CaptureOrderDto) {
    return this.checkout.captureOrder(userId, dto.orderId, dto.approve ?? true);
  }

  @Post('reveal')
  @ApiOperation({ summary: 'Spend a credit to reveal who someone is' })
  reveal(@CurrentUser('id') userId: string, @Body() dto: RevealDto) {
    return this.credits.reveal(userId, dto.userId);
  }

  @Post('purchase')
  @ApiOperation({ summary: 'Redeem a Google Play purchase; verified server-side' })
  async purchase(@CurrentUser('id') userId: string, @Body() dto: PurchaseDto) {
    const verified = await this.play.verifyProduct(dto.productId, dto.purchaseToken);
    if (!verified.ok) throw new BadRequestException(verified.reason);

    // Price from our own catalogue keyed on the product Google confirmed, never
    // from anything the client sent.
    const packs = (this.config.get('play.packs') ?? []) as { productId: string; credits: number }[];
    const pack = packs.find((p) => p.productId === verified.productId);
    if (!pack) throw new BadRequestException('Unknown product');

    const result = await this.credits.redeemPurchase({
      userId,
      productId: verified.productId,
      purchaseToken: dto.purchaseToken,
      credits: pack.credits,
      raw: verified.raw as never,
    });

    // Only after the grant has committed. See PlayBillingService.consume.
    if (result.granted) {
      void this.play.consume(verified.productId, dto.purchaseToken);
    }

    return result;
  }
}
