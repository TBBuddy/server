import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface IAiAssessmentCheckinSymptom extends IMongoloquentSchema {
  ai_assessment_id: string;
  checkin_symptom_id: string;
  created_at?: Date;
}

export class AiAssessmentCheckinSymptom extends Model<IAiAssessmentCheckinSymptom> {
  public static $schema: IAiAssessmentCheckinSymptom;

  protected $collection = 'ai_assessment_checkin_symptoms';

  constructor() {
    super();
    this.setCreatedAt('created_at');
  }
}
