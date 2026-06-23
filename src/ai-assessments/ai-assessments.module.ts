import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { AiAssessment } from './models/ai-assessment.model';
import { AiAssessmentCheckinSymptom } from './models/ai-assessment-checkin-symptom.model';
import { AiAssessmentsController } from './ai-assessments.controller';
import { AiAssessmentsService } from './ai-assessments.service';
import { AiAssessmentsIndexService } from './ai-assessments-index.service';
import { AiAssessmentProducer } from './ai-assessment.producer';
import { AiAssessmentConsumer } from './ai-assessment.consumer';
import { PeriodCollectorService } from './period-collector.service';
import { PiiRedactorService } from './pii-redactor.service';
import { GeminiAdapterService } from './gemini-adapter.service';
import { AI_ASSESSMENT_QUEUE } from './ai-assessment.queue';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongoloquentModule.forFeature([AiAssessment, AiAssessmentCheckinSymptom]),
    BullModule.registerQueue({ name: AI_ASSESSMENT_QUEUE }),
    UsersModule,
  ],
  controllers: [AiAssessmentsController],
  providers: [
    AiAssessmentsService,
    AiAssessmentsIndexService,
    AiAssessmentProducer,
    AiAssessmentConsumer,
    PeriodCollectorService,
    PiiRedactorService,
    GeminiAdapterService,
  ],
  exports: [AiAssessmentsService],
})
export class AiAssessmentsModule {}
