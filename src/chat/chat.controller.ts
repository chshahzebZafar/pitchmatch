import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('conversations')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiOperation({ summary: 'List my conversations (one per match) with last message + unread' })
  list(@CurrentUser('id') userId: string) {
    return this.chat.list(userId);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Messages in a conversation (poll with ?after=<lastId>)' })
  messages(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Query('after') after?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chat.messages(
      userId,
      id,
      after ? parseInt(after, 10) : undefined,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Send a message' })
  send(@CurrentUser('id') userId: string, @Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.chat.send(userId, id, dto.body);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark the conversation read' })
  read(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.chat.markRead(userId, id);
  }
}
