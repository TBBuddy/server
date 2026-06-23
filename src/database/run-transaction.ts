import { ConfigService } from '@nestjs/config';
import { ClientSession } from 'mongodb';
import { DB } from 'mongoloquent';

export async function runTransaction<T>(
  configService: ConfigService,
  callback: (session: ClientSession) => Promise<T>,
): Promise<T> {
  return DB.connection(configService.getOrThrow<string>('MONGODB_CONNECTION'))
    .database(configService.getOrThrow<string>('MONGODB_DATABASE'))
    .transaction(callback);
}
