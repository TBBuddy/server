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
import { PatientsModule } from '../patients/patients.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DailyCheckin } from '../checkins/models/daily-checkin.model';
import { CheckinSymptom } from '../checkins/models/checkin-symptom.model';
import { Symptom } from '../checkins/models/symptom.model';

@Module({
  imports: [
    MongoloquentModule.forFeature([
      AiAssessment,
      AiAssessmentCheckinSymptom,
      DailyCheckin,
      CheckinSymptom,
      Symptom,
    ]),
    BullModule.registerQueue({ name: AI_ASSESSMENT_QUEUE }),
    UsersModule,
    PatientsModule,
    NotificationsModule,
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
