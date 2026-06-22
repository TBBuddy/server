import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AppException } from '../common/exceptions/app.exception';
import { DataResponse } from '../common/dto/data-response.dto';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthSessionUserDto } from '../users/dto/user-response.dto';
import { UserSerializer } from '../users/serializers/user.serializer';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { LoginDataDto } from './dto/login-response.dto';
import { LogoutDto } from './dto/logout.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { PatientsIndexService } from '../patients/patients-index.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly patientsIndexService: PatientsIndexService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<void> {
    const passwordHash = await bcrypt.hash(
      dto.password,
      this.configService.getOrThrow<number>('BCRYPT_ROUNDS'),
    );
    await this.usersService.createRegisteredUser(dto, passwordHash);
  }

  async login(dto: LoginDto): Promise<DataResponse<LoginDataDto>> {
    const user = await this.usersService.findPrivateByIdentity(dto.identifier);
    if (
      !user ||
      !user.is_active ||
      !(await bcrypt.compare(dto.password, user.password_hash))
    ) {
      throw new AppException(
        401,
        'INVALID_CREDENTIALS',
        'Email/username atau password tidak valid.',
      );
    }

    const payload: JwtPayload = {
      sub: user._id.toHexString(),
      username: user.username,
      role: user.role,
    };
    const accessToken = await this.jwtService.signAsync(payload);
    await this.usersService.markLogin(payload.sub);

    const hasProfile = await this.patientsIndexService.hasProfile(payload.sub);

    return {
      data: {
        accessToken,
        expiresIn: this.configService.getOrThrow<number>('JWT_EXPIRES_IN'),
        user: UserSerializer.toAuthSession(user, hasProfile),
      },
    };
  }

  async getSession(
    currentUser: AuthenticatedUser,
  ): Promise<DataResponse<AuthSessionUserDto>> {
    const user = await this.usersService.requireById(currentUser.id);

    const hasProfile = await this.patientsIndexService.hasProfile(
      currentUser.id,
    );

    return { data: UserSerializer.toAuthSession(user, hasProfile) };
  }

  async logout(currentUser: AuthenticatedUser, dto: LogoutDto): Promise<void> {
    if (dto.pushToken) {
      await this.usersService.removePushToken(currentUser.id, dto.pushToken);
    }
  }

  async seedAdminFromEnvironment(): Promise<'created' | 'updated'> {
    const email = this.configService.get<string>('ADMIN_EMAIL')?.trim();
    const username = this.configService.get<string>('ADMIN_USERNAME')?.trim();
    const password = this.configService.get<string>('ADMIN_PASSWORD');
    const fullName =
      this.configService.get<string>('ADMIN_FULL_NAME')?.trim() ||
      'TBuddy Administrator';

    if (!email || !username || !password) {
      throw new Error(
        'ADMIN_EMAIL, ADMIN_USERNAME, and ADMIN_PASSWORD are required.',
      );
    }
    if (
      password.length < 8 ||
      !/[A-Za-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      throw new Error(
        'ADMIN_PASSWORD must contain letters and numbers and be at least 8 characters.',
      );
    }

    const passwordHash = await bcrypt.hash(
      password,
      this.configService.getOrThrow<number>('BCRYPT_ROUNDS'),
    );
    return this.usersService.ensureAdmin({
      email,
      username,
      passwordHash,
      fullName,
    });
  }
}
