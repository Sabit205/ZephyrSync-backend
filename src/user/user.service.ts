import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

  // ─── Profile ──────────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, image: true, username: true,
        bio: true, country: true, website: true, accountType: true,
        createdAt: true,
        _count: {
          select: {
            sentRequests: { where: { status: 'ACCEPTED' } },
            receivedRequests: { where: { status: 'ACCEPTED' } },
            followers: true,
            following: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const friendCount = user._count.sentRequests + user._count.receivedRequests;
    return {
      ...user,
      _count: undefined,
      friendCount,
      followerCount: user._count.followers,
      followingCount: user._count.following,
    };
  }

  async updateMe(userId: string, data: {
    name?: string;
    bio?: string;
    country?: string;
    website?: string;
    image?: string;
    accountType?: 'PERSONAL' | 'PAGE';
  }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, name: true, image: true, username: true,
        bio: true, country: true, website: true, accountType: true,
      },
    });
  }

  async getProfileByUsername(username: string, currentUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true, name: true, image: true, username: true,
        bio: true, country: true, website: true, accountType: true,
        createdAt: true,
        _count: {
          select: {
            sentRequests: { where: { status: 'ACCEPTED' } },
            receivedRequests: { where: { status: 'ACCEPTED' } },
            followers: true,
            following: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const friendCount = user._count.sentRequests + user._count.receivedRequests;

    // Determine relationship status
    let relationshipStatus: string = 'NONE';

    if (user.id === currentUserId) {
      relationshipStatus = 'SELF';
    } else if (user.accountType === 'PAGE') {
      const follow = await this.prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } },
      });
      relationshipStatus = follow ? 'FOLLOWING' : 'NONE';
    } else {
      // Check for friend request in either direction
      const request = await this.prisma.friendRequest.findFirst({
        where: {
          OR: [
            { senderId: currentUserId, receiverId: user.id },
            { senderId: user.id, receiverId: currentUserId },
          ],
        },
      });
      if (request) {
        if (request.status === 'ACCEPTED') {
          relationshipStatus = 'FRIENDS';
        } else if (request.status === 'PENDING') {
          relationshipStatus = request.senderId === currentUserId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED';
        }
      }
    }

    return {
      ...user,
      _count: undefined,
      friendCount,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      relationshipStatus,
    };
  }

  // ─── Search ───────────────────────────────────────────────

  async searchUsers(query: string, currentUserId: string) {
    if (!query || query.trim().length < 2) return [];

    const users = await this.prisma.user.findMany({
      where: {
        AND: [
          { onboardingCompleted: true },
          { id: { not: currentUserId } },
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { username: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      select: {
        id: true, name: true, image: true, username: true,
        bio: true, accountType: true,
      },
      take: 20,
    });

    return Promise.all(
      users.map(async (user) => {
        let relationshipStatus = 'NONE';
        let requestId: string | null = null;

        if (user.accountType === 'PAGE') {
          const follow = await this.prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: currentUserId, followingId: user.id } },
          });
          relationshipStatus = follow ? 'FOLLOWING' : 'NONE';
        } else {
          const request = await this.prisma.friendRequest.findFirst({
            where: {
              OR: [
                { senderId: currentUserId, receiverId: user.id },
                { senderId: user.id, receiverId: currentUserId },
              ],
            },
          });
          if (request) {
            requestId = request.id;
            if (request.status === 'ACCEPTED') {
              relationshipStatus = 'FRIENDS';
            } else if (request.status === 'PENDING') {
              relationshipStatus = request.senderId === currentUserId ? 'REQUEST_SENT' : 'REQUEST_RECEIVED';
            }
          }
        }
        return { ...user, relationshipStatus, requestId };
      }),
    );
  }

  // ─── Friend System (PERSONAL accounts) ───────────────────

  async sendFriendRequest(senderId: string, receiverId: string) {
    if (senderId === receiverId) throw new BadRequestException('Cannot send friend request to yourself');

    const receiver = await this.prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) throw new NotFoundException('User not found');
    if (receiver.accountType !== 'PERSONAL') throw new BadRequestException('Cannot send friend request to a page account. Use follow instead.');

    // Check for existing request in either direction
    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') throw new BadRequestException('Already friends');
      if (existing.status === 'PENDING') throw new BadRequestException('Friend request already pending');
      // If rejected, allow re-sending by deleting the old one
      if (existing.status === 'REJECTED') {
        await this.prisma.friendRequest.delete({ where: { id: existing.id } });
      }
    }

    return this.prisma.friendRequest.create({
      data: { senderId, receiverId },
      include: {
        receiver: { select: { id: true, name: true, username: true, image: true } },
      },
    });
  }

  async acceptFriendRequest(requestId: string, userId: string) {
    const request = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Friend request not found');
    if (request.receiverId !== userId) throw new BadRequestException('You can only accept requests sent to you');
    if (request.status !== 'PENDING') throw new BadRequestException('Request is no longer pending');

    return this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' },
    });
  }

  async rejectFriendRequest(requestId: string, userId: string) {
    const request = await this.prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException('Friend request not found');
    if (request.receiverId !== userId) throw new BadRequestException('You can only reject requests sent to you');
    if (request.status !== 'PENDING') throw new BadRequestException('Request is no longer pending');

    return this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' },
    });
  }

  async unfriend(userId: string, friendId: string) {
    const request = await this.prisma.friendRequest.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId },
        ],
      },
    });
    if (!request) throw new BadRequestException('You are not friends with this user');

    return this.prisma.friendRequest.delete({ where: { id: request.id } });
  }

  async getPendingRequests(userId: string) {
    return this.prisma.friendRequest.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: {
        sender: { select: { id: true, name: true, username: true, image: true, bio: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFriends(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: { id: true, name: true, username: true, image: true, bio: true, accountType: true } },
        receiver: { select: { id: true, name: true, username: true, image: true, bio: true, accountType: true } },
      },
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });

    return requests.map((r) => r.senderId === userId ? r.receiver : r.sender);
  }

  // ─── Follow System (PAGE accounts) ────────────────────────

  async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) throw new BadRequestException('Cannot follow yourself');

    const target = await this.prisma.user.findUnique({ where: { id: followingId } });
    if (!target) throw new NotFoundException('User not found');
    if (target.accountType !== 'PAGE') throw new BadRequestException('Can only follow page accounts. Use friend request for personal accounts.');

    const existing = await this.prisma.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    });

    if (existing) {
      // Unfollow
      await this.prisma.follow.delete({ where: { id: existing.id } });
      return { followed: false };
    }

    // Follow
    await this.prisma.follow.create({ data: { followerId, followingId } });
    return { followed: true };
  }

  async getFollowers(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const follows = await this.prisma.follow.findMany({
      where: { followingId: userId },
      include: {
        follower: { select: { id: true, name: true, username: true, image: true, bio: true, accountType: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return follows.map((f) => f.follower);
  }

  async getFollowing(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      include: {
        following: { select: { id: true, name: true, username: true, image: true, bio: true, accountType: true } },
      },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
    return follows.map((f) => f.following);
  }
}
