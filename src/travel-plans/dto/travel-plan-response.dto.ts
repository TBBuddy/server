import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TravelPlanStatus } from '../enums/travel-plan-status.enum';

export class TravelStockReadinessItemDto {
  @ApiProperty() stockId!: string;
  @ApiProperty() medicineName!: string;
  @ApiProperty() dailyDose!: number;
  @ApiProperty() durationDays!: number;
  @ApiProperty() neededQuantity!: number;
  @ApiProperty() availableQuantity!: number;
  @ApiProperty() isEnough!: boolean;
  @ApiProperty() shortageQuantity!: number;
}

export class TravelStockReadinessDto {
  @ApiProperty() isAllStockEnough!: boolean;
  @ApiProperty() totalNeeded!: number;
  @ApiProperty() totalAvailable!: number;
  @ApiProperty({ type: [TravelStockReadinessItemDto] })
  stocks!: TravelStockReadinessItemDto[];
}

export class TravelPlanSummaryResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() patientId!: string;
  @ApiProperty() patientProfileId!: string;
  @ApiProperty() destination!: string;
  @ApiProperty() departureDate!: string;
  @ApiProperty() returnDate!: string;
  @ApiProperty() durationDays!: number;
  @ApiProperty({ enum: TravelPlanStatus }) status!: TravelPlanStatus;
  @ApiProperty() isEditable!: boolean;
  @ApiProperty({ type: TravelStockReadinessDto })
  stockReadiness!: TravelStockReadinessDto;
  @ApiPropertyOptional({ nullable: true }) cancelledAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class TravelPlanDetailResponseDto extends TravelPlanSummaryResponseDto {}

export class TravelPlanDataResponseDto {
  @ApiProperty({ type: TravelPlanDetailResponseDto })
  data!: TravelPlanDetailResponseDto;
}

export class TravelPlanPaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
  @ApiProperty() hasNextPage!: boolean;
  @ApiProperty() hasPreviousPage!: boolean;
}

export class PaginatedTravelPlanResponseDto {
  @ApiProperty({ type: [TravelPlanSummaryResponseDto] })
  data!: TravelPlanSummaryResponseDto[];

  @ApiProperty({ type: TravelPlanPaginationMetaDto })
  meta!: TravelPlanPaginationMetaDto;
}
