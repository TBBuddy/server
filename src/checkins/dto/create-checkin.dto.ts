import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { SeverityLevel } from '../../common/enums/severity-level.enum';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCheckinSymptomDto {
  @ApiProperty()
  @IsMongoId()
  symptomId!: string;

  @ApiProperty({
    enum: [SeverityLevel.MILD, SeverityLevel.MODERATE, SeverityLevel.SEVERE],
  })
  @IsEnum(SeverityLevel)
  severity!: SeverityLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateCheckinDto {
  @ApiProperty()
  @IsBoolean()
  hasTakenMedicine!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasComplaint?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  takenAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  skippedReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  generalNote?: string;

  @ApiPropertyOptional({ type: [CreateCheckinSymptomDto] })
  @IsOptional()
  @IsArray()
  @ArrayUnique((symptom: CreateCheckinSymptomDto) => symptom.symptomId)
  @ValidateNested({ each: true })
  @Type(() => CreateCheckinSymptomDto)
  symptoms?: CreateCheckinSymptomDto[];
}
