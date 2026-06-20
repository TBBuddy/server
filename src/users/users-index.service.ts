import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Database } from 'mongoloquent';
import { IUser } from './user.model';

@Injectable()
export class UsersIndexService implements OnApplicationBootstrap {
  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    const database = Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    );
    await database.command({ ping: 1 });

    const users = database.collection<IUser>('users');
    await users.createIndexes([
      { key: { email: 1 }, name: 'users_email_unique', unique: true },
      { key: { username: 1 }, name: 'users_username_unique', unique: true },
      { key: { role: 1 }, name: 'users_role' },
      { key: { treatment_status: 1 }, name: 'users_treatment_status' },
    ]);
  }
}
