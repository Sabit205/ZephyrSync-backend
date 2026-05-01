import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PostService {
  constructor(private prisma: PrismaService) {}

  // ─── Create Post ─────────────────────────────────────────

  async createPost(authorId: string, data: { content: string; image?: string }) {
    return this.prisma.post.create({
      data: {
        content: data.content,
        image: data.image,
        authorId,
      },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        _count: { select: { likes: true, comments: true } },
      },
    });
  }

  // ─── Get Feed ────────────────────────────────────────────
  // Shows posts from: yourself, your friends, and people you follow

  async getFeed(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Get IDs of friends (accepted friend requests in both directions)
    const friendRequests = await this.prisma.friendRequest.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: { senderId: true, receiverId: true },
    });

    const friendIds = friendRequests.map((r) =>
      r.senderId === userId ? r.receiverId : r.senderId,
    );

    // Get IDs of users you follow
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = follows.map((f) => f.followingId);

    // Combine: self + friends + following (unique)
    const feedUserIds = [...new Set([userId, ...friendIds, ...followingIds])];

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: { authorId: { in: feedUserIds } },
        include: {
          author: {
            select: { id: true, name: true, username: true, image: true },
          },
          _count: { select: { likes: true, comments: true } },
          likes: {
            where: { userId },
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({
        where: { authorId: { in: feedUserIds } },
      }),
    ]);

    return {
      posts: posts.map((post) => ({
        ...post,
        likedByMe: post.likes.length > 0,
        likes: undefined,
        likeCount: post._count.likes,
        commentCount: post._count.comments,
        _count: undefined,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Get User Posts ──────────────────────────────────────

  async getUserPosts(userId: string, currentUserId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const posts = await this.prisma.post.findMany({
      where: { authorId: userId },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        _count: { select: { likes: true, comments: true } },
        likes: {
          where: { userId: currentUserId },
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    return posts.map((post) => ({
      ...post,
      likedByMe: post.likes.length > 0,
      likes: undefined,
      likeCount: post._count.likes,
      commentCount: post._count.comments,
      _count: undefined,
    }));
  }

  // ─── Get Single Post ─────────────────────────────────────

  async getPost(postId: string, currentUserId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
        _count: { select: { likes: true, comments: true } },
        likes: {
          where: { userId: currentUserId },
          select: { id: true },
        },
      },
    });
    if (!post) throw new NotFoundException('Post not found');

    return {
      ...post,
      likedByMe: post.likes.length > 0,
      likes: undefined,
      likeCount: post._count.likes,
      commentCount: post._count.comments,
      _count: undefined,
    };
  }

  // ─── Delete Post ──────────────────────────────────────────

  async deletePost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) throw new ForbiddenException('You can only delete your own posts');

    return this.prisma.post.delete({ where: { id: postId } });
  }

  // ─── Like / Unlike ───────────────────────────────────────

  async toggleLike(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.prisma.like.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await this.prisma.like.delete({ where: { id: existing.id } });
      return { liked: false };
    }

    await this.prisma.like.create({ data: { postId, userId } });
    return { liked: true };
  }

  // ─── Comments ─────────────────────────────────────────────

  async addComment(postId: string, authorId: string, content: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    return this.prisma.comment.create({
      data: { content, postId, authorId },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
      },
    });
  }

  async getComments(postId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    return this.prisma.comment.findMany({
      where: { postId },
      include: {
        author: {
          select: { id: true, name: true, username: true, image: true },
        },
      },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    });
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== userId) throw new ForbiddenException('You can only delete your own comments');

    return this.prisma.comment.delete({ where: { id: commentId } });
  }
}
