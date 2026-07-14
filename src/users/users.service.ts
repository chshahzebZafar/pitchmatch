import { Injectable, NotFoundException } from '@nestjs/common';
import { User, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateMeDto } from './dto/update-me.dto';
import { avatarUrl } from '../media/storage';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { ...dto },
    });
    return this.sanitize(user);
  }

  async setPhoto(userId: string, filename: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { photoUrl: avatarUrl(filename) },
    });
    return this.sanitize(user);
  }

  /** Soft delete (Google Play requires in-app account deletion) + revoke sessions. */
  async softDelete(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.DELETED },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Account deleted' };
  }

  private sanitize(user: User) {
    const { passwordHash, ...safe } = user;
    return safe;
  }
}
