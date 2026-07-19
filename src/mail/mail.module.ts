import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

// Global: OTP mail is needed from auth today and will be needed from matches
// and chat notifications later; a single shared transporter (and one pooled
// SMTP connection) is the point.
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
