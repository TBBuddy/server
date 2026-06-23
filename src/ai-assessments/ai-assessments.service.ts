import { Injectable } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { InjectModel } from '@mongoloquent/nestjs';
import { AppException } from '../common/exceptions/app.exception';
import { AiAssessmentProducer } from './ai-assessment.producer';
import { AiAssessment, type IAiAssessment } from './models/ai-assessment.model';
import type {
  AiAssessmentResponseDto,
  AiAssessmentDetailResponseDto,
  DailyTimelineItemDto,
} from './dto/ai-assessment-response.dto';
import { PatientsIndexService } from '../patients/patients-index.service';
import { DailyCheckin } from '../checkins/models/daily-checkin.model';
import {
  CheckinSymptom,
  type ICheckinSymptom,
} from '../checkins/models/checkin-symptom.model';
import { Symptom, type ISymptom } from '../checkins/models/symptom.model';

@Injectable()
export class AiAssessmentsService {
  constructor(
    private readonly producer: AiAssessmentProducer,
    private readonly patientsIndex: PatientsIndexService,
    @InjectModel(AiAssessment)
    private readonly assessmentModel: typeof AiAssessment,
    @InjectModel(DailyCheckin)
    private readonly checkinModel: typeof DailyCheckin,
    @InjectModel(CheckinSymptom)
    private readonly checkinSymptomModel: typeof CheckinSymptom,
    @InjectModel(Symptom)
    private readonly symptomModel: typeof Symptom,
  ) {}

  async generate(patientId: string): Promise<{ job_id: string }> {
    const profile = await this.patientsIndex.getPatientProfile(patientId);
    const jobId = await this.producer.enqueue(
      patientId,
      profile._id.toHexString(),
    );
    return { job_id: jobId };
  }

  async getAssessments(patientId: string): Promise<AiAssessmentResponseDto[]> {
    const profile = await this.patientsIndex.getPatientProfile(patientId);
    const assessments = await this.assessmentModel
      .where('patient_id', patientId)
      .where('patient_profile_id', profile._id.toHexString())
      .orderBy('created_at', 'desc')
      .get();

    return assessments.map((a) => this.toResponseDto(a));
  }

  async getLatest(patientId: string): Promise<AiAssessmentResponseDto | null> {
    const profile = await this.patientsIndex.getPatientProfile(patientId);
    const assessment = await this.assessmentModel
      .where('patient_id', patientId)
      .where('patient_profile_id', profile._id.toHexString())
      .orderBy('created_at', 'desc')
      .first();

    return assessment ? this.toResponseDto(assessment) : null;
  }

  async getById(
    patientId: string,
    assessmentId: string,
  ): Promise<AiAssessmentDetailResponseDto> {
    const profile = await this.patientsIndex.getPatientProfile(patientId);
    if (!ObjectId.isValid(assessmentId)) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Assessment tidak ditemukan.',
      );
    }

    const assessment = await this.assessmentModel
      .where('_id', new ObjectId(assessmentId))
      .where('patient_id', patientId)
      .where('patient_profile_id', profile._id.toHexString())
      .first();

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
    const checkins = await this.checkinModel
      .where('patient_id', assessment.patient_id)
      .where('patient_profile_id', assessment.patient_profile_id)
      .where('checkin_date', '>=', assessment.period_start_date)
      .where('checkin_date', '<=', assessment.period_end_date)
      .orderBy('checkin_date', 'asc')
      .get();

    if (checkins.length === 0) return [];

    const checkinIds = checkins.map((c) => String(c._id));
    const checkinSymptoms: ICheckinSymptom[] = Array.from(
      await this.checkinSymptomModel
        .whereIn('checkin_id', checkinIds)
        .where('patient_profile_id', assessment.patient_profile_id)
        .get(),
    );

    const symptomIds = [...new Set(checkinSymptoms.map((cs) => cs.symptom_id))];
    const symptoms: ISymptom[] =
      symptomIds.length > 0
        ? Array.from(
            await this.symptomModel
              .whereIn(
                '_id',
                symptomIds.map((id) => new ObjectId(id)),
              )
              .get(),
          )
        : [];

    const symptomNameMap = new Map(
      symptoms.map((s) => [String(s._id), s.name]),
    );
    const symptomsByCheckin = new Map<string, ICheckinSymptom[]>();
    for (const cs of checkinSymptoms) {
      const key = cs.checkin_id;
      const arr = symptomsByCheckin.get(key) ?? [];
      arr.push(cs);
      symptomsByCheckin.set(key, arr);
    }

    return checkins.map((c) => {
      const related = symptomsByCheckin.get(String(c._id)) ?? [];
      return {
        date: c.checkin_date.toISOString().split('T')[0],
        has_taken_medicine: c.has_taken_medicine,
        severity: c.severity ?? null,
        symptoms: related.map((cs) => symptomNameMap.get(cs.symptom_id) ?? ''),
      };
    });
  }

  private toResponseDto(a: IAiAssessment): AiAssessmentResponseDto {
    return {
      _id: String(a._id),
      patient_id: a.patient_id,
      patient_profile_id: a.patient_profile_id,
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
}
