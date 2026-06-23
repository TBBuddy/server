import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { AppException } from '../common/exceptions/app.exception';
import { ConfigService } from '@nestjs/config';
import { Database } from 'mongoloquent';
import {
  AI_ASSESSMENT_QUEUE,
  AiAssessmentJobData,
} from './ai-assessment.queue';
import { PeriodCollectorService } from './period-collector.service';
import { PiiRedactorService } from './pii-redactor.service';
import { GeminiAdapterService } from './gemini-adapter.service';
import { AiRiskLevel } from '../common/enums/ai-risk-level.enum';
import type { IAiAssessment } from './models/ai-assessment.model';
import type { IAiAssessmentCheckinSymptom } from './models/ai-assessment-checkin-symptom.model';

@Processor(AI_ASSESSMENT_QUEUE)
export class AiAssessmentConsumer extends WorkerHost {
  private readonly logger = new Logger(AiAssessmentConsumer.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly periodCollector: PeriodCollectorService,
    private readonly piiRedactor: PiiRedactorService,
    private readonly geminiAdapter: GeminiAdapterService,
  ) {
    super();
  }

  async process(job: Job<AiAssessmentJobData>, token?: string): Promise<void> {
    void token;
    const { patientId } = job.data;
    this.logger.log({
      msg: 'ai_assessment_job_start',
      patientId,
      jobId: job.id,
    });

    try {
      const periodData = await this.periodCollector.collect(patientId);
      const redacted = this.piiRedactor.redact(periodData.days);
      const geminiResult = await this.geminiAdapter.assess(redacted);

      const assessmentDoc = {
        patient_id: patientId,
        period_start_date: periodData.period_start_date,
        period_end_date: periodData.period_end_date,
        analyzed_days: periodData.analyzed_days,
        risk_level: geminiResult.risk_level,
        summary: geminiResult.summary,
        recommendation: geminiResult.recommendation,
        should_consult_doctor: geminiResult.should_consult_doctor,
        model_name: geminiResult.model_name,
        prompt_snapshot: geminiResult.prompt_snapshot,
        raw_response: geminiResult.raw_response,
        created_at: new Date(),
      };

      const assessmentResult = await this.nativeAssessments().insertOne(
        assessmentDoc as any,
      );
      const assessmentId = assessmentResult.insertedId.toString();

      const allCheckinSymptomIds = periodData.days.flatMap(
        (d) => d.checkin_symptom_ids,
      );
      if (allCheckinSymptomIds.length > 0) {
        await this.nativeJunctions().insertMany(
          allCheckinSymptomIds.map((csId) => ({
            ai_assessment_id: assessmentId,
            checkin_symptom_id: csId,
            created_at: new Date(),
          })) as any[],
        );
      }

      if (
        geminiResult.risk_level === AiRiskLevel.HIGH ||
        geminiResult.should_consult_doctor
      ) {
        // TODO(F06): send AI warning notification
        this.logger.warn({
          msg: 'ai_assessment_high_risk',
          patientId,
          assessmentId,
        });
      }

      this.logger.log({
        msg: 'ai_assessment_job_done',
        patientId,
        assessmentId,
      });
    } catch (error) {
      this.logger.error({
        msg: 'ai_assessment_job_failed',
        patientId,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof AppException) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }

  private nativeAssessments() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<IAiAssessment>('ai_assessments');
  }

  private nativeJunctions() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<IAiAssessmentCheckinSymptom>('ai_assessment_checkin_symptoms');
  }
}
