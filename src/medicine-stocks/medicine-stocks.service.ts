import { Injectable } from '@nestjs/common';
import { InjectModel } from '@mongoloquent/nestjs';
import { DB } from 'mongoloquent';
import { ObjectId } from 'mongodb';
import { addDays, startOfDay } from 'date-fns';
import { AppException } from '../common/exceptions/app.exception';
import { MedicineStock, IMedicineStock } from './models/medicine-stock.model';
import {
  MedicineStockLog,
  IMedicineStockLog,
} from './models/medicine-stock-log.model';
import { CreateMedicineStockDto } from './dto/create-medicine-stock.dto';
import { UpdateMedicineStockDto } from './dto/update-medicine-stock.dto';
import { RestockMedicineDto } from './dto/restock-medicine.dto';
import { AdjustMedicineDto } from './dto/adjust-medicine.dto';
import { ListMedicineStocksQueryDto } from './dto/list-medicine-stocks-query.dto';
import { ListStockLogsQueryDto } from './dto/list-stock-logs-query.dto';

@Injectable()
export class MedicineStocksService {
  constructor(
    @InjectModel(MedicineStock)
    private readonly stockModel: typeof MedicineStock,
    @InjectModel(MedicineStockLog)
    private readonly stockLogModel: typeof MedicineStockLog,
  ) {}

  async create(userId: string, dto: CreateMedicineStockDto): Promise<void> {
    const threshold = dto.thresholdQuantity ?? 7;
    const nextEmptyDate = this.recalculateEmptyDate(dto.quantity, dto.dailyDose);
    let savedStockId!: string;

    await DB.transaction(async () => {
      const saved = await this.stockModel.create({
        patient_id: userId,
        medicine_name: dto.medicineName,
        medicine_type: dto.medicineType ?? null,
        quantity: dto.quantity,
        unit: dto.unit ?? 'tablet',
        daily_dose: dto.dailyDose,
        threshold_quantity: threshold,
        source_facility_id: dto.sourceFacilityId ?? null,
        next_estimated_empty_date: nextEmptyDate,
        is_active: true,
        last_restock_at: null,
      });
      savedStockId = saved._id!.toString();
      await this.stockLogModel.create({
        medicine_stock_id: savedStockId,
        patient_id: userId,
        change_quantity: dto.quantity,
        previous_quantity: 0,
        current_quantity: dto.quantity,
        reason: 'RESTOCK',
        note: 'Stok awal',
      });
    });

    // Alert fires AFTER transaction commits
    if (dto.quantity <= threshold) {
      await this.fireStockAlert(userId, savedStockId);
    }
  }

  async findAll(
    userId: string,
    query: ListMedicineStocksQueryDto,
  ): Promise<{ stocks: IMedicineStock[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const isActive = query.isActive ?? true;
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const sortFieldMap: Record<string, string> = {
      createdAt: 'created_at',
      medicineName: 'medicine_name',
      quantity: 'quantity',
    };
    const sortField =
      sortFieldMap[query.sortBy ?? 'createdAt'] ?? 'created_at';

    const total = await this.stockModel
      .where('patient_id', userId)
      .where('is_active', isActive)
      .count();

    const stocks = await this.stockModel
      .where('patient_id', userId)
      .where('is_active', isActive)
      .orderBy(sortField, sortOrder)
      .offset((page - 1) * limit)
      .limit(limit)
      .get();

    return { stocks: stocks as IMedicineStock[], total };
  }

  async findOne(userId: string, stockId: string): Promise<IMedicineStock> {
    if (!ObjectId.isValid(stockId)) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Stok obat tidak ditemukan.',
      );
    }

    const stock = await this.stockModel
      .where('_id', new ObjectId(stockId))
      .where('patient_id', userId)
      .first();

