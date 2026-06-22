import { IMongoloquentSchema, Model } from 'mongoloquent';

export interface IGeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

export interface IHealthFacility extends IMongoloquentSchema {
  name: string;
  facility_type: string;
  address: string;
  city: string;
  province: string;
  phone_number: string | null;
  latitude: number;
  longitude: number;
  location: IGeoPoint;
  operating_hours: string | null;
  source: string;
  is_tb_service_available: boolean;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export class HealthFacility extends Model<IHealthFacility> {
  public static $schema: IHealthFacility;

  protected $collection = 'health_facilities';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
