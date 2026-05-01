import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { UserService } from './user.service';

@Controller('api/users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  // ─── Profile ──────────────────────────────────────────────

  @Get('me')
  async getMe(@Req() req: any) {
    return this.userService.getMe(req.user.id);
  }

  @Put('me')
  async updateMe(@Req() req: any, @Body() body: any) {
    return this.userService.updateMe(req.user.id, body);
  }

  @Get('search')
  async searchUsers(@Query('q') query: string, @Req() req: any) {
    return this.userService.searchUsers(query, req.user.id);
  }

  @Get('me/friend-requests')
  async getPendingRequests(@Req() req: any) {
    return this.userService.getPendingRequests(req.user.id);
  }

  @Get(':username')
  async getProfile(@Param('username') username: string, @Req() req: any) {
    return this.userService.getProfileByUsername(username, req.user.id);
  }

  // ─── Friend System ────────────────────────────────────────

  @Post(':userId/friend-request')
  async sendFriendRequest(@Param('userId') userId: string, @Req() req: any) {
    return this.userService.sendFriendRequest(req.user.id, userId);
  }

  @Post('friend-request/:id/accept')
  async acceptFriendRequest(@Param('id') id: string, @Req() req: any) {
    return this.userService.acceptFriendRequest(id, req.user.id);
  }

  @Post('friend-request/:id/reject')
  async rejectFriendRequest(@Param('id') id: string, @Req() req: any) {
    return this.userService.rejectFriendRequest(id, req.user.id);
  }

  @Delete('friends/:userId')
  async unfriend(@Param('userId') userId: string, @Req() req: any) {
    return this.userService.unfriend(req.user.id, userId);
  }

  @Get(':userId/friends')
  async getFriends(
    @Param('userId') userId: string,
    @Query('page') page: string,
  ) {
    return this.userService.getFriends(userId, Number(page) || 1);
  }

  // ─── Follow System ────────────────────────────────────────

  @Post(':userId/follow')
  async followUser(@Param('userId') userId: string, @Req() req: any) {
    return this.userService.followUser(req.user.id, userId);
  }

  @Get(':userId/followers')
  async getFollowers(
    @Param('userId') userId: string,
    @Query('page') page: string,
  ) {
    return this.userService.getFollowers(userId, Number(page) || 1);
  }

  @Get(':userId/following')
  async getFollowing(
    @Param('userId') userId: string,
    @Query('page') page: string,
  ) {
    return this.userService.getFollowing(userId, Number(page) || 1);
  }
}
