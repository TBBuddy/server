import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PatientProfileStatus } from '../../common/enums/patient-profile-status.enum';

const CLOSING_STATUSES = [
  PatientProfileStatus.RECOVERED,
  PatientProfileStatus.DROPPED,
  PatientProfileStatus.CANCELLED,
] as const;

export class ClosePatientProfileDto {
  @ApiProperty({ enum: CLOSING_STATUSES })
  @IsIn(CLOSING_STATUSES)
  outcome!:
    | PatientProfileStatus.RECOVERED
    | PatientProfileStatus.DROPPED
    | PatientProfileStatus.CANCELLED;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
