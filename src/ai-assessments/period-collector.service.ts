import { Injectable } from '@nestjs/common';
import { InjectModel } from '@mongoloquent/nestjs';
import { ObjectId } from 'mongodb';
import { startOfDay, subDays, format } from 'date-fns';
import { AppException } from '../common/exceptions/app.exception';
import { DailyCheckin } from '../checkins/models/daily-checkin.model';
import {
  CheckinSymptom,
  type ICheckinSymptom,
} from '../checkins/models/checkin-symptom.model';
import { Symptom } from '../checkins/models/symptom.model';

export interface DayData {
  date: string;
  has_taken_medicine: boolean;
  severity: string | null;
  symptom_names: string[];
  checkin_symptom_ids: string[];
}

export interface PeriodData {
  days: DayData[];
  period_start_date: Date;
  period_end_date: Date;
  analyzed_days: number;
}

@Injectable()
export class PeriodCollectorService {
  constructor(
    @InjectModel(DailyCheckin)
    private readonly checkinModel: typeof DailyCheckin,
    @InjectModel(CheckinSymptom)
    private readonly checkinSymptomModel: typeof CheckinSymptom,
    @InjectModel(Symptom)
    private readonly symptomModel: typeof Symptom,
  ) {}

  async collect(
    patientId: string,
    patientProfileId: string,
  ): Promise<PeriodData> {
    const today = startOfDay(new Date());
    const periodEnd = subDays(today, 1);
    const periodStart = subDays(today, 14);

    const checkins = await this.checkinModel
      .where('patient_id', patientId)
      .where('patient_profile_id', patientProfileId)
      .where('checkin_date', '>=', periodStart)
      .where('checkin_date', '<=', periodEnd)
      .orderBy('checkin_date', 'asc')
      .get();

    if (checkins.length < 7) {
      throw new AppException(
        422,
        'INSUFFICIENT_DATA',
        'Minimal 7 hari data check-in diperlukan untuk membuat assessment.',
      );
    }

    const checkinIds = checkins.map((c) => String(c._id));

    const checkinSymptoms = await this.checkinSymptomModel
      .whereIn('checkin_id', checkinIds)
      .where('patient_profile_id', patientProfileId)
      .get();

    const symptomIds = [...new Set(checkinSymptoms.map((cs) => cs.symptom_id))];

    const symptoms = await this.symptomModel
      .whereIn(
        '_id',
        symptomIds.map((id) => new ObjectId(id)),
      )
      .get();

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

    const days: DayData[] = checkins.map((checkin) => {
      const id = String(checkin._id);
      const relatedSymptoms = symptomsByCheckin.get(id) ?? [];
      return {
        date: format(new Date(checkin.checkin_date), 'yyyy-MM-dd'),
        has_taken_medicine: checkin.has_taken_medicine,
        severity: checkin.severity ?? null,
        symptom_names: relatedSymptoms.map(
          (cs) => symptomNameMap.get(cs.symptom_id) ?? cs.symptom_id,
        ),
        checkin_symptom_ids: relatedSymptoms.map((cs) => String(cs._id)),
      };
    });

    return {
      days,
      period_start_date: new Date(checkins[0].checkin_date),
      period_end_date: new Date(checkins[checkins.length - 1].checkin_date),
      analyzed_days: checkins.length,
    };
  }
}
