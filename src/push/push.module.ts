import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PushController } from './push.controller';

// Global for the same reason as MailModule: matches and chat both need to send,
// and one cached service-account JWT is shared across them.
@Global()
@Module({
  providers: [PushService],
  controllers: [PushController],
  exports: [PushService],
})
export class PushModule {}
