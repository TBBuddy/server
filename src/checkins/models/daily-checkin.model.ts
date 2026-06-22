import { IMongoloquentSchema, Model } from 'mongoloquent';
import { SeverityLevel } from '../../common/enums/severity-level.enum';

export interface IDailyCheckin extends IMongoloquentSchema {
  patient_id: string;
  checkin_date: Date;
  treatment_day_number: number;
  has_taken_medicine: boolean;
  taken_at: Date | null;
  has_complaint: boolean;
  severity: SeverityLevel | null;
  general_note: string | null;
  skipped_reason: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export class DailyCheckin extends Model<IDailyCheckin> {
  public static $schema: IDailyCheckin;

  protected $collection = 'daily_checkins';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
