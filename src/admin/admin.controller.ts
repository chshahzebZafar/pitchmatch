import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MediatorVerificationStatus, ReportStatus, Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { MediatorDecisionDto, ReportDecisionDto, UserStatusDto } from './dto/admin.dto';

/**
 * Admin surface.
 *
 * Every route is ADMIN-only. Admins cannot self-register (see
 * prisma/seed-admin.ts), so the role cannot be obtained through the API.
 *
 * There is no admin web app yet; these are driven from Swagger at
 * /api/v1/docs with an admin bearer token, which is enough to unblock
 * mediator approval and report review.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard counts, action-required queues first' })
  stats() {
    return this.admin.stats();
  }

  @Get('mediators')
  @ApiOperation({ summary: 'Mediators awaiting (or past) credential review' })
  @ApiQuery({ name: 'status', enum: MediatorVerificationStatus, required: false })
  listMediators(@Query('status') status?: MediatorVerificationStatus) {
    return this.admin.listMediators(status ?? MediatorVerificationStatus.PENDING);
  }

  @Post('mediators/:userId/verification')
  @ApiOperation({ summary: 'Approve or reject a mediator; approval activates the account' })
  decideMediator(@Param('userId') userId: string, @Body() dto: MediatorDecisionDto) {
    return this.admin.decideMediator(userId, dto.status, dto.note);
  }

  @Get('reports')
  @ApiOperation({ summary: 'Abuse reports, oldest first, with repeat-offender counts' })
  @ApiQuery({ name: 'status', enum: ReportStatus, required: false })
  listReports(@Query('status') status?: ReportStatus) {
    return this.admin.listReports(status);
  }

  @Post('reports/:id/status')
  @ApiOperation({ summary: 'Action or dismiss a report' })
  decideReport(@Param('id') id: string, @Body() dto: ReportDecisionDto) {
    return this.admin.decideReport(id, dto.status);
  }

  @Post('users/:userId/status')
  @ApiOperation({ summary: 'Suspend or reinstate a user; suspension ends their sessions' })
  setUserStatus(@Param('userId') userId: string, @Body() dto: UserStatusDto) {
    return this.admin.setUserStatus(userId, dto.status);
  }
}
