import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OnboardingService } from './onboarding.service';

@Controller('api/onboarding')
@UseGuards(AuthGuard)
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  @Post('username')
  async setUsername(@Req() req: any, @Body('username') username: string) {
    return this.onboardingService.setUsername(req.user.id, username);
  }

  @Post('profile')
  async setProfile(
    @Req() req: any,
    @Body() body: { bio?: string; country?: string; website?: string; image?: string },
  ) {
    return this.onboardingService.setProfile(req.user.id, body);
  }
}
