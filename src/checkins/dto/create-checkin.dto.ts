import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
  IsMongoId,
} from 'class-validator';
import { SeverityLevel } from '../../common/enums/severity-level.enum';

export class CreateCheckinSymptomDto {
  @ApiProperty() @IsMongoId() symptom_id!: string;
  @ApiProperty({ enum: SeverityLevel })
  @IsEnum(SeverityLevel)
  severity!: SeverityLevel;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class CreateCheckinDto {
  @ApiProperty() @IsBoolean() has_taken_medicine!: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() has_complaint?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() taken_at?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() skipped_reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() general_note?: string;
  @ApiPropertyOptional({ type: [CreateCheckinSymptomDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCheckinSymptomDto)
  symptoms?: CreateCheckinSymptomDto[];
}
