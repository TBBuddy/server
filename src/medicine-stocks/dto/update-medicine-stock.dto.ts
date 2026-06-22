import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  IsPositive,
  IsOptional,
  IsMongoId,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateMedicineStockDto {
  @ApiPropertyOptional({ example: 'Rifampicin 600mg' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  medicineName?: string;

  @ApiPropertyOptional({ example: 'OAT' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  medicineType?: string;

  @ApiPropertyOptional({ example: 'tablet' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  dailyDose?: number;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  thresholdQuantity?: number;

  @ApiPropertyOptional({ example: '6853a5edc9e4978ed92bca10' })
  @IsOptional()
  @IsMongoId()
  sourceFacilityId?: string;
}