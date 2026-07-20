import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreditsService } from './credits.service';
import { PlayBillingService } from './play-billing.service';
import { PurchaseDto, RevealDto } from './dto/credits.dto';

@ApiTags('credits')
@ApiBearerAuth()
@Controller('credits')
export class CreditsController {
  constructor(
    private readonly credits: CreditsService,
    private readonly play: PlayBillingService,
    private readonly config: ConfigService,
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
    return { packs: this.config.get('play.packs') ?? [], billingEnabled: this.play.enabled };
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
