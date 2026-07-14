import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { DiscoveryService } from './discovery.service';
import { SwipeDto } from './dto/swipe.dto';

@ApiTags('discovery')
@ApiBearerAuth()
@Controller()
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('feed')
  @ApiOperation({ summary: 'Ranked, paginated discovery deck for the opposite role' })
  feed(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.discovery.feed(
      user.id,
      user.role as Role,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post('swipes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a swipe; returns { matched } (and matchId on a mutual right)' })
  swipe(@CurrentUser() user: AuthUser, @Body() dto: SwipeDto) {
    return this.discovery.swipe(user.id, dto.targetId, dto.direction);
  }

  @Get('matches')
  @ApiOperation({ summary: 'List the current user’s matches' })
  matches(@CurrentUser() user: AuthUser) {
    return this.discovery.matches(user.id);
  }
}
