import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsPositive,
  IsOptional,
  IsMongoId,
  Min,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateMedicineStockDto {
  @ApiProperty({ example: 'Rifampicin' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  medicineName!: string;

  @ApiPropertyOptional({ example: 'OAT' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(50)
  medicineType?: string;

  @ApiProperty({ example: 60 })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantity!: number;

  @ApiPropertyOptional({ example: 'tablet', default: 'tablet' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(20)
  unit?: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  dailyDose!: number;

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
