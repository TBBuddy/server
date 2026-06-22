import { IMedicineStock } from '../models/medicine-stock.model';
import { IMedicineStockLog } from '../models/medicine-stock-log.model';
import {
  MedicineStockResponseDto,
  MedicineStockLogResponseDto,
  MedicineStockSummaryDto,
} from '../dto/medicine-stock-response.dto';

export class MedicineStockSerializer {
  static toResponse(stock: IMedicineStock): MedicineStockResponseDto {
    const daysRemaining =
      stock.daily_dose > 0 ? Math.floor(stock.quantity / stock.daily_dose) : 0;

    return {
      id: stock._id.toString(),
      patientId: stock.patient_id,
      medicineName: stock.medicine_name,
      medicineType: stock.medicine_type ?? null,
      quantity: stock.quantity,
      unit: stock.unit,
      dailyDose: stock.daily_dose,
      thresholdQuantity: stock.threshold_quantity,
      daysRemaining,
      isBelowThreshold: stock.quantity <= stock.threshold_quantity,
      sourceFacilityId: stock.source_facility_id ?? null,
      lastRestockAt: stock.last_restock_at
        ? stock.last_restock_at.toISOString()
        : null,
      nextEstimatedEmptyDate: stock.next_estimated_empty_date
        ? stock.next_estimated_empty_date.toISOString().split('T')[0]
        : null,
      isActive: stock.is_active,
      createdAt: stock.created_at!.toISOString(),
      updatedAt: stock.updated_at!.toISOString(),
    };
  }

  static toSummary(stock: IMedicineStock): MedicineStockSummaryDto {
    const daysRemaining =
      stock.daily_dose > 0 ? Math.floor(stock.quantity / stock.daily_dose) : 0;
    return {
      id: stock._id.toString(),
      medicineName: stock.medicine_name,
      quantity: stock.quantity,
      dailyDose: stock.daily_dose,
      thresholdQuantity: stock.threshold_quantity,
      isBelowThreshold: stock.quantity <= stock.threshold_quantity,
      daysRemaining,
      nextEstimatedEmptyDate: stock.next_estimated_empty_date
        ? stock.next_estimated_empty_date.toISOString().split('T')[0]
        : null,
    };
  }

  static toLogResponse(log: IMedicineStockLog): MedicineStockLogResponseDto {
    // note untuk CHECK_IN berisi "checkin:${checkinId}" — jangan expose ke client
    const safeNote = log.reason === 'CHECK_IN' ? null : (log.note ?? null);

    return {
      id: log._id.toString(),
      medicineStockId: log.medicine_stock_id,
      patientId: log.patient_id,
      changeQuantity: log.change_quantity,
      previousQuantity: log.previous_quantity,
      currentQuantity: log.current_quantity,
      reason: log.reason,
      note: safeNote,
      createdAt: log.created_at!.toISOString(),
    };
  }
}
