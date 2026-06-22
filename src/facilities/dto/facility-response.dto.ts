import { ApiProperty } from '@nestjs/swagger';

export class FacilityResponseDto {
  @ApiProperty()
  _id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  facility_type!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  province!: string;

  @ApiProperty({ nullable: true })
  phone_number!: string | null;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty({ nullable: true })
  operating_hours!: string | null;

  @ApiProperty()
  source!: string;

  @ApiProperty()
  is_tb_service_available!: boolean;

  @ApiProperty()
  is_active!: boolean;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;
}

export class NearbyFacilityResponseDto extends FacilityResponseDto {
  @ApiProperty({ description: 'Jarak dari koordinat input, dalam kilometer' })
  distance_km!: number;
}
