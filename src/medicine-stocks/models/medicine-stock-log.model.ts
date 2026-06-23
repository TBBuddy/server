import { IMongoloquentSchema, Model } from 'mongoloquent';

export type StockLogReason =
  | 'CHECK_IN'
  | 'RESTOCK'
  | 'ADJUSTMENT'
  | 'TRAVEL_PREPARATION';

export interface IMedicineStockLog extends IMongoloquentSchema {
  medicine_stock_id: string;
  patient_id: string;
  patient_profile_id: string;
  change_quantity: number;
  previous_quantity: number;
  current_quantity: number;
  reason: StockLogReason;
  note: string | null;
  operation_key: string | null;
  created_at?: Date;
}

export class MedicineStockLog extends Model<IMedicineStockLog> {
  public static $schema: IMedicineStockLog;
  protected $collection = 'medicine_stock_logs';

  constructor() {
    super();
    this.setCreatedAt('created_at');
  }
}
