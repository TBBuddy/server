import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { validateEnvironment } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { RedisModule } from './redis/redis.module';
import { User } from './users/user.model';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { MedicineStocksModule } from './medicine-stocks/medicine-stocks.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnvironment,
    }),
    MongoloquentModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      models: [User],
      global: true,
      useFactory: (config: ConfigService) => ({
        connection: config.getOrThrow<string>('MONGODB_CONNECTION'),
        database: config.getOrThrow<string>('MONGODB_DATABASE'),
        timezone: config.get<string>('DEFAULT_TIMEZONE', 'Asia/Jakarta'),
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        prefix: config.getOrThrow<string>('REDIS_PREFIX'),
        connection: {
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
          username: config.get<string>('REDIS_USERNAME') || undefined,
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    RedisModule,
    UsersModule,
    AuthModule,
    HealthModule,
    PatientsModule,
    MedicineStocksModule,
  ],
  providers: [
    RequestContextMiddleware,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
