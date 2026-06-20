import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../enums/user-role.enum';
import { AppException } from '../exceptions/app.exception';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: '1', username: 'patient', role: UserRole.PATIENT },
      }),
    }),
  } as unknown as ExecutionContext;

  it('allows a user with an accepted role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.PATIENT]),
    } as unknown as Reflector;
    expect(new RolesGuard(reflector).canActivate(context)).toBe(true);
  });

  it('returns FORBIDDEN for a wrong role', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector;

    expect(() => new RolesGuard(reflector).canActivate(context)).toThrow(
      AppException,
    );
    try {
      new RolesGuard(reflector).canActivate(context);
    } catch (error) {
      expect((error as AppException).code).toBe('FORBIDDEN');
    }
  });
});
