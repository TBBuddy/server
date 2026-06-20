import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthService } from '../auth/auth.service';
import { AppModule } from '../app.module';

async function seedAdmin(): Promise<void> {
  const logger = new Logger('AdminSeed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const result = await app.get(AuthService).seedAdminFromEnvironment();
    logger.log(`Admin seed ${result}.`);
  } finally {
    await app.close();
  }
}

void seedAdmin();
