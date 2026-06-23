import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { AppException } from '../common/exceptions/app.exception';
import { ObjectId } from 'mongodb';
import { InjectModel } from '@mongoloquent/nestjs';
import {
  AI_ASSESSMENT_QUEUE,
  AiAssessmentJobData,
} from './ai-assessment.queue';
import { PeriodCollectorService } from './period-collector.service';
import { PiiRedactorService } from './pii-redactor.service';
import { GeminiAdapterService } from './gemini-adapter.service';
import { AiRiskLevel } from '../common/enums/ai-risk-level.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { AiAssessment } from './models/ai-assessment.model';
import { AiAssessmentCheckinSymptom } from './models/ai-assessment-checkin-symptom.model';

@Processor(AI_ASSESSMENT_QUEUE)
export class AiAssessmentConsumer extends WorkerHost {
  private readonly logger = new Logger(AiAssessmentConsumer.name);

  constructor(
    private readonly periodCollector: PeriodCollectorService,
    private readonly piiRedactor: PiiRedactorService,
    private readonly geminiAdapter: GeminiAdapterService,
    @InjectModel(AiAssessment)
    private readonly assessmentModel: typeof AiAssessment,
    @InjectModel(AiAssessmentCheckinSymptom)
    private readonly junctionModel: typeof AiAssessmentCheckinSymptom,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<AiAssessmentJobData>, token?: string): Promise<void> {
    void token;
    const { patientId, patientProfileId } = job.data;
    this.logger.log({
      msg: 'ai_assessment_job_start',
      patientId,
      patientProfileId,
      jobId: job.id,
    });

    try {
      const periodData = await this.periodCollector.collect(
        patientId,
        patientProfileId,
      );
      const redacted = this.piiRedactor.redact(periodData.days);
      const geminiResult = await this.geminiAdapter.assess(redacted);

      const assessmentDoc = {
        _id: new ObjectId(),
        patient_id: patientId,
        patient_profile_id: patientProfileId,
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

      const assessment = await this.assessmentModel.create(assessmentDoc);
      const assessmentId = assessment._id.toHexString();

      const allCheckinSymptomIds = periodData.days.flatMap(
        (d) => d.checkin_symptom_ids,
      );
      if (allCheckinSymptomIds.length > 0) {
        const junctions = allCheckinSymptomIds.map((csId) => ({
          _id: new ObjectId(),
          ai_assessment_id: assessmentId,
          checkin_symptom_id: csId,
          created_at: new Date(),
        }));
        await this.junctionModel.createMany(junctions);
      }

      if (
        geminiResult.risk_level === AiRiskLevel.HIGH ||
        geminiResult.should_consult_doctor
      ) {
        await this.notificationsService.sendAiWarning(
          patientId,
          patientProfileId,
          {
            assessmentId,
            riskLevel: geminiResult.risk_level,
            shouldConsultDoctor: geminiResult.should_consult_doctor,
            summary: geminiResult.summary,
            recommendation: geminiResult.recommendation,
          },
        );
        this.logger.warn({
          msg: 'ai_assessment_high_risk',
          patientId,
          patientProfileId,
          assessmentId,
        });
      }

      this.logger.log({
        msg: 'ai_assessment_job_done',
        patientId,
        patientProfileId,
        assessmentId,
      });
    } catch (error) {
      this.logger.error({
        msg: 'ai_assessment_job_failed',
        patientId,
        patientProfileId,
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof AppException) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
