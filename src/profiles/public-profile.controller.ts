import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ProfilesService } from './profiles.service';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('users')
export class PublicProfileController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get(':id')
  @ApiOperation({ summary: "Another user's full profile (no email/phone)" })
  get(@CurrentUser('id') viewerId: string, @Param('id') id: string) {
    return this.profiles.getPublicProfile(viewerId, id);
  }
}
