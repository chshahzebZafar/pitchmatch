import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SafetyService } from './safety.service';
import { BlockDto, ReportDto } from './dto/safety.dto';

@ApiTags('safety')
@ApiBearerAuth()
@Controller()
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Post('blocks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a user (hides them, closes the match/chat)' })
  block(@CurrentUser('id') userId: string, @Body() dto: BlockDto) {
    return this.safety.block(userId, dto.targetId);
  }

  @Delete('blocks/:targetId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user' })
  unblock(@CurrentUser('id') userId: string, @Param('targetId') targetId: string) {
    return this.safety.unblock(userId, targetId);
  }

  @Get('blocks')
  @ApiOperation({ summary: 'List users I have blocked' })
  list(@CurrentUser('id') userId: string) {
    return this.safety.listBlocks(userId);
  }

  @Post('reports')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Report a user' })
  report(@CurrentUser('id') userId: string, @Body() dto: ReportDto) {
    return this.safety.report(userId, dto.targetId, dto.reason, dto.details);
  }
}
