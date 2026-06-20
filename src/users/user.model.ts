import { IMongoloquentSchema, Model } from 'mongoloquent';
import { TreatmentStatus } from '../common/enums/treatment-status.enum';
import { UserRole } from '../common/enums/user-role.enum';

export interface IUser extends IMongoloquentSchema {
  email: string;
  username: string;
  password_hash: string;
  full_name: string | null;
  avatar_url: string | null;
  phone_number: string | null;
  push_notification_tokens: string[];
  role: UserRole;
  treatment_status: TreatmentStatus;
  is_verified: boolean;
  is_active: boolean;
  last_login_at: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export class User extends Model<IUser> {
  public static $schema: IUser;

  protected $collection = 'users';
  protected $hidden: (keyof IUser)[] = [
    'password_hash',
    'push_notification_tokens',
  ];

  constructor() {
    super();
    this.setCreatedAt('created_at');
    this.setUpdatedAt('updated_at');
  }
}
