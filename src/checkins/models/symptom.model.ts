import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface ISymptom extends IMongoloquentSchema {
  name: string;
  description: string | null;
  category: string | null;
  is_common_tb_symptom: boolean;
  is_possible_side_effect: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class Symptom extends Model<ISymptom> {
  public static $schema: ISymptom;

  protected $collection = 'symptoms';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
