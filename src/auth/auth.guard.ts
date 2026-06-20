import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { AppException } from '../common/exceptions/app.exception';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);
    if (!token) {
      throw new AppException(
        401,
        'UNAUTHORIZED',
        'Access token tidak tersedia atau tidak valid.',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      const user = await this.usersService.findActiveAuthIdentity(payload.sub);
      if (!user) {
        throw new AppException(
          401,
          'UNAUTHORIZED',
          'Access token tidak tersedia atau tidak valid.',
        );
      }
      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof AppException) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === 'TokenExpiredError' ||
          error.message.toLowerCase().includes('expired'))
      ) {
        throw new AppException(
          401,
          'TOKEN_EXPIRED',
          'Access token sudah kedaluwarsa.',
        );
      }
      throw new AppException(
        401,
        'UNAUTHORIZED',
        'Access token tidak tersedia atau tidak valid.',
      );
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const [scheme, token, extra] =
      request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' && token && !extra ? token : undefined;
  }
}
