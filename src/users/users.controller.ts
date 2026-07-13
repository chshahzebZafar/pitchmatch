import { Body, Controller, Delete, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateMeDto } from './dto/update-me.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get the authenticated user' })
  getMe(@CurrentUser('id') userId: string) {
    return this.users.getMe(userId);
  }

  @Put()
  @ApiOperation({ summary: 'Update the authenticated user' })
  updateMe(@CurrentUser('id') userId: string, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(userId, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Delete the authenticated account (soft delete)' })
  deleteMe(@CurrentUser('id') userId: string) {
    return this.users.softDelete(userId);
  }
}
