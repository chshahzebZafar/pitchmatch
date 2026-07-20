import { Global, Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { CreditsController } from './credits.controller';
import { PlayBillingService } from './play-billing.service';

// Global: discovery needs revealedIds to mask the "Likes you" list, and auth
// needs the signup grant.
@Global()
@Module({
  providers: [CreditsService, PlayBillingService],
  controllers: [CreditsController],
  exports: [CreditsService],
})
export class CreditsModule {}
