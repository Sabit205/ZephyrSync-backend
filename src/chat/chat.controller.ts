import { Controller, Get, Param, Post, Body, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ChatService } from './chat.service';

@Controller('api/chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  async getConversations(@Req() req: any) {
    return this.chatService.getConversations(req.user.id);
  }

  @Post('conversations/direct')
  async getOrCreateDirectConversation(@Req() req: any, @Body('userId') otherUserId: string) {
    return this.chatService.getOrCreateConversation(req.user.id, otherUserId);
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(@Param('conversationId') conversationId: string, @Req() req: any) {
    return this.chatService.getMessages(conversationId, req.user.id);
  }
}
