import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Map to store userId -> Set of socketIds
  private userSockets = new Map<string, Set<string>>();

  constructor(private chatService: ChatService) {}

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId) {
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      
      // Optionally broadcast user status
      this.server.emit('userStatus', { userId, status: 'online' });
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.handshake.query.userId as string;
    if (userId && this.userSockets.has(userId)) {
      this.userSockets.get(userId)!.delete(client.id);
      if (this.userSockets.get(userId)!.size === 0) {
        this.userSockets.delete(userId);
        this.server.emit('userStatus', { userId, status: 'offline' });
      }
    }
  }

  @SubscribeMessage('sendMessage')
  async handleSendMessage(
    @MessageBody() payload: { conversationId: string; content: string; receiverIds: string[] },
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.handshake.query.userId as string;
    if (!senderId) return;

    try {
      const message = await this.chatService.sendMessage(senderId, payload.conversationId, payload.content);

      // Emit to sender's other sockets and receiver's sockets
      const userIdsToNotify = new Set([senderId, ...payload.receiverIds]);
      
      userIdsToNotify.forEach((uid) => {
        const sockets = this.userSockets.get(uid);
        if (sockets) {
          sockets.forEach((socketId) => {
            this.server.to(socketId).emit('newMessage', message);
          });
        }
      });
    } catch (e) {
      console.error('Error sending message via socket:', e);
    }
  }
}
