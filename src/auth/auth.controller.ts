import { All, Controller, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { toNodeHandler } from 'better-auth/node';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @All('*path')
  async handler(@Req() req: any, @Res() res: any) {
    const handler = toNodeHandler(this.authService.auth);
    return handler(req, res);
  }
}
