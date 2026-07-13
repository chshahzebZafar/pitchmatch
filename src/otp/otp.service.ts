import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_ATTEMPTS = 5;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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

    await this.send(channel, userId, code);
    return { expiresAt };
  }

  /**
   * Deliver the OTP. TODO(M1): wire an SMTP provider for EMAIL and an SMS
   * provider for PHONE. For now the code is logged so the flow is testable
   * end-to-end without any third-party account.
   */
  private async send(channel: OtpChannel, userId: string, code: string) {
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
