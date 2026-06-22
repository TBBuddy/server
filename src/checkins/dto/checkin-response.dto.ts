import { ApiProperty } from '@nestjs/swagger';
import { SeverityLevel } from '../../common/enums/severity-level.enum';
import { CheckinSymptomResponseDto } from './checkin-symptom-response.dto';

export class CheckinResponseDto {
  @ApiProperty() _id!: string;
  @ApiProperty() patient_id!: string;
  @ApiProperty() checkin_date!: Date;
  @ApiProperty() treatment_day_number!: number;
  @ApiProperty() has_taken_medicine!: boolean;
  @ApiProperty({ nullable: true }) taken_at!: Date | null;
  @ApiProperty() has_complaint!: boolean;
  @ApiProperty({ enum: SeverityLevel, nullable: true })
  severity!: SeverityLevel | null;
  @ApiProperty({ nullable: true }) general_note!: string | null;
  @ApiProperty({ nullable: true }) skipped_reason!: string | null;
  @ApiProperty({ type: [CheckinSymptomResponseDto] })
  symptoms!: CheckinSymptomResponseDto[];
  @ApiProperty() created_at!: Date;
  @ApiProperty() updated_at!: Date;
}
