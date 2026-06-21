import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface IPatientProfile extends IMongoloquentSchema {
  user_id: string;
  diagnosis_date: Date;
  medicine_time: string;
  treatment_start_date: Date | null;
  estimated_treatment_end_date: Date | null;
  treatment_day_count: number;
  treatment_duration_months: number;
  has_dropped_before: boolean;
  previous_treatment_note: string | null;
  current_streak: number;
  longest_streak: number;
  total_checkins: number;
  total_missed_days: number;
  created_at?: Date;
  updated_at?: Date;
}

export class PatientProfile extends Model<IPatientProfile> {
  public static $schema: IPatientProfile;
  protected $collection = 'patient_profiles';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
