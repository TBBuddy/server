import { IMongoloquentSchema, Model } from 'mongoloquent';
import { AiRiskLevel } from '../../common/enums/ai-risk-level.enum';

export interface IAiAssessment extends IMongoloquentSchema {
  patient_id: string;
  period_start_date: Date;
  period_end_date: Date;
  analyzed_days: number;
  risk_level: AiRiskLevel;
  summary: string;
  recommendation: string | null;
  should_consult_doctor: boolean;
  model_name: string;
  prompt_snapshot: string | null;
  raw_response: Record<string, unknown> | null;
  created_at?: Date;
}

export class AiAssessment extends Model<IAiAssessment> {
  public static $schema: IAiAssessment;

  protected $collection = 'ai_assessments';

  constructor() {
    super();
    this.setCreatedAt('created_at');
  }
}
