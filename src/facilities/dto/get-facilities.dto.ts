import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class GetFacilitiesDto {
  @ApiPropertyOptional({
    example: 'Jakarta',
    description: 'Filter berdasarkan kota (case-insensitive)',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    example: 'Puskesmas',
    description: 'Tipe fasilitias: Puskesmas | Rumah Sakit | Klinik',
  })
  @IsOptional()
  @IsString()
  facility_type?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Filter hanya fasilitas yang melayani TB',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  is_tb_service_available?: boolean;
}
