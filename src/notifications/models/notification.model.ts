import { IMongoloquentSchema, Model } from 'mongoloquent';
import { NotificationDeliveryStatus } from '../enums/notification-status.enum';
import { NotificationType } from '../enums/notification-type.enum';

export interface NotificationChannelResult {
  status: NotificationDeliveryStatus;
  sent_at?: Date | null;
  failed_at?: Date | null;
  skipped_at?: Date | null;
  reason?: string | null;
  provider_message_id?: string | null;
  tickets?: Array<Record<string, unknown>>;
  receipts?: Array<Record<string, unknown>>;
}

export interface NotificationChannelResults {
  in_app: NotificationChannelResult;
  push?: NotificationChannelResult;
  email?: NotificationChannelResult;
}

export interface INotification extends IMongoloquentSchema {
  recipient_user_id: string;
  patient_id: string;
  patient_profile_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  deep_link: string | null;
  metadata: Record<string, unknown>;
  logical_key: string | null;
  scheduled_for: Date | null;
  status: NotificationDeliveryStatus;
  channels: NotificationChannelResults;
  read_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export class Notification extends Model<INotification> {
  public static $schema: INotification;
  protected $collection = 'notifications';

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
