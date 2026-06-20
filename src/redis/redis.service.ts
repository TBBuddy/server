import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnApplicationShutdown {
  private client?: Redis;

  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('REDIS_ENABLED', false);
  }

  async ping(): Promise<'PONG' | 'DISABLED'> {
    if (!this.isEnabled()) {
      return 'DISABLED';
    }

    if (!this.client) {
      const password =
        this.configService.get<string>('REDIS_PASSWORD') || undefined;
      this.client = new Redis({
        host: this.configService.getOrThrow<string>('REDIS_HOST'),
        port: this.configService.getOrThrow<number>('REDIS_PORT'),
        username: this.configService.get<string>('REDIS_USERNAME') || undefined,
        password,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        connectTimeout: 5_000,
        commandTimeout: 5_000,
        retryStrategy: () => null,
      });
    }

    if (this.client.status === 'wait') {
      await this.client.connect();
    }
    return this.client.ping();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.client && this.client.status !== 'end') {
      await this.client.quit().catch(() => this.client?.disconnect());
    }
  }
}
