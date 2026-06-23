import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SeverityLevel } from '../../common/enums/severity-level.enum';
import { CheckinSymptomResponseDto } from './checkin-symptom-response.dto';

export class DailyCheckinResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ example: '2026-06-22' }) checkinDate!: string;
  @ApiProperty() treatmentDayNumber!: number;
  @ApiProperty() hasTakenMedicine!: boolean;
  @ApiPropertyOptional({ nullable: true }) takenAt!: string | null;
  @ApiProperty() hasComplaint!: boolean;
  @ApiProperty({ enum: SeverityLevel }) severity!: SeverityLevel;
  @ApiPropertyOptional({ nullable: true }) generalNote!: string | null;
  @ApiPropertyOptional({ nullable: true }) skippedReason!: string | null;
  @ApiProperty({ type: [CheckinSymptomResponseDto] })
  symptoms!: CheckinSymptomResponseDto[];
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class DailyCheckinDataResponseDto {
  @ApiProperty({ type: DailyCheckinResponseDto, nullable: true })
  data!: DailyCheckinResponseDto | null;
}

export class CheckinPaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
  @ApiProperty() hasNextPage!: boolean;
  @ApiProperty() hasPreviousPage!: boolean;
}

export class PaginatedCheckinResponseDto {
  @ApiProperty({ type: [DailyCheckinResponseDto] })
  data!: DailyCheckinResponseDto[];
  @ApiProperty({ type: CheckinPaginationMetaDto })
  meta!: CheckinPaginationMetaDto;
}
