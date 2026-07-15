import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import { CHAT_DIR } from '../media/storage';

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

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

  @Post(':id/attachment')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Send an image attachment (multipart field: image)' })
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: CHAT_DIR,
        filename: (_req, file, cb) => {
          const ext = MIME_EXT[file.mimetype] || extname(file.originalname) || '.jpg';
          cb(null, `${randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (MIME_EXT[file.mimetype]) cb(null, true);
        else cb(new BadRequestException('Only JPG, PNG or WebP images are allowed'), false);
      },
    }),
  )
  sendAttachment(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No image provided');
    return this.chat.sendAttachment(userId, id, file.filename);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark the conversation read' })
  read(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.chat.markRead(userId, id);
  }
}
