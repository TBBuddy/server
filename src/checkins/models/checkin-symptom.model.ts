import { IMongoloquentSchema, Model } from 'mongoloquent';
import { SeverityLevel } from '../../common/enums/severity-level.enum';

export interface ICheckinSymptom extends IMongoloquentSchema {
  checkin_id: string;
  patient_id: string;
  symptom_id: string;
  severity: SeverityLevel;
  note: string | null;
  created_at?: Date;
}

export class CheckinSymptom extends Model<ICheckinSymptom> {
  public static $schema: ICheckinSymptom;

  protected $collection = 'checkin_symptoms';

  constructor() {
    super();
    this.setCreatedAt('created_at');
  }
}
