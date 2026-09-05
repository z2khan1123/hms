import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  type AuthResponse,
  type LoginInput,
  loginSchema,
  type RegisterInput,
  refreshSchema,
  registerSchema,
} from '@hms/shared';
import { Public } from '../../common/auth/public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput,
  ): Promise<AuthResponse> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginInput,
  ): Promise<AuthResponse> {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) dto: { refreshToken: string },
  ): Promise<AuthResponse> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Body(new ZodValidationPipe(refreshSchema)) dto: { refreshToken: string },
  ): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }
}
