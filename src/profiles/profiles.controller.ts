import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { ProfilesService } from './profiles.service';
import { InvestorProfileDto } from './dto/investor-profile.dto';
import { InnovatorProfileDto } from './dto/innovator-profile.dto';
import { MediatorProfileDto } from './dto/mediator-profile.dto';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller('me/profile')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's role-specific profile" })
  getMine(@CurrentUser() user: AuthUser) {
    return this.profiles.getMyProfile(user.id, user.role as any);
  }

  @Put('investor')
  @ApiOperation({ summary: 'Create or update the investor profile' })
  putInvestor(@CurrentUser() user: AuthUser, @Body() dto: InvestorProfileDto) {
    return this.profiles.upsertInvestor(user.id, user.role as any, dto);
  }

  @Put('innovator')
  @ApiOperation({ summary: 'Create or update the innovator profile' })
  putInnovator(@CurrentUser() user: AuthUser, @Body() dto: InnovatorProfileDto) {
    return this.profiles.upsertInnovator(user.id, user.role as any, dto);
  }

  @Put('mediator')
  @ApiOperation({ summary: 'Create or update the mediator profile (stays pending verification)' })
  putMediator(@CurrentUser() user: AuthUser, @Body() dto: MediatorProfileDto) {
    return this.profiles.upsertMediator(user.id, user.role as any, dto);
  }
}
