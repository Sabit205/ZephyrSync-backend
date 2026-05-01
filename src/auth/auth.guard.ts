import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    try {
      const session = await this.authService.auth.api.getSession({
        headers: request.headers,
      });
      
      if (!session || !session.user) {
        throw new UnauthorizedException();
      }
      
      request.user = session.user;
      request.session = session.session;
      return true;
    } catch (error) {
      throw new UnauthorizedException();
    }
  }
}
