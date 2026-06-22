import { Injectable } from '@nestjs/common';
import { MedicineStocksService } from './medicine-stocks.service';
import { MedicineStockSerializer } from './serializers/medicine-stock.serializer';
import {
  MedicineStockSummaryDto,
  TravelStockRequirementDto,
  TravelStockRequirementSummaryDto,
} from './dto/medicine-stock-response.dto';

@Injectable()
export class MedicineStocksIndexService {
  constructor(private readonly service: MedicineStocksService) {}

  /**
   * Called by F03 check-in service to deduct daily doses.
   * Returns stock IDs that dropped to/below threshold for the caller to fire alerts.
   */
  async consumeDailyDose(
    patientId: string,
    checkinId: string,
  ): Promise<string[]> {
    return this.service.consumeDailyDose(patientId, checkinId);
  }

  /**
   * Called by F06 notification service after a transaction commits.
   */
  async fireStockAlert(patientId: string, stockId: string): Promise<void> {
    return this.service.fireStockAlert(patientId, stockId);
  }

  /**
   * Returns a lightweight summary of all active stocks for a patient.
   * Used by F03 (check-in) and F08 (travel prep).
   */
  async getActiveStockSummary(
    patientId: string,
  ): Promise<MedicineStockSummaryDto[]> {
    const { stocks } = await this.service.findAll(patientId, {
      page: 1,
      limit: 100,
      isActive: true,
    });
    return stocks.map(MedicineStockSerializer.toSummary);
  }

  /**
   * Calculates how many tablets are needed for a trip and whether stock is sufficient.
   * Used by F08 travel preparation feature.
   */
  async calculateTravelRequirement(
    patientId: string,
    durationDays: number,
  ): Promise<TravelStockRequirementSummaryDto> {
    const summaries = await this.getActiveStockSummary(patientId);

    const stocks: TravelStockRequirementDto[] = summaries.map((s) => {
      const needed = s.dailyDose * durationDays;
      const shortage = Math.max(0, needed - s.quantity);
      return {
        stockId: s.id,
        medicineName: s.medicineName,
        dailyDose: s.dailyDose,
        durationDays,
        neededQuantity: needed,
        availableQuantity: s.quantity,
        isEnough: s.quantity >= needed,
        shortageQuantity: shortage,
      };
    });

    return {
      isAllStockEnough: stocks.every((s) => s.isEnough),
      totalNeeded: stocks.reduce((acc, s) => acc + s.neededQuantity, 0),
      totalAvailable: stocks.reduce((acc, s) => acc + s.availableQuantity, 0),
      stocks,
    };
  }
}