    if (!stock) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Stok obat tidak ditemukan.',
      );
    }

    return stock as IMedicineStock;
  }

  async update(
    userId: string,
    stockId: string,
    dto: UpdateMedicineStockDto,
  ): Promise<void> {
    const stock = await this.findOne(userId, stockId);

    if (!stock.is_active) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Stok tidak aktif.',
      );
    }

    const changes: Partial<IMedicineStock> = {};

    if (dto.medicineName !== undefined) changes.medicine_name = dto.medicineName;
    if (dto.medicineType !== undefined) changes.medicine_type = dto.medicineType;
    if (dto.unit !== undefined) changes.unit = dto.unit;
    if (dto.thresholdQuantity !== undefined)
      changes.threshold_quantity = dto.thresholdQuantity;
    if (dto.sourceFacilityId !== undefined)
      changes.source_facility_id = dto.sourceFacilityId;

    if (dto.dailyDose !== undefined) {
      changes.daily_dose = dto.dailyDose;
      changes.next_estimated_empty_date = this.recalculateEmptyDate(
        stock.quantity,
        dto.dailyDose,
      );
    }

    if (Object.keys(changes).length === 0) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Minimal satu field harus dikirim.',
      );
    }

    await this.stockModel.where('_id', new ObjectId(stockId)).update(changes);
  }

  async restock(
    userId: string,
    stockId: string,
    dto: RestockMedicineDto,
  ): Promise<void> {
    const stock = await this.findOne(userId, stockId);

    if (!stock.is_active) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Stok tidak aktif.',
      );
    }

    const newQuantity = stock.quantity + dto.quantity;
    const nextEmptyDate = this.recalculateEmptyDate(
      newQuantity,
      stock.daily_dose,
    );

    await DB.transaction(async () => {
      await this.stockModel.where('_id', new ObjectId(stockId)).update({
        quantity: newQuantity,
        last_restock_at: new Date(),
        next_estimated_empty_date: nextEmptyDate,
      });
      await this.stockLogModel.create({
        medicine_stock_id: stockId,
        patient_id: userId,
        change_quantity: dto.quantity,
        previous_quantity: stock.quantity,
        current_quantity: newQuantity,
        reason: 'RESTOCK',
        note: null,
      });
    });

    // Alert fires AFTER transaction commits — handles edge case where restock quantity is still below threshold
    if (newQuantity <= stock.threshold_quantity) {
      await this.fireStockAlert(userId, stockId);
    }
  }

  async adjust(
    userId: string,
    stockId: string,
    dto: AdjustMedicineDto,
  ): Promise<void> {
    const stock = await this.findOne(userId, stockId);

    if (!stock.is_active) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Stok tidak aktif.',
      );
    }

    const newQuantity = stock.quantity + dto.changeQuantity;

    if (newQuantity < 0) {
      throw new AppException(
        409,
        'STOCK_WOULD_BE_NEGATIVE',
        `Penyesuaian menyebabkan stok negatif. Stok saat ini: ${stock.quantity}.`,
      );
    }

    const nextEmptyDate = this.recalculateEmptyDate(
      newQuantity,
      stock.daily_dose,
    );

    await DB.transaction(async () => {
      await this.stockModel.where('_id', new ObjectId(stockId)).update({
        quantity: newQuantity,
        next_estimated_empty_date: nextEmptyDate,
      });
      await this.stockLogModel.create({
        medicine_stock_id: stockId,
        patient_id: userId,
        change_quantity: dto.changeQuantity,
        previous_quantity: stock.quantity,
        current_quantity: newQuantity,
        reason: 'ADJUSTMENT',
        note: dto.note,
      });
    });

    // Alert fires AFTER transaction commits
    if (newQuantity <= stock.threshold_quantity) {
      await this.fireStockAlert(userId, stockId);
    }
  }

  async deactivate(userId: string, stockId: string): Promise<void> {
    const stock = await this.findOne(userId, stockId);

    if (!stock.is_active) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Stok sudah dinonaktifkan.',
      );
    }

    await this.stockModel
      .where('_id', new ObjectId(stockId))
      .update({ is_active: false });
  }

  async findLogs(
    userId: string,
    stockId: string,
    query: ListStockLogsQueryDto,
  ): Promise<{ logs: IMedicineStockLog[]; total: number }> {
    // Verifies ownership — throws 404 if not found or not owned
    await this.findOne(userId, stockId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let countQuery = this.stockLogModel
      .where('medicine_stock_id', stockId)
      .where('patient_id', userId);
    let dataQuery = this.stockLogModel
      .where('medicine_stock_id', stockId)
      .where('patient_id', userId);

    if (query.reason !== undefined) {
      countQuery = countQuery.where('reason', query.reason);
      dataQuery = dataQuery.where('reason', query.reason);
    }

    const total = await countQuery.count();
    const logs = await dataQuery
      .orderBy('created_at', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)
      .get();

    return { logs: logs as IMedicineStockLog[], total };
  }

  /**
   * Called by F03 check-in service after saving the checkin record.
   * Idempotent: skips if a CHECK_IN log with this checkinId already exists.
   * Returns stock IDs that dropped to/below threshold — caller fires alerts after its own transaction commits.
   */
  async consumeDailyDose(
    patientId: string,
    checkinId: string,
  ): Promise<string[]> {
    const existing = await this.stockLogModel
      .where('patient_id', patientId)
      .where('reason', 'CHECK_IN')
      .where('note', `checkin:${checkinId}`)
      .first();

    if (existing) return [];

    const stocks = await this.stockModel
      .where('patient_id', patientId)
      .where('is_active', true)
      .get();

    const stocksToAlert: string[] = [];

    for (const stock of stocks as IMedicineStock[]) {
      if (stock.daily_dose <= 0) continue;

      const newQty = stock.quantity - stock.daily_dose;
      // Skip stocks with insufficient quantity — don't error, just skip
      if (newQty < 0) continue;

      const nextEmptyDate = this.recalculateEmptyDate(newQty, stock.daily_dose);
      const stockId = stock._id!.toString();

      await this.stockModel
        .where('_id', stock._id)
        .update({ quantity: newQty, next_estimated_empty_date: nextEmptyDate });

      await this.stockLogModel.create({
        medicine_stock_id: stockId,
        patient_id: patientId,
        change_quantity: -stock.daily_dose,
        previous_quantity: stock.quantity,
        current_quantity: newQty,
        reason: 'CHECK_IN',
        note: `checkin:${checkinId}`,
      });

      if (newQty <= stock.threshold_quantity) {
        stocksToAlert.push(stockId);
      }
    }

    return stocksToAlert;
  }

  private recalculateEmptyDate(
    quantity: number,
    dailyDose: number,
  ): Date | null {
    if (dailyDose <= 0) return null;
    return addDays(startOfDay(new Date()), Math.floor(quantity / dailyDose));
  }

  async fireStockAlert(patientId: string, stockId: string): Promise<void> {
    // TODO: inject NotificationsIndexService when F06 is ready
    console.log(
      `[F05] Stock alert needed: patientId=${patientId}, stockId=${stockId}`,
    );
  }
}
