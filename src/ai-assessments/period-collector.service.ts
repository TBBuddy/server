import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Database } from 'mongoloquent';
import { ObjectId } from 'mongodb';
import { startOfDay, subDays, format } from 'date-fns';
import { AppException } from '../common/exceptions/app.exception';
import type { IDailyCheckin } from '../checkins/models/daily-checkin.model';
import type { ICheckinSymptom } from '../checkins/models/checkin-symptom.model';
import type { ISymptom } from '../checkins/models/symptom.model';

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
  constructor(private readonly configService: ConfigService) {}

  async collect(patientId: string): Promise<PeriodData> {
    const today = startOfDay(new Date());
    const periodEnd = subDays(today, 1);
    const periodStart = subDays(today, 14);

    const checkins = await this.nativeCheckins()
      .find({
        patient_id: patientId,
        checkin_date: { $gte: periodStart, $lte: periodEnd },
      })
      .sort({ checkin_date: 1 })
      .toArray();

    if (checkins.length < 7) {
      throw new AppException(
        422,
        'INSUFFICIENT_DATA',
        'Minimal 7 hari data check-in diperlukan untuk membuat assessment.',
      );
    }

    const checkinIds = checkins.map((c) => String(c._id));

    const checkinSymptoms = await this.nativeCheckinSymptoms()
      .find({ checkin_id: { $in: checkinIds } })
      .toArray();

    const symptomIds = [...new Set(checkinSymptoms.map((cs) => cs.symptom_id))];

    const symptoms = await this.nativeSymptoms()
      .find({ _id: { $in: symptomIds.map((id) => new ObjectId(id)) } })
      .toArray();

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

  private nativeCheckins() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<IDailyCheckin>('daily_checkins');
  }

  private nativeCheckinSymptoms() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<ICheckinSymptom>('checkin_symptoms');
  }

  private nativeSymptoms() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<ISymptom>('symptoms');
  }
}
