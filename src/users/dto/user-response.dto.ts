import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TreatmentStatus } from '../../common/enums/treatment-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';

export class AuthSessionUserDto {
  @ApiProperty({ example: '6853a5edc9e4978ed92bca10' })
  id!: string;

  @ApiProperty({ example: 'aulia@example.com' })
  email!: string;

  @ApiProperty({ example: 'aulia_diaz' })
  username!: string;

  @ApiPropertyOptional({ example: 'Aulia Diaz', nullable: true })
  fullName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  avatarUrl!: string | null;

  @ApiPropertyOptional({ example: '+6281234567890', nullable: true })
  phoneNumber!: string | null;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ enum: TreatmentStatus })
  treatmentStatus!: TreatmentStatus;

  @ApiProperty()
  isVerified!: boolean;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  isOnboardingCompleted!: boolean;

  @ApiProperty()
  hasActivePatientProfile!: boolean;

  @ApiProperty()
  hasPatientHistory!: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  createdAt?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  updatedAt?: Date;
}

export class AuthSessionResponseDto {
  @ApiProperty({ type: AuthSessionUserDto })
  data!: AuthSessionUserDto;
}
