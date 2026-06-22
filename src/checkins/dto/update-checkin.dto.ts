import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  ValidateNested,
  IsArray,
  IsMongoId,
  IsEnum,
} from 'class-validator';
import { SeverityLevel } from '../../common/enums/severity-level.enum';

export class UpdateCheckinSymptomDto {
  @ApiPropertyOptional() @IsOptional() @IsMongoId() symptom_id?: string;
  @ApiPropertyOptional({ enum: SeverityLevel })
  @IsOptional()
  @IsEnum(SeverityLevel)
  severity?: SeverityLevel;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

export class UpdateCheckinDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  has_taken_medicine?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() has_complaint?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsDateString() taken_at?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() skipped_reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() general_note?: string;
  @ApiPropertyOptional({ type: [UpdateCheckinSymptomDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCheckinSymptomDto)
  symptoms?: UpdateCheckinSymptomDto[];
}
