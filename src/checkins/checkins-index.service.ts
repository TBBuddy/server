import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Database } from 'mongoloquent';
import { ISymptom } from './models/symptom.model';
import { IDailyCheckin } from './models/daily-checkin.model';
import { ICheckinSymptom } from './models/checkin-symptom.model';

@Injectable()
export class CheckinsIndexService implements OnApplicationBootstrap {
  constructor(private readonly configService: ConfigService) {}

  async onApplicationBootstrap(): Promise<void> {
    const database = Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    );

    const symptoms = database.collection<ISymptom>('symptoms');
    await symptoms.createIndexes([
      { key: { name: 1 }, name: 'symptoms_name', unique: true },
      { key: { category: 1 }, name: 'symptoms_category' },
      {
        key: { is_common_tb_symptom: 1 },
        name: 'symptoms_is_common_tb_symptom',
      },
    ]);

    const checkins = database.collection<IDailyCheckin>('daily_checkins');
    await checkins.createIndexes([
      {
        key: { patient_id: 1, checkin_date: 1 },
        name: 'daily_checkins_patient_date',
        unique: true,
      },
      { key: { patient_id: 1 }, name: 'daily_checkins_patient_id' },
      { key: { checkin_date: 1 }, name: 'daily_checkins_date' },
      {
        key: { has_taken_medicine: 1 },
        name: 'daily_checkins_has_taken_medicine',
      },
      { key: { severity: 1 }, name: 'daily_checkins_severity' },
    ]);

    const checkinSymptoms =
      database.collection<ICheckinSymptom>('checkin_symptoms');
    await checkinSymptoms.createIndexes([
      { key: { checkin_id: 1 }, name: 'checkin_symptoms_checkin_id' },
      { key: { patient_id: 1 }, name: 'checkin_symptoms_patient_id' },
      {
        key: { checkin_id: 1, symptom_id: 1 },
        name: 'checkin_symptoms_checkin_symptom',
        unique: true,
      },
      { key: { severity: 1 }, name: 'checkin_symptoms_severity' },
    ]);
  }
}
