import { IUser } from '../user.model';
import { AuthSessionUserDto } from '../dto/user-response.dto';

export class UserSerializer {
  static toAuthSession(
    user: IUser,
    patientState: {
      hasActivePatientProfile: boolean;
      hasPatientHistory: boolean;
    },
  ): AuthSessionUserDto {
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
      isOnboardingCompleted: patientState.hasActivePatientProfile,
      hasActivePatientProfile: patientState.hasActivePatientProfile,
      hasPatientHistory: patientState.hasPatientHistory,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }
}
