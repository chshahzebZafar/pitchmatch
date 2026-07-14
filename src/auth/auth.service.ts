import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { OtpChannel, OtpPurpose, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from '../otp/otp.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly otp: OtpService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.role === Role.ADMIN) {
      throw new BadRequestException('Cannot self-register as admin');
    }

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });
    if (existing) {
      throw new ConflictException('Email or phone already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: dto.role,
        status: UserStatus.PENDING_VERIFICATION,
      },
    });

    await this.otp.issue(user.id, OtpChannel.EMAIL, OtpPurpose.REGISTRATION);

    return {
      message:
        'Registered. Verify the OTP sent to your email to activate your account.',
      userId: user.id,
    };
  }

  async verifyOtp(email: string, code: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('Invalid email or code');

    const ok = await this.otp.verify(user.id, code, OtpPurpose.REGISTRATION);
    if (!ok) throw new BadRequestException('Invalid or expired code');

    // Mediators still need manual admin approval before going ACTIVE.
    const nextStatus =
      user.role === Role.MEDIATOR
        ? UserStatus.PENDING_VERIFICATION
        : UserStatus.ACTIVE;

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, status: nextStatus },
    });

    return this.issueTokens(updated.id, updated.role);
  }

  async resendOtp(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Never reveal whether the account exists.
    if (user && !user.emailVerified) {
      await this.otp.issue(user.id, OtpChannel.EMAIL, OtpPurpose.REGISTRATION);
    }
    return {
      message: 'If the account exists and is unverified, a new code was sent.',
    };
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    if (user.status === UserStatus.DELETED) {
      throw new UnauthorizedException('Account not available');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException('Account suspended');
    }
    if (!user.emailVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    return this.issueTokens(user.id, user.role);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; role: Role };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, tokenHash, revokedAt: null },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotate: revoke the used token, issue a fresh pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(payload.sub, payload.role);
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Logged out' };
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Never reveal whether the account exists.
    if (user && user.status !== UserStatus.DELETED) {
      await this.otp.issue(user.id, OtpChannel.EMAIL, OtpPurpose.PASSWORD_RESET);
    }
    return {
      message: 'If an account exists for that email, a reset code has been sent.',
    };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('Invalid email or code');

    const ok = await this.otp.verify(user.id, code, OtpPurpose.PASSWORD_RESET);
    if (!ok) throw new BadRequestException('Invalid or expired code');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    // Recovery flow: revoke every existing session.
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Password updated. You can now log in with your new password.' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new BadRequestException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    return { message: 'Password changed.' };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async issueTokens(userId: string, role: Role): Promise<TokenPair> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: this.config.get<string>('jwt.accessTtl'),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      // jti guarantees every refresh token is unique, even if two are issued in
      // the same second for the same user (otherwise identical JWTs would collide
      // on the token_hash unique index).
      { sub: userId, role, jti: randomUUID() },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get<string>('jwt.refreshTtl'),
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }
}
