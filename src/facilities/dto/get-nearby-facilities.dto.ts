import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class GetNearbyFacilitiesDto {
  @ApiProperty({ example: -6.2088, description: 'Latitude posisi user' })
  @Transform(({ value }) => parseFloat(value as string))
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 106.8456, description: 'Longitude posisi user' })
  @Transform(({ value }) => parseFloat(value as string))
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({
    example: 5000,
    description: 'Radius pencarian dalam meter (default: 5000, max: 50000)',
    default: 5000,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsNumber()
  @Min(100)
  @Max(50000)
  radius?: number;
}
