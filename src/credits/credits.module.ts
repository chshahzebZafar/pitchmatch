import { Global, Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { PlayBillingService } from './play-billing.service';
import { CheckoutService } from './checkout.service';

// Global: discovery needs revealedIds to mask the "Likes you" list, and auth
// needs the signup grant.
@Global()
@Module({
  providers: [CreditsService, PlayBillingService, CheckoutService],
  controllers: [CreditsController],
  exports: [CreditsService],
})
export class CreditsModule {}
