import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const MAX_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /** Cryptographically-secure numeric code, zero-padded to `length`. */
  private generateCode(length: number): string {
    const max = 10 ** length;
    return randomInt(0, max).toString().padStart(length, '0');
  }

  /**
   * Issue a fresh OTP for a user, invalidating any previous unconsumed codes
   * for the same purpose, and dispatch it via the channel.
   */
  async issue(
    userId: string,
    channel: OtpChannel,
    purpose: OtpPurpose = OtpPurpose.REGISTRATION,
  ): Promise<{ expiresAt: Date }> {
    const length = this.config.get<number>('otp.length') ?? 6;
    const ttl = this.config.get<number>('otp.ttlSeconds') ?? 300;
    const code = this.generateCode(length);
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await this.prisma.otpCode.updateMany({
      where: { userId, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    await this.prisma.otpCode.create({
      data: { userId, channel, purpose, codeHash, expiresAt },
    });

    await this.send(channel, userId, code, purpose, Math.max(1, Math.round(ttl / 60)));
    return { expiresAt };
  }

  /**
   * Deliver the OTP.
   *
   * EMAIL goes over SMTP. Delivery failures are deliberately not fatal: by this
   * point the user row and the OTP row both exist, so throwing would 500 a
   * signup that actually succeeded and strand the account. Instead we fall back
   * to logging the code — the operator can still read it out of the server log,
   * and "resend" retries the send.
   *
   * TODO: PHONE still has no SMS provider and always falls through to the log.
   */
  private async send(
    channel: OtpChannel,
    userId: string,
    code: string,
    purpose: OtpPurpose,
    ttlMinutes: number,
  ) {
    if (channel === OtpChannel.EMAIL && this.mail.enabled) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });

      if (user) {
        const sent = await this.mail.sendOtp({
          to: user.email,
          name: user.name,
          code,
          ttlMinutes,
          purpose,
        });
        if (sent) return;
        this.logger.warn(`Email delivery failed for user=${userId}; falling back to log.`);
      }
    }

    this.logger.log(`[OTP:${channel}] user=${userId} code=${code}`);
  }

  /** Verify the latest unconsumed OTP; consumes it on success, counts attempts on failure. */
  async verify(
    userId: string,
    code: string,
    purpose: OtpPurpose = OtpPurpose.REGISTRATION,
  ): Promise<boolean> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) return false;
    if (otp.expiresAt < new Date()) return false;
    if (otp.attempts >= MAX_ATTEMPTS) return false;

    const ok = await bcrypt.compare(code, otp.codeHash);
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: ok ? { consumedAt: new Date() } : { attempts: { increment: 1 } },
    });
    return ok;
  }
}
