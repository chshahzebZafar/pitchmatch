import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [SafetyModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
