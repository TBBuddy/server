import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface IPatientPmo extends IMongoloquentSchema {
  patient_id: string;
  patient_profile_id: string;
  name: string;
  relationship: string | null;
  phone_number: string | null;
  whatsapp_number: string | null;
  email: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class PatientPmo extends Model<IPatientPmo> {
  public static $schema: IPatientPmo;
  protected $collection = 'patient_pmos';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
