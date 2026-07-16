import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role, SwipeDirection } from '@prisma/client';
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

  @Get('interested')
  @ApiOperation({ summary: "People who swiped right on me and I haven't answered yet" })
  interested(@CurrentUser() user: AuthUser) {
    return this.discovery.interestedInMe(user.id, user.role as Role);
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

  @Get('swipes')
  @ApiOperation({ summary: 'List my swipes in a direction (LEFT = passed, RIGHT = interested)' })
  history(@CurrentUser() user: AuthUser, @Query('direction') direction?: string) {
    const dir = direction === 'RIGHT' ? SwipeDirection.RIGHT : SwipeDirection.LEFT;
    return this.discovery.swipeHistory(user.id, dir);
  }

  @Delete('swipes/:targetId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Undo one swipe (target returns to the deck)' })
  undo(@CurrentUser() user: AuthUser, @Param('targetId') targetId: string) {
    return this.discovery.undoSwipe(user.id, targetId);
  }

  @Delete('swipes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset my swipes + matches (brings the deck back)' })
  reset(@CurrentUser() user: AuthUser) {
    return this.discovery.reset(user.id);
  }
}
