import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PostService } from './post.service';

@Controller('api/posts')
@UseGuards(AuthGuard)
export class PostController {
  constructor(private postService: PostService) {}

  // ─── Create Post ─────────────────────────────────────────

  @Post()
  async createPost(@Req() req: any, @Body() body: { content: string; image?: string }) {
    return this.postService.createPost(req.user.id, body);
  }

  // ─── Feed ────────────────────────────────────────────────

  @Get('feed')
  async getFeed(@Req() req: any, @Query('page') page: string) {
    return this.postService.getFeed(req.user.id, Number(page) || 1);
  }

  // ─── User Posts ──────────────────────────────────────────

  @Get('user/:userId')
  async getUserPosts(
    @Param('userId') userId: string,
    @Req() req: any,
    @Query('page') page: string,
  ) {
    return this.postService.getUserPosts(userId, req.user.id, Number(page) || 1);
  }

  // ─── Single Post ─────────────────────────────────────────

  @Get(':postId')
  async getPost(@Param('postId') postId: string, @Req() req: any) {
    return this.postService.getPost(postId, req.user.id);
  }

  // ─── Delete Post ──────────────────────────────────────────

  @Delete(':postId')
  async deletePost(@Param('postId') postId: string, @Req() req: any) {
    return this.postService.deletePost(postId, req.user.id);
  }

  // ─── Like / Unlike ───────────────────────────────────────

  @Post(':postId/like')
  async toggleLike(@Param('postId') postId: string, @Req() req: any) {
    return this.postService.toggleLike(postId, req.user.id);
  }

  // ─── Comments ─────────────────────────────────────────────

  @Post(':postId/comments')
  async addComment(
    @Param('postId') postId: string,
    @Req() req: any,
    @Body() body: { content: string },
  ) {
    return this.postService.addComment(postId, req.user.id, body.content);
  }

  @Get(':postId/comments')
  async getComments(
    @Param('postId') postId: string,
    @Query('page') page: string,
  ) {
    return this.postService.getComments(postId, Number(page) || 1);
  }

  @Delete('comments/:commentId')
  async deleteComment(@Param('commentId') commentId: string, @Req() req: any) {
    return this.postService.deleteComment(commentId, req.user.id);
  }
}
