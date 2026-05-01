import { Injectable, Logger } from '@nestjs/common';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class AuthService {
  public auth;
  private logger = new Logger(AuthService.name);
  private transporter;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASSWORD'),
      },
    });

    this.auth = betterAuth({
      database: prismaAdapter(this.prisma, {
        provider: 'postgresql',
      }),
      user: {
        additionalFields: {
          username: { type: "string", required: false },
          bio: { type: "string", required: false },
          country: { type: "string", required: false },
          website: { type: "string", required: false },
          onboardingCompleted: { type: "boolean", defaultValue: false },
          accountType: { type: "string", defaultValue: "PERSONAL" },
        }
      },
      emailAndPassword: {
        enabled: true,
        requireEmailVerification: true,
      },
      emailVerification: {
        sendOnSignUp: true,
        expiresIn: 300, // 5 minutes
        sendVerificationEmail: async ({ user, url, token }) => {
          this.logger.log(`Sending verification email to ${user.email}: ${url}`);
          try {
            const senderEmail = this.configService.get<string>('BREVO_FROM_EMAIL') || 'sabithasan2008@gmail.com';
            await this.transporter.sendMail({
              from: `"ZephyrSync" <${senderEmail}>`,
              to: user.email,
              subject: 'Verify your ZephyrSync account',
              html: `
              <div style="font-family: 'Inter', Helvetica, sans-serif; max-w-md; margin: 0 auto; background-color: #f9f9f9; padding: 40px 20px; border-radius: 12px; text-align: center; color: #1a1c1c;">
                <h1 style="color: #000; font-size: 28px; margin-bottom: 8px;">ZephyrSync</h1>
                <div style="background-color: #ffffff; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); margin-top: 24px;">
                  <h2 style="font-size: 22px; margin-bottom: 16px; margin-top: 0;">Welcome, ${user.name}!</h2>
                  <p style="color: #666666; font-size: 16px; line-height: 1.6; margin-bottom: 32px;">
                    We are thrilled to have you on board. Please verify your email address to complete your registration and set up your profile.
                  </p>
                  <a href="${url}" style="display: inline-block; background-color: #D4FF00; color: #000000; font-weight: 700; font-size: 16px; text-decoration: none; padding: 16px 32px; border-radius: 8px; box-shadow: 0 2px 10px rgba(212,255,0,0.4); text-transform: uppercase; letter-spacing: 0.5px;">
                    Verify My Email
                  </a>
                  <p style="color: #999999; font-size: 13px; margin-top: 32px;">
                    If you didn't create an account with ZephyrSync, you can safely ignore this email.
                  </p>
                </div>
              </div>
              `,
            });
            this.logger.log('Verification email sent successfully.');
          } catch (error) {
            this.logger.error('Failed to send verification email', error);
          }
        },
      },
      secret: this.configService.get<string>('BETTER_AUTH_SECRET'),
      baseURL: this.configService.get<string>('BETTER_AUTH_URL'),
      trustedOrigins: [this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'],
    });
  }
}
