import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Database } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import { RedisService } from '../redis/redis.service';
import { HealthResponseDto } from './health.dto';

@Injectable()
export class HealthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async check(): Promise<HealthResponseDto> {
    try {
      const database = Database.getDb(
        this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
        this.configService.getOrThrow<string>('MONGODB_DATABASE'),
      );
      await database.command({ ping: 1 });
    } catch {
      throw new AppException(
        503,
        'SERVICE_UNAVAILABLE',
        'MongoDB tidak tersedia.',
        [
          {
            field: 'mongodb',
            code: 'DEPENDENCY_UNAVAILABLE',
            message: 'Koneksi MongoDB gagal.',
          },
        ],
      );
    }

    let redisStatus: 'up' | 'disabled' = 'disabled';
    try {
      const redisPing = await this.redisService.ping();
      redisStatus = redisPing === 'PONG' ? 'up' : 'disabled';
    } catch {
      throw new AppException(
        503,
        'SERVICE_UNAVAILABLE',
        'Redis tidak tersedia.',
        [
          {
            field: 'redis',
            code: 'DEPENDENCY_UNAVAILABLE',
            message: 'Koneksi Redis gagal.',
          },
        ],
      );
    }

    return {
      data: {
        status: redisStatus === 'disabled' ? 'degraded' : 'ok',
        api: { status: 'up' },
        mongodb: { status: 'up' },
        redis: { status: redisStatus },
      },
    };
  }
}
