import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

const toNumber = ({ value }: { value: unknown }): number => Number(value);

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

export class GetNearbyFacilitiesDto {
  @ApiProperty({ example: -6.2088, description: 'Latitude posisi user' })
  @Transform(toNumber)
  @IsDefined()
  lat!: number;

  @ApiProperty({ example: 106.8456, description: 'Longitude posisi user' })
  @Transform(toNumber)
  @IsDefined()
  lng!: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Radius pencarian dalam meter (default: 5000, max: 50000)',
    default: 5000,
  })
  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(100)
  @Max(50000)
  radius?: number;

  @ApiPropertyOptional({
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter fasilitas berdasarkan ketersediaan layanan TB.',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isTbServiceAvailable?: boolean;
}
