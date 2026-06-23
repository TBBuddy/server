import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { CheckinsService } from '../checkins.service';

async function seedSymptoms(): Promise<void> {
  const logger = new Logger('SymptomsSeed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const result = await app.get(CheckinsService).seedSymptoms();
    logger.log(
      `Seed symptoms: ${result.insertedCount} inserted, ${result.existingCount} existing.`,
    );
  } finally {
    await app.close();
  }
}

void seedSymptoms();
