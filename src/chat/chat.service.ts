import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async getConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        users: { some: { id: userId } }
      },
      include: {
        users: {
          where: { id: { not: userId } },
          select: { id: true, name: true, username: true, image: true }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async getOrCreateConversation(userId: string, otherUserId: string) {
    // We need to find a 1-on-1 conversation with EXACTLY these two users.
    // Prisma's `every` on a many-to-many isn't always perfect for exact match of length 2, but we can do a more robust query.
    const userConvs = await this.prisma.conversation.findMany({
      where: {
        isGroup: false,
        users: { some: { id: userId } }
      },
      include: { users: true }
    });

    let conv = userConvs.find(c => c.users.length === 2 && c.users.some(u => u.id === otherUserId));

    if (!conv) {
      conv = await this.prisma.conversation.create({
        data: {
          users: { connect: [{ id: userId }, { id: otherUserId }] }
        },
        include: { users: true }
      });
    }

    return this.prisma.conversation.findUnique({
      where: { id: conv.id },
      include: {
        users: {
          where: { id: { not: userId } },
          select: { id: true, name: true, username: true, image: true }
        }
      }
    });
  }

  async getMessages(conversationId: string, userId: string) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, users: { some: { id: userId } } }
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    return this.prisma.message.findMany({
      where: { conversationId },
      include: { sender: { select: { id: true, name: true, username: true, image: true } } },
      orderBy: { createdAt: 'asc' }
    });
  }

  async sendMessage(userId: string, conversationId: string, content: string) {
    const msg = await this.prisma.message.create({
      data: {
        content,
        senderId: userId,
        conversationId
      },
      include: { sender: { select: { id: true, name: true, username: true, image: true } } }
    });
    
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() }
    });

    return msg;
  }
}
