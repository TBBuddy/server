import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface IMedicineStock extends IMongoloquentSchema {
  patient_id: string;
  patient_profile_id: string;
  medicine_name: string;
  medicine_type: string | null;
  quantity: number;
  unit: string;
  daily_dose: number;
  threshold_quantity: number;
  source_facility_id: string | null;
  last_restock_at: Date | null;
  next_estimated_empty_date: Date | null;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class MedicineStock extends Model<IMedicineStock> {
  public static $schema: IMedicineStock;
  protected $collection = 'medicine_stocks';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
