import { UserRole } from '../../common/enums/user-role.enum';
import { IUser } from '../user.model';
import { AuthSessionUserDto } from '../dto/user-response.dto';

export class UserSerializer {
  static toAuthSession(user: IUser, hasPatientProfile: boolean): AuthSessionUserDto {
    return {
      id: user._id.toHexString(),
      email: user.email,
      username: user.username,
      fullName: user.full_name,
      avatarUrl: user.avatar_url,
      phoneNumber: user.phone_number,
      role: user.role,
      treatmentStatus: user.treatment_status,
      isVerified: user.is_verified,
      isActive: user.is_active,
      // F02 replaces this derivation with patient-profile existence.
      isOnboardingCompleted: user.role !== UserRole.PATIENT ? true : hasPatientProfile,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }
}
