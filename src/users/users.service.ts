import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@mongoloquent/nestjs';
import { MongoServerError, ObjectId } from 'mongodb';
import { Database, MongoloquentException } from 'mongoloquent';
import { TreatmentStatus } from '../common/enums/treatment-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AppException } from '../common/exceptions/app.exception';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { RegisterDto } from '../auth/dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { IUser, User } from './user.model';

interface AdminSeedInput {
  email: string;
  username: string;
  passwordHash: string;
  fullName: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User) private readonly userModel: typeof User,
    private readonly configService: ConfigService,
  ) {}

  async createRegisteredUser(
    dto: RegisterDto,
    passwordHash: string,
  ): Promise<IUser> {
    const email = dto.email.toLowerCase();
    const username = dto.username.toLowerCase();

    const [emailUser, usernameUser] = await Promise.all([
      this.userModel.where('email', email).first(),
      this.userModel.where('username', username).first(),
    ]);

    if (emailUser) {
      throw new AppException(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'Email sudah terdaftar.',
      );
    }
    if (usernameUser) {
      throw new AppException(
        409,
        'USERNAME_ALREADY_TAKEN',
        'Username sudah digunakan.',
      );
    }

    try {
      return await this.userModel.create({
        email,
        username,
        password_hash: passwordHash,
        full_name: dto.fullName ?? null,
        avatar_url: null,
        phone_number: null,
        push_notification_tokens: [],
        role: dto.role,
        treatment_status: TreatmentStatus.NOT_PATIENT,
        is_verified: false,
        is_active: true,
        last_login_at: null,
      });
    } catch (error) {
      this.rethrowDuplicateIdentity(error);
      throw error;
    }
  }

  async findPrivateByIdentity(identifier: string): Promise<IUser | null> {
    const normalized = identifier.toLowerCase();
    const query = this.userModel.makeVisible('password_hash');
    return normalized.includes('@')
      ? query.where('email', normalized).first()
      : query.where('username', normalized).first();
  }

  async findPrivateById(id: string): Promise<IUser | null> {
    if (!ObjectId.isValid(id)) {
      return null;
    }
    return this.userModel.where('_id', new ObjectId(id)).first();
  }

  async requireById(id: string): Promise<IUser> {
    const user = await this.findPrivateById(id);
    if (!user) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'User tidak ditemukan.',
      );
    }
    return user;
  }

  async findActiveAuthIdentity(id: string): Promise<AuthenticatedUser | null> {
    const user = await this.findPrivateById(id);
    if (!user?.is_active) {
      return null;
    }
    return {
      id: user._id.toHexString(),
      username: user.username,
      role: user.role,
    };
  }

  async markLogin(id: string): Promise<void> {
    await this.userModel
      .where('_id', new ObjectId(id))
      .update({ last_login_at: new Date() });
  }

  async updateOwnProfile(id: string, dto: UpdateProfileDto): Promise<void> {
    const changes: Partial<IUser> = {};
    if (dto.fullName !== undefined) changes.full_name = dto.fullName;
    if (dto.avatarUrl !== undefined) changes.avatar_url = dto.avatarUrl;
    if (dto.phoneNumber !== undefined) changes.phone_number = dto.phoneNumber;

    if (Object.keys(changes).length === 0) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Minimal satu field profil harus dikirim.',
      );
    }

    await this.requireById(id);
    await this.userModel.where('_id', new ObjectId(id)).update(changes);
  }

  async addPushToken(id: string, token: string): Promise<void> {
    if (!ObjectId.isValid(id)) {
      throw this.userNotFound();
    }

    const result = await this.nativeUsersCollection().updateOne(
      { _id: new ObjectId(id) },
      { $addToSet: { push_notification_tokens: token } },
    );
    if (result.matchedCount === 0) {
      throw this.userNotFound();
    }
  }

  async removePushToken(id: string, token: string): Promise<void> {
    if (!ObjectId.isValid(id)) {
      throw this.userNotFound();
    }

    const result = await this.nativeUsersCollection().updateOne(
      { _id: new ObjectId(id) },
      { $pull: { push_notification_tokens: token } },
    );
    if (result.matchedCount === 0) {
      throw this.userNotFound();
    }
  }

  async getPushTokens(id: string): Promise<string[]> {
    if (!ObjectId.isValid(id)) {
      throw this.userNotFound();
    }

    const user = await this.nativeUsersCollection().findOne(
      { _id: new ObjectId(id) },
      { projection: { push_notification_tokens: 1 } },
    );
    if (!user) {
      throw this.userNotFound();
    }

    return user.push_notification_tokens ?? [];
  }

  private nativeUsersCollection() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<IUser>('users');
  }

  private userNotFound(): AppException {
    return new AppException(404, 'RESOURCE_NOT_FOUND', 'User tidak ditemukan.');
  }

  async ensureAdmin(input: AdminSeedInput): Promise<'created' | 'updated'> {
    const email = input.email.toLowerCase();
    const username = input.username.toLowerCase();
    const existing =
      (await this.userModel.where('email', email).first()) ??
      (await this.userModel.where('username', username).first());

    if (existing) {
      await this.userModel.where('_id', existing._id).update({
        email,
        username,
        password_hash: input.passwordHash,
        full_name: input.fullName,
        role: UserRole.ADMIN,
        treatment_status: TreatmentStatus.NOT_PATIENT,
        is_active: true,
      });
      return 'updated';
    }

    await this.userModel.create({
      email,
      username,
      password_hash: input.passwordHash,
      full_name: input.fullName,
      avatar_url: null,
      phone_number: null,
      push_notification_tokens: [],
      role: UserRole.ADMIN,
      treatment_status: TreatmentStatus.NOT_PATIENT,
      is_verified: true,
      is_active: true,
      last_login_at: null,
    });
    return 'created';
  }

  private rethrowDuplicateIdentity(error: unknown): void {
    const databaseError: unknown =
      error instanceof MongoloquentException ? (error.error as unknown) : error;
    if (
      !(databaseError instanceof MongoServerError) ||
      databaseError.code !== 11000
    ) {
      return;
    }

    const keyPattern = databaseError.keyPattern as
      | Record<string, unknown>
      | undefined;

    if (keyPattern && 'email' in keyPattern) {
      throw new AppException(
        409,
        'EMAIL_ALREADY_REGISTERED',
        'Email sudah terdaftar.',
      );
    }
    if (keyPattern && 'username' in keyPattern) {
      throw new AppException(
        409,
        'USERNAME_ALREADY_TAKEN',
        'Username sudah digunakan.',
      );
    }
  }
}
