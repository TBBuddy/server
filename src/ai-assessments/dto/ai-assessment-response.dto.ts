import { ApiProperty } from '@nestjs/swagger';
import { AiRiskLevel } from '../../common/enums/ai-risk-level.enum';
import { SeverityLevel } from '../../common/enums/severity-level.enum';

export class DailyTimelineItemDto {
  @ApiProperty() date!: string;
  @ApiProperty() has_taken_medicine!: boolean;
  @ApiProperty({ enum: SeverityLevel, nullable: true })
  severity!: SeverityLevel | null;
  @ApiProperty({ type: [String] }) symptoms!: string[];
}

export class AiAssessmentResponseDto {
  @ApiProperty() _id!: string;
  @ApiProperty() patient_id!: string;
  @ApiProperty() patient_profile_id!: string;
  @ApiProperty() period_start_date!: Date;
  @ApiProperty() period_end_date!: Date;
  @ApiProperty() analyzed_days!: number;
  @ApiProperty({ enum: AiRiskLevel }) risk_level!: AiRiskLevel;
  @ApiProperty() summary!: string;
  @ApiProperty({ nullable: true }) recommendation!: string | null;
  @ApiProperty() should_consult_doctor!: boolean;
  @ApiProperty() model_name!: string;
  @ApiProperty() created_at!: Date;
}

export class AiAssessmentDetailResponseDto extends AiAssessmentResponseDto {
  @ApiProperty({ type: [DailyTimelineItemDto] })
  timeline!: DailyTimelineItemDto[];
}
