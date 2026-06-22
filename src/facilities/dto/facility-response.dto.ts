import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class HealthFacilitySummaryResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  facilityType!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty()
  city!: string;

  @ApiProperty()
  province!: string;

  @ApiPropertyOptional({ nullable: true })
  phoneNumber!: string | null;

  @ApiProperty()
  latitude!: number;

  @ApiProperty()
  longitude!: number;

  @ApiProperty()
  isTbServiceAvailable!: boolean;
}

export class HealthFacilityDetailResponseDto extends HealthFacilitySummaryResponseDto {
  @ApiPropertyOptional({ nullable: true })
  operatingHours!: string | null;

  @ApiProperty()
  source!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  createdAt?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  updatedAt?: Date;
}

export class NearbyHealthFacilityResponseDto extends HealthFacilitySummaryResponseDto {
  @ApiProperty({ description: 'Jarak dari koordinat input dalam kilometer.' })
  distanceKm!: number;
}

export class PaginationMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;

  @ApiProperty()
  hasNextPage!: boolean;

  @ApiProperty()
  hasPreviousPage!: boolean;
}

export class PaginatedHealthFacilityResponseDto {
  @ApiProperty({ type: [HealthFacilitySummaryResponseDto] })
  data!: HealthFacilitySummaryResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;
}

export class NearbyHealthFacilityDataResponseDto {
  @ApiProperty({ type: [NearbyHealthFacilityResponseDto] })
  data!: NearbyHealthFacilityResponseDto[];
}

export class HealthFacilityDetailDataResponseDto {
  @ApiProperty({ type: HealthFacilityDetailResponseDto })
  data!: HealthFacilityDetailResponseDto;
}
