import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}

  async setUsername(userId: string, username: string) {
    if (!username || username.trim().length < 3) {
      throw new BadRequestException('Username must be at least 3 characters long');
    }
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      throw new BadRequestException('Username is already taken');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { username },
    });
  }

  async setProfile(
    userId: string,
    profileData: { bio?: string; country?: string; website?: string; image?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.username) {
      throw new BadRequestException('Username must be set before profile details');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...profileData,
        onboardingCompleted: true,
      },
    });
  }
}
