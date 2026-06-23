import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface ITravelPlan extends IMongoloquentSchema {
  patient_id: string;
  patient_profile_id: string;
  destination: string;
  departure_date: Date;
  return_date: Date;
  cancelled_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export class TravelPlan extends Model<ITravelPlan> {
  public static $schema: ITravelPlan;
  protected $collection = 'travel_plans';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
