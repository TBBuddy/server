import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MedicineStockResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() patientId!: string;
  @ApiProperty() medicineName!: string;
  @ApiPropertyOptional() medicineType!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() unit!: string;
  @ApiProperty() dailyDose!: number;
  @ApiProperty() thresholdQuantity!: number;
  @ApiProperty() daysRemaining!: number;
  @ApiProperty() isBelowThreshold!: boolean;
  @ApiPropertyOptional() sourceFacilityId!: string | null;
  @ApiPropertyOptional() lastRestockAt!: string | null;
  @ApiPropertyOptional() nextEstimatedEmptyDate!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty() createdAt!: string;
  @ApiProperty() updatedAt!: string;
}

export class MedicineStockDetailResponseDto extends MedicineStockResponseDto {
  // Sama dengan list item untuk MVP. Bisa ditambah field nanti.
}

// Untuk wrap response {data}
export class MedicineStockDataResponseDto {
  @ApiProperty({ type: MedicineStockDetailResponseDto })
  data!: MedicineStockDetailResponseDto;
}

// Untuk index service (ringkas, tanpa wrap)
export class MedicineStockSummaryDto {
  id!: string;
  medicineName!: string;
  quantity!: number;
  dailyDose!: number;
  thresholdQuantity!: number;
  isBelowThreshold!: boolean;
  daysRemaining!: number;
  nextEstimatedEmptyDate!: string | null;
}

export class MedicineStockLogResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() medicineStockId!: string;
  @ApiProperty() patientId!: string;
  @ApiProperty() changeQuantity!: number;
  @ApiProperty() previousQuantity!: number;
  @ApiProperty() currentQuantity!: number;
  @ApiProperty() reason!: string;
  @ApiPropertyOptional() note!: string | null;
  @ApiProperty() createdAt!: string;
}

export class MedicineStockLogDataResponseDto {
  @ApiProperty({ type: MedicineStockLogResponseDto })
  data!: MedicineStockLogResponseDto[];
}

// Untuk index service F08
export class TravelStockRequirementDto {
  stockId!: string;
  medicineName!: string;
  dailyDose!: number;
  durationDays!: number;
  neededQuantity!: number;
  availableQuantity!: number;
  isEnough!: boolean;
  shortageQuantity!: number;  // 0 jika cukup
}

export class TravelStockRequirementSummaryDto {
  isAllStockEnough!: boolean;
  totalNeeded!: number;
  totalAvailable!: number;
  stocks!: TravelStockRequirementDto[];
}