import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { UploadModule } from './upload/upload.module';
import { UserModule } from './user/user.module';
import { PostModule } from './post/post.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ([
        {
          name: 'auth',
          ttl: config.get<number>('RATE_LIMIT_AUTH_TTL', 60000),
          limit: config.get<number>('RATE_LIMIT_AUTH_LIMIT', 10),
        },
        {
          name: 'api',
          ttl: config.get<number>('RATE_LIMIT_API_TTL', 60000),
          limit: config.get<number>('RATE_LIMIT_API_LIMIT', 100),
        },
      ]),
    }),
    PrismaModule,
    AuthModule,
    OnboardingModule,
    UploadModule,
    UserModule,
    PostModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
