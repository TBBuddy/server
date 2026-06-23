import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@mongoloquent/nestjs';
import { Symptom } from './models/symptom.model';
import { DailyCheckin } from './models/daily-checkin.model';
import { CheckinSymptom } from './models/checkin-symptom.model';

@Injectable()
export class CheckinsIndexService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(Symptom) private readonly symptomModel: typeof Symptom,
    @InjectModel(DailyCheckin)
    private readonly checkinModel: typeof DailyCheckin,
    @InjectModel(CheckinSymptom)
    private readonly checkinSymptomModel: typeof CheckinSymptom,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const symptoms = this.symptomModel.query().getMongoDBCollection();
    await symptoms.createIndexes([
      { key: { name: 1 }, name: 'symptoms_name', unique: true },
      { key: { category: 1 }, name: 'symptoms_category' },
      {
        key: { is_common_tb_symptom: 1 },
        name: 'symptoms_is_common_tb_symptom',
      },
    ]);

    const checkins = this.checkinModel.query().getMongoDBCollection();
    await checkins.createIndexes([
      {
        key: { patient_profile_id: 1, checkin_date: 1 },
        name: 'daily_checkins_profile_date',
        unique: true,
        partialFilterExpression: {
          patient_profile_id: { $type: 'string' },
        },
      },
      { key: { patient_id: 1 }, name: 'daily_checkins_patient_id' },
      {
        key: { patient_profile_id: 1 },
        name: 'daily_checkins_patient_profile_id',
      },
      { key: { checkin_date: 1 }, name: 'daily_checkins_date' },
      {
        key: { has_taken_medicine: 1 },
        name: 'daily_checkins_has_taken_medicine',
      },
      { key: { severity: 1 }, name: 'daily_checkins_severity' },
    ]);

    const checkinSymptoms = this.checkinSymptomModel
      .query()
      .getMongoDBCollection();
    await checkinSymptoms.createIndexes([
      { key: { checkin_id: 1 }, name: 'checkin_symptoms_checkin_id' },
      { key: { patient_id: 1 }, name: 'checkin_symptoms_patient_id' },
      {
        key: { patient_profile_id: 1 },
        name: 'checkin_symptoms_patient_profile_id',
      },
      {
        key: { checkin_id: 1, symptom_id: 1 },
        name: 'checkin_symptoms_checkin_symptom',
        unique: true,
      },
      { key: { severity: 1 }, name: 'checkin_symptoms_severity' },
    ]);
  }
}
