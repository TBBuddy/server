import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PatientProfileStatus } from '../../common/enums/patient-profile-status.enum';

export class PatientPmoResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) relationship!: string | null;
  @ApiPropertyOptional({ nullable: true }) phoneNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) whatsappNumber!: string | null;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiProperty() isPrimary!: boolean;
  @ApiProperty() isActive!: boolean;
  @ApiPropertyOptional() createdAt?: Date;
}

export class PatientProfileResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: PatientProfileStatus }) status!: PatientProfileStatus;
  @ApiProperty() diagnosisDate!: Date;
  @ApiProperty() medicineTime!: string;
  @ApiPropertyOptional({ nullable: true }) treatmentStartDate!: Date | null;
  @ApiPropertyOptional({ nullable: true })
  estimatedTreatmentEndDate!: Date | null;
  @ApiProperty() treatmentDayCount!: number;
  @ApiProperty() treatmentDurationMonths!: number;
  @ApiProperty() hasDroppedBefore!: boolean;
  @ApiPropertyOptional({ nullable: true }) previousTreatmentNote!:
    | string
    | null;
  @ApiProperty() currentStreak!: number;
  @ApiProperty() longestStreak!: number;
  @ApiProperty() totalCheckins!: number;
  @ApiProperty() totalMissedDays!: number;
  @ApiPropertyOptional({ nullable: true }) endedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) endedReason!: string | null;
  @ApiProperty({ type: [PatientPmoResponseDto] })
  pmos!: PatientPmoResponseDto[];
  @ApiPropertyOptional() createdAt?: Date;
  @ApiPropertyOptional() updatedAt?: Date;
}

export class PatientHistorySummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PatientProfileStatus }) status!: PatientProfileStatus;
  @ApiProperty() diagnosisDate!: Date;
  @ApiPropertyOptional({ nullable: true }) treatmentStartDate!: Date | null;
  @ApiPropertyOptional({ nullable: true })
  estimatedTreatmentEndDate!: Date | null;
  @ApiPropertyOptional({ nullable: true }) endedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) endedReason!: string | null;
  @ApiProperty() treatmentDurationMonths!: number;
  @ApiProperty() totalCheckins!: number;
}

export class PatientHistoryDataResponseDto {
  @ApiProperty({ type: [PatientHistorySummaryDto] })
  data!: PatientHistorySummaryDto[];
}

export class PatientProfileDataResponseDto {
  @ApiProperty({ type: PatientProfileResponseDto })
  data!: PatientProfileResponseDto;
}

export class PatientDashboardResponseDto {
  @ApiProperty() treatmentDayCount!: number;
  @ApiProperty() treatmentDurationMonths!: number;
  @ApiPropertyOptional({ nullable: true })
  treatmentStartDate!: Date | null;
  @ApiPropertyOptional({ nullable: true })
  estimatedTreatmentEndDate!: Date | null;
  @ApiProperty() medicineTime!: string;
  @ApiProperty() currentStreak!: number;
  @ApiProperty() longestStreak!: number;
  @ApiProperty() totalCheckins!: number;
  @ApiProperty() totalMissedDays!: number;
  @ApiProperty() stockDoses!: number;
  @ApiProperty() hasCheckedInToday!: boolean;
  // Diisi null dulu — akan diisi saat F03, F04, F05, F11 selesai
  @ApiPropertyOptional({ nullable: true }) todayCheckin!: null;
  @ApiPropertyOptional({ nullable: true }) latestAssessment!: null;
  @ApiPropertyOptional({ nullable: true }) stockAlert!: null;
  @ApiPropertyOptional({ nullable: true }) recentBadge!: null;
}

export class PatientDashboardDataResponseDto {
  @ApiProperty({ type: PatientDashboardResponseDto })
  data!: PatientDashboardResponseDto;
}
