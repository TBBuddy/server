import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toNumber = ({ value }: { value: unknown }): number => Number(value);

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

export class GetFacilitiesDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({
    example: 'puskesmas gambir',
    description: 'Cari nama, alamat, kota, atau provinsi.',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    example: 'Jakarta',
    description: 'Filter berdasarkan kota (case-insensitive)',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({
    example: 'Puskesmas',
    description: 'Tipe fasilitas.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['Puskesmas', 'Rumah Sakit', 'Klinik Umum'])
  facilityType?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter hanya fasilitas yang melayani TB',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isTbServiceAvailable?: boolean;

  @ApiPropertyOptional({
    enum: ['name', 'city', 'facilityType', 'createdAt'],
    default: 'name',
  })
  @IsOptional()
  @IsIn(['name', 'city', 'facilityType', 'createdAt'])
  sortBy: 'name' | 'city' | 'facilityType' | 'createdAt' = 'name';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';
}
