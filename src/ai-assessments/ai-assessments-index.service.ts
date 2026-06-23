import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Database } from 'mongoloquent';
import type { IAiAssessment } from './models/ai-assessment.model';
import type { IAiAssessmentCheckinSymptom } from './models/ai-assessment-checkin-symptom.model';

@Injectable()
export class AiAssessmentsIndexService implements OnApplicationBootstrap {
  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    const database = Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    );

    const assessments = database.collection<IAiAssessment>('ai_assessments');
    await assessments.createIndexes([
      {
        key: { patient_profile_id: 1, created_at: -1 },
        name: 'ai_assessments_profile_created',
      },
      {
        key: { patient_id: 1, patient_profile_id: 1 },
        name: 'ai_assessments_patient_profile',
      },
      { key: { risk_level: 1 }, name: 'ai_assessments_risk_level' },
      {
        key: { should_consult_doctor: 1 },
        name: 'ai_assessments_consult_doctor',
      },
      { key: { period_start_date: 1 }, name: 'ai_assessments_period_start' },
      { key: { period_end_date: 1 }, name: 'ai_assessments_period_end' },
    ]);

    const junctions = database.collection<IAiAssessmentCheckinSymptom>(
      'ai_assessment_checkin_symptoms',
    );
    await junctions.createIndexes([
      {
        key: { ai_assessment_id: 1, checkin_symptom_id: 1 },
        name: 'ai_assessment_checkin_symptoms_unique',
        unique: true,
      },
      {
        key: { ai_assessment_id: 1 },
        name: 'ai_assessment_checkin_symptoms_assessment_id',
      },
      {
        key: { checkin_symptom_id: 1 },
        name: 'ai_assessment_checkin_symptoms_checkin_symptom_id',
      },
    ]);
  }
}
