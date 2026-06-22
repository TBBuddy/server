import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientSession } from 'mongodb';
import { Database } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import { MedicineStocksService } from './medicine-stocks.service';
import { MedicineStockSerializer } from './serializers/medicine-stock.serializer';
import {
  MedicineStockSummaryDto,
  TravelStockRequirementDto,
  TravelStockRequirementSummaryDto,
} from './dto/medicine-stock-response.dto';

@Injectable()
export class MedicineStocksIndexService implements OnApplicationBootstrap {
  constructor(
    private readonly service: MedicineStocksService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const database = Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    );
    await database.collection('medicine_stocks').createIndexes([
      {
        key: { patient_id: 1, is_active: 1, created_at: -1 },
        name: 'medicine_stocks_patient_active_created',
      },
    ]);
    await database.collection('medicine_stock_logs').createIndexes([
      {
        key: { medicine_stock_id: 1, patient_id: 1, created_at: -1 },
        name: 'medicine_stock_logs_stock_patient_created',
      },
      {
        key: {
          patient_id: 1,
          medicine_stock_id: 1,
          reason: 1,
          operation_key: 1,
        },
        name: 'medicine_stock_logs_idempotency',
        unique: true,
        partialFilterExpression: { operation_key: { $type: 'string' } },
      },
    ]);
  }

  /**
   * Called by F03 check-in service to deduct daily doses.
   * Returns stock IDs that dropped to/below threshold for the caller to fire alerts.
   */
  async consumeDailyDose(
    patientId: string,
    checkinId: string,
    session?: ClientSession,
  ): Promise<string[]> {
    return this.service.consumeDailyDose(patientId, checkinId, session);
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
    return stocks.map((stock) => MedicineStockSerializer.toSummary(stock));
  }

  /**
   * Calculates how many tablets are needed for a trip and whether stock is sufficient.
   * Used by F08 travel preparation feature.
   */
  async calculateTravelRequirement(
    patientId: string,
    durationDays: number,
  ): Promise<TravelStockRequirementSummaryDto> {
    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Durasi perjalanan harus berupa bilangan bulat positif.',
      );
    }
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
