import { ApiProperty } from '@nestjs/swagger';
import { SeverityLevel } from '../../common/enums/severity-level.enum';

export class CheckinSymptomResponseDto {
  @ApiProperty() _id!: string;
  @ApiProperty() symptom_id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: SeverityLevel }) severity!: SeverityLevel;
  @ApiProperty({ nullable: true }) note!: string | null;
}
