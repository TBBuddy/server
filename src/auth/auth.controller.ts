import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthSessionResponseDto } from '../users/dto/user-response.dto';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { LogoutDto } from './dto/logout.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiCreatedResponse({ type: MessageResponseDto })
  async register(@Body() dto: RegisterDto): Promise<MessageResponseDto> {
    await this.authService.register(dto);
    return { message: 'Registrasi berhasil.' };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Kredensial tidak valid.' })
  login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.authService.login(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthSessionResponseDto })
  getSession(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AuthSessionResponseDto> {
    return this.authService.getSession(user);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOkResponse({ type: MessageResponseDto })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
  ): Promise<MessageResponseDto> {
    await this.authService.logout(user, dto);
    return { message: 'Logout berhasil.' };
  }
}
