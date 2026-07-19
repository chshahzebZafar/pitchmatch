import { Body, Controller, Delete, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Platform } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PushService } from './push.service';
import { PushTokenDto } from './dto/push-token.dto';

@ApiTags('push')
@ApiBearerAuth()
@Controller('me/push-token')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Post()
  @ApiOperation({ summary: 'Register this device for push' })
  register(@CurrentUser('id') userId: string, @Body() dto: PushTokenDto) {
    return this.push.registerToken(
      userId,
      dto.token,
      dto.platform === 'ios' ? Platform.IOS : Platform.ANDROID,
    );
  }

  @Delete()
  @ApiOperation({ summary: 'Detach this device (called on logout)' })
  remove(@CurrentUser('id') userId: string, @Body() dto: PushTokenDto) {
    return this.push.removeToken(userId, dto.token);
  }
}
