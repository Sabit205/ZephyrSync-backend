import {
  Body, Controller, Delete, Get, Param, Patch,
  Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PostService } from './post.service';

@Controller('api/posts')
@UseGuards(AuthGuard)
export class PostController {
  constructor(private postService: PostService) {}

  @Post()
  async createPost(@Req() req: any, @Body() body: { content: string; image?: string; visibility?: string }) {
    return this.postService.createPost(req.user.id, body);
  }

  @Patch(':postId')
  async editPost(@Param('postId') postId: string, @Req() req: any, @Body() body: { content?: string; image?: string; visibility?: string }) {
    return this.postService.editPost(postId, req.user.id, body);
  }

  @Get('feed')
  async getFeed(@Req() req: any, @Query('page') page: string) {
    return this.postService.getFeed(req.user.id, Number(page) || 1);
  }

  @Get('user/:userId')
  async getUserPosts(@Param('userId') userId: string, @Req() req: any, @Query('page') page: string) {
    return this.postService.getUserPosts(userId, req.user.id, Number(page) || 1);
  }

  @Get(':postId')
  async getPost(@Param('postId') postId: string, @Req() req: any) {
    return this.postService.getPost(postId, req.user.id);
  }

  @Delete(':postId')
  async deletePost(@Param('postId') postId: string, @Req() req: any) {
    return this.postService.deletePost(postId, req.user.id);
  }

  @Post(':postId/react')
  async toggleReaction(@Param('postId') postId: string, @Req() req: any, @Body() body: { type: string }) {
    return this.postService.toggleReaction(postId, req.user.id, body.type);
  }

  @Post(':postId/comments')
  async addComment(@Param('postId') postId: string, @Req() req: any, @Body() body: { content: string; parentId?: string }) {
    return this.postService.addComment(postId, req.user.id, body.content, body.parentId);
  }

  @Patch('comments/:commentId')
  async editComment(@Param('commentId') commentId: string, @Req() req: any, @Body() body: { content: string }) {
    return this.postService.editComment(commentId, req.user.id, body.content);
  }

  @Get(':postId/comments')
  async getComments(@Param('postId') postId: string, @Query('page') page: string) {
    return this.postService.getComments(postId, Number(page) || 1);
  }

  @Delete('comments/:commentId')
  async deleteComment(@Param('commentId') commentId: string, @Req() req: any) {
    return this.postService.deleteComment(commentId, req.user.id);
  }
}
