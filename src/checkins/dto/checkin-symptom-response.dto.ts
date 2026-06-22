import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SeverityLevel } from '../../common/enums/severity-level.enum';

export class CheckinSymptomResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() symptomId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: SeverityLevel }) severity!: SeverityLevel;
  @ApiPropertyOptional({ nullable: true }) note!: string | null;
}
