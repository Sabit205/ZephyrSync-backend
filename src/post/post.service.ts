import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const COMMENT_EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class PostService {
  constructor(private prisma: PrismaService) {}

  private readonly authorSelect = {
    id: true, name: true, username: true, image: true,
  };

  // ─── Create Post ─────────────────────────────────────────

  async createPost(authorId: string, data: { content: string; image?: string; visibility?: string }) {
    return this.prisma.post.create({
      data: {
        content: data.content,
        image: data.image,
        visibility: (data.visibility as any) || 'PUBLIC',
        authorId,
      },
      include: {
        author: { select: this.authorSelect },
        _count: { select: { reactions: true, comments: true } },
      },
    });
  }

  // ─── Edit Post ───────────────────────────────────────────

  async editPost(postId: string, userId: string, data: { content?: string; image?: string; visibility?: string }) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId) throw new ForbiddenException('You can only edit your own posts');

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        ...(data.content !== undefined && { content: data.content }),
        ...(data.image !== undefined && { image: data.image }),
        ...(data.visibility !== undefined && { visibility: data.visibility as any }),
      },
      include: {
        author: { select: this.authorSelect },
        _count: { select: { reactions: true, comments: true } },
      },
    });
  }

  // ─── Get Feed ────────────────────────────────────────────

  async getFeed(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    // Get friend IDs
    const friendRequests = await this.prisma.friendRequest.findMany({
      where: { status: 'ACCEPTED', OR: [{ senderId: userId }, { receiverId: userId }] },
      select: { senderId: true, receiverId: true },
    });
    const friendIds = friendRequests.map((r) => r.senderId === userId ? r.receiverId : r.senderId);

    // Get following IDs
    const follows = await this.prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const followingIds = follows.map((f) => f.followingId);

    const feedUserIds = [...new Set([userId, ...friendIds, ...followingIds])];

    // Build visibility filter: show posts where user is allowed to see
    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          authorId: { in: feedUserIds },
          OR: [
            { visibility: 'PUBLIC' },
            { visibility: 'FRIENDS', authorId: { in: [userId, ...friendIds] } },
            { visibility: 'ONLY_ME', authorId: userId },
          ],
        },
        include: {
          author: { select: this.authorSelect },
          _count: { select: { reactions: true, comments: true } },
          reactions: {
            where: { userId },
            select: { id: true, type: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.post.count({
        where: {
          authorId: { in: feedUserIds },
          OR: [
            { visibility: 'PUBLIC' },
            { visibility: 'FRIENDS', authorId: { in: [userId, ...friendIds] } },
            { visibility: 'ONLY_ME', authorId: userId },
          ],
        },
      }),
    ]);

    // Get reaction summaries for each post
    const postIds = posts.map((p) => p.id);
    const reactionSummaries = await this.prisma.reaction.groupBy({
      by: ['postId', 'type'],
      where: { postId: { in: postIds } },
      _count: true,
    });

    const summaryMap: Record<string, Record<string, number>> = {};
    for (const r of reactionSummaries) {
      if (!summaryMap[r.postId]) summaryMap[r.postId] = {};
      summaryMap[r.postId][r.type] = r._count;
    }

    return {
      posts: posts.map((post) => ({
        ...post,
        myReaction: post.reactions[0]?.type || null,
        reactions: undefined,
        reactionCount: post._count.reactions,
        reactionSummary: summaryMap[post.id] || {},
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

    // Check if they're friends
    const isSelf = userId === currentUserId;
    let areFriends = false;
    if (!isSelf) {
      const fr = await this.prisma.friendRequest.findFirst({
        where: { status: 'ACCEPTED', OR: [{ senderId: userId, receiverId: currentUserId }, { senderId: currentUserId, receiverId: userId }] },
      });
      areFriends = !!fr;
    }

    const visibilityFilter = isSelf
      ? {} // show all own posts
      : areFriends
        ? { visibility: { in: ['PUBLIC', 'FRIENDS'] as any[] } }
        : { visibility: 'PUBLIC' as any };

    const posts = await this.prisma.post.findMany({
      where: { authorId: userId, ...visibilityFilter },
      include: {
        author: { select: this.authorSelect },
        _count: { select: { reactions: true, comments: true } },
        reactions: {
          where: { userId: currentUserId },
          select: { id: true, type: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    const postIds = posts.map((p) => p.id);
    const reactionSummaries = await this.prisma.reaction.groupBy({
      by: ['postId', 'type'],
      where: { postId: { in: postIds } },
      _count: true,
    });
    const summaryMap: Record<string, Record<string, number>> = {};
    for (const r of reactionSummaries) {
      if (!summaryMap[r.postId]) summaryMap[r.postId] = {};
      summaryMap[r.postId][r.type] = r._count;
    }

    return posts.map((post) => ({
      ...post,
      myReaction: post.reactions[0]?.type || null,
      reactions: undefined,
      reactionCount: post._count.reactions,
      reactionSummary: summaryMap[post.id] || {},
      commentCount: post._count.comments,
      _count: undefined,
    }));
  }

  // ─── Single Post ──────────────────────────────────────────

  async getPost(postId: string, currentUserId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: { select: this.authorSelect },
        _count: { select: { reactions: true, comments: true } },
        reactions: {
          where: { userId: currentUserId },
          select: { id: true, type: true },
        },
      },
    });
    if (!post) throw new NotFoundException('Post not found');

    return {
      ...post,
      myReaction: post.reactions[0]?.type || null,
      reactions: undefined,
      reactionCount: post._count.reactions,
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

  // ─── Reactions ────────────────────────────────────────────

  async toggleReaction(postId: string, userId: string, type: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.prisma.reaction.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      if (existing.type === type) {
        // Same reaction = remove it
        await this.prisma.reaction.delete({ where: { id: existing.id } });
        return { reacted: false, type: null };
      } else {
        // Different reaction = update it
        await this.prisma.reaction.update({ where: { id: existing.id }, data: { type: type as any } });
        return { reacted: true, type };
      }
    }

    await this.prisma.reaction.create({ data: { postId, userId, type: type as any } });
    return { reacted: true, type };
  }

  // ─── Comments ─────────────────────────────────────────────

  async addComment(postId: string, authorId: string, content: string, parentId?: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    if (parentId) {
      const parent = await this.prisma.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.postId !== postId) throw new BadRequestException('Invalid parent comment');
    }

    return this.prisma.comment.create({
      data: { content, postId, authorId, parentId },
      include: {
        author: { select: this.authorSelect },
        replies: {
          include: { author: { select: this.authorSelect } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async editComment(commentId: string, userId: string, content: string) {
    const comment = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== userId) throw new ForbiddenException('You can only edit your own comments');

    const elapsed = Date.now() - comment.createdAt.getTime();
    if (elapsed > COMMENT_EDIT_WINDOW_MS) {
      throw new BadRequestException('Comments can only be edited within 5 minutes of posting');
    }

    return this.prisma.comment.update({
      where: { id: commentId },
      data: { content },
      include: { author: { select: this.authorSelect } },
    });
  }

  async getComments(postId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    return this.prisma.comment.findMany({
      where: { postId, parentId: null }, // Only top-level comments
      include: {
        author: { select: this.authorSelect },
        replies: {
          include: { author: { select: this.authorSelect } },
          orderBy: { createdAt: 'asc' },
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
