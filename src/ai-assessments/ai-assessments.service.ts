import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Database } from 'mongoloquent';
import { ObjectId } from 'mongodb';
import { SeverityLevel } from '../common/enums/severity-level.enum';
import { AppException } from '../common/exceptions/app.exception';
import { AiAssessmentProducer } from './ai-assessment.producer';
import type { IAiAssessment } from './models/ai-assessment.model';
import type {
  AiAssessmentResponseDto,
  AiAssessmentDetailResponseDto,
  DailyTimelineItemDto,
} from './dto/ai-assessment-response.dto';

@Injectable()
export class AiAssessmentsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly producer: AiAssessmentProducer,
  ) {}

  async generate(patientId: string): Promise<{ job_id: string }> {
    const jobId = await this.producer.enqueue(patientId);
    return { job_id: jobId };
  }

  async getAssessments(patientId: string): Promise<AiAssessmentResponseDto[]> {
    const assessments = await this.nativeAssessments()
      .find({ patient_id: patientId })
      .sort({ created_at: -1 })
      .toArray();

    return assessments.map((a) => this.toResponseDto(a));
  }

  async getLatest(patientId: string): Promise<AiAssessmentResponseDto | null> {
    const assessment = await this.nativeAssessments()
      .find({ patient_id: patientId })
      .sort({ created_at: -1 })
      .limit(1)
      .toArray();

    return assessment[0] ? this.toResponseDto(assessment[0]) : null;
  }

  async getById(
    patientId: string,
    assessmentId: string,
  ): Promise<AiAssessmentDetailResponseDto> {
    if (!ObjectId.isValid(assessmentId)) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Assessment tidak ditemukan.',
      );
    }

    const assessment = await this.nativeAssessments().findOne({
      _id: new ObjectId(assessmentId),
      patient_id: patientId,
    });

    if (!assessment) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Assessment tidak ditemukan.',
      );
    }

    const timeline = await this.buildTimeline(assessment);

    return { ...this.toResponseDto(assessment), timeline };
  }

  private async buildTimeline(
    assessment: IAiAssessment,
  ): Promise<DailyTimelineItemDto[]> {
    const db = Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    );

    const checkins = await db
      .collection('daily_checkins')
      .find({
        patient_id: assessment.patient_id,
        checkin_date: {
          $gte: assessment.period_start_date,
          $lte: assessment.period_end_date,
        },
      })
      .sort({ checkin_date: 1 })
      .toArray();

    if (checkins.length === 0) return [];

    const checkinIds = checkins.map((c) => String(c._id));
    const checkinSymptoms = await db
      .collection('checkin_symptoms')
      .find({ checkin_id: { $in: checkinIds } })
      .toArray();

    const symptomIds = [
      ...new Set(checkinSymptoms.map((cs) => cs.symptom_id as string)),
    ];
    const symptoms =
      symptomIds.length > 0
        ? await db
            .collection('symptoms')
            .find({ _id: { $in: symptomIds.map((id) => new ObjectId(id)) } })
            .toArray()
        : [];

    const symptomNameMap = new Map(
      symptoms.map((s) => [String(s._id), s.name as string]),
    );
    const symptomsByCheckin = new Map<string, typeof checkinSymptoms>();
    for (const cs of checkinSymptoms) {
      const key = cs.checkin_id as string;
      const arr = symptomsByCheckin.get(key) ?? [];
      arr.push(cs);
      symptomsByCheckin.set(key, arr);
    }

    return checkins.map((c) => {
      const related = symptomsByCheckin.get(String(c._id)) ?? [];
      return {
        date: (c.checkin_date as Date).toISOString().split('T')[0],
        has_taken_medicine: c.has_taken_medicine as boolean,
        severity: (c.severity as SeverityLevel) ?? null,
        symptoms: related.map(
          (cs) => symptomNameMap.get(cs.symptom_id as string) ?? '',
        ),
      };
    });
  }

  private toResponseDto(a: IAiAssessment): AiAssessmentResponseDto {
    return {
      _id: String(a._id),
      patient_id: a.patient_id,
      period_start_date: a.period_start_date,
      period_end_date: a.period_end_date,
      analyzed_days: a.analyzed_days,
      risk_level: a.risk_level,
      summary: a.summary,
      recommendation: a.recommendation,
      should_consult_doctor: a.should_consult_doctor,
      model_name: a.model_name,
      created_at: a.created_at!,
    };
  }

  private nativeAssessments() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<IAiAssessment>('ai_assessments');
  }
}
