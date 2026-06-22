import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { FacilitiesService } from '../facilities.service';

async function seedFacilities(): Promise<void> {
  const logger = new Logger('FacilitiesSeed');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const result = await app.get(FacilitiesService).seedFacilities();
    logger.log(`Seed facilities: ${result}.`);
  } finally {
    await app.close();
  }
}

void seedFacilities();
