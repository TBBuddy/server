import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@mongoloquent/nestjs';
import { addDays, startOfDay } from 'date-fns';
import {
  ClientSession,
  Collection,
  MongoServerError,
  ObjectId,
  WithId,
} from 'mongodb';
import { DB, Database } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import { AdjustMedicineDto } from './dto/adjust-medicine.dto';
import { CreateMedicineStockDto } from './dto/create-medicine-stock.dto';
import { ListMedicineStocksQueryDto } from './dto/list-medicine-stocks-query.dto';
import { ListStockLogsQueryDto } from './dto/list-stock-logs-query.dto';
import { RestockMedicineDto } from './dto/restock-medicine.dto';
import { UpdateMedicineStockDto } from './dto/update-medicine-stock.dto';
import {
  IMedicineStockLog,
  MedicineStockLog,
  StockLogReason,
} from './models/medicine-stock-log.model';
import { IMedicineStock, MedicineStock } from './models/medicine-stock.model';

@Injectable()
export class MedicineStocksService {
  private readonly logger = new Logger(MedicineStocksService.name);

  constructor(
    @InjectModel(MedicineStock)
    private readonly stockModel: typeof MedicineStock,
    @InjectModel(MedicineStockLog)
    private readonly stockLogModel: typeof MedicineStockLog,
    private readonly configService: ConfigService,
  ) {}

  async create(userId: string, dto: CreateMedicineStockDto): Promise<void> {
    const threshold = dto.thresholdQuantity ?? 7;
    const nextEmptyDate = this.recalculateEmptyDate(
      dto.quantity,
      dto.dailyDose,
    );
    const stockId = new ObjectId();
    const now = new Date();

    await DB.transaction(async (session) => {
      await this.stocks().insertOne(
        {
          _id: stockId,
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
          created_at: now,
          updated_at: now,
        },
        { session },
      );
      await this.logs().insertOne(
        {
          _id: new ObjectId(),
          medicine_stock_id: stockId.toHexString(),
          patient_id: userId,
          change_quantity: dto.quantity,
          previous_quantity: 0,
          current_quantity: dto.quantity,
          reason: 'RESTOCK',
          note: 'Stok awal',
          operation_key: null,
          created_at: now,
        },
        { session },
      );
    });

    if (dto.quantity <= threshold) {
      await this.fireStockAlert(userId, stockId.toHexString());
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
    const sortField = sortFieldMap[query.sortBy ?? 'createdAt'] ?? 'created_at';

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

    return { stocks, total };
  }

  async findOne(userId: string, stockId: string): Promise<IMedicineStock> {
    const objectId = this.parseStockId(stockId);
    const stock = await this.stockModel
      .where('_id', objectId)
      .where('patient_id', userId)
      .first();

    if (!stock) {
      throw this.stockNotFound();
    }

    return stock;
  }

  async update(
    userId: string,
    stockId: string,
    dto: UpdateMedicineStockDto,
  ): Promise<void> {
    const stock = await this.findOne(userId, stockId);
    if (!stock.is_active) {
      throw this.inactiveStock();
    }

    const changes: Partial<IMedicineStock> = {};
    if (dto.medicineName !== undefined)
      changes.medicine_name = dto.medicineName;
    if (dto.medicineType !== undefined)
      changes.medicine_type = dto.medicineType;
    if (dto.unit !== undefined) changes.unit = dto.unit;
    if (dto.thresholdQuantity !== undefined) {
      changes.threshold_quantity = dto.thresholdQuantity;
    }
    if (dto.sourceFacilityId !== undefined) {
      changes.source_facility_id = dto.sourceFacilityId;
    }
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

    await this.stockModel
      .where('_id', this.parseStockId(stockId))
      .where('patient_id', userId)
      .update(changes);

    const newThreshold = dto.thresholdQuantity ?? stock.threshold_quantity;
    if (
      stock.quantity > stock.threshold_quantity &&
      stock.quantity <= newThreshold
    ) {
      await this.fireStockAlert(userId, stockId);
    }
  }

  async restock(
    userId: string,
    stockId: string,
    dto: RestockMedicineDto,
    idempotencyKey: string,
  ): Promise<void> {
    this.validateIdempotencyKey(idempotencyKey);
    const objectId = this.parseStockId(stockId);

    try {
      await DB.transaction(async (session) => {
        const existing = await this.findOperation(
          userId,
          stockId,
          'RESTOCK',
          idempotencyKey,
          session,
        );
        if (existing) {
          this.assertSameOperation(existing, dto.quantity, dto.note ?? null);
          return;
        }

        const stock = await this.findOwnedStock(userId, objectId, session);
        if (!stock.is_active) {
          throw this.inactiveStock();
        }

        const newQuantity = stock.quantity + dto.quantity;
        const now = new Date();
        await this.stocks().updateOne(
          { _id: objectId, patient_id: userId },
          {
            $set: {
              quantity: newQuantity,
              last_restock_at: now,
              next_estimated_empty_date: this.recalculateEmptyDate(
                newQuantity,
                stock.daily_dose,
              ),
              updated_at: now,
            },
          },
          { session },
        );
        await this.createLog(
          {
            medicine_stock_id: stockId,
            patient_id: userId,
            change_quantity: dto.quantity,
            previous_quantity: stock.quantity,
            current_quantity: newQuantity,
            reason: 'RESTOCK',
            note: dto.note ?? null,
            operation_key: idempotencyKey,
          },
          session,
        );
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        await this.resolveConcurrentDuplicate(
          userId,
          stockId,
          'RESTOCK',
          idempotencyKey,
          dto.quantity,
          dto.note ?? null,
        );
        return;
      }
      throw error;
    }
  }

  async adjust(
    userId: string,
    stockId: string,
    dto: AdjustMedicineDto,
    idempotencyKey: string,
  ): Promise<void> {
    this.validateIdempotencyKey(idempotencyKey);
    const objectId = this.parseStockId(stockId);
    let thresholdCrossed = false;

    try {
      await DB.transaction(async (session) => {
        const existing = await this.findOperation(
          userId,
          stockId,
          'ADJUSTMENT',
          idempotencyKey,
          session,
        );
        if (existing) {
          this.assertSameOperation(existing, dto.changeQuantity, dto.note);
          return;
        }

        const stock = await this.findOwnedStock(userId, objectId, session);
        if (!stock.is_active) {
          throw this.inactiveStock();
        }

        const newQuantity = stock.quantity + dto.changeQuantity;
        if (newQuantity < 0) {
          throw new AppException(
            409,
            'STOCK_WOULD_BE_NEGATIVE',
            'Penyesuaian menyebabkan stok negatif.',
          );
        }

        const now = new Date();
        await this.stocks().updateOne(
          { _id: objectId, patient_id: userId },
          {
            $set: {
              quantity: newQuantity,
              next_estimated_empty_date: this.recalculateEmptyDate(
                newQuantity,
                stock.daily_dose,
              ),
              updated_at: now,
            },
          },
          { session },
        );
        await this.createLog(
          {
            medicine_stock_id: stockId,
            patient_id: userId,
            change_quantity: dto.changeQuantity,
            previous_quantity: stock.quantity,
            current_quantity: newQuantity,
            reason: 'ADJUSTMENT',
            note: dto.note,
            operation_key: idempotencyKey,
          },
          session,
        );
        thresholdCrossed =
          stock.quantity > stock.threshold_quantity &&
          newQuantity <= stock.threshold_quantity;
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        await this.resolveConcurrentDuplicate(
          userId,
          stockId,
          'ADJUSTMENT',
          idempotencyKey,
          dto.changeQuantity,
          dto.note,
        );
        return;
      }
      throw error;
    }

    if (thresholdCrossed) {
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
      .where('_id', this.parseStockId(stockId))
      .where('patient_id', userId)
      .update({ is_active: false });
  }

  async findLogs(
    userId: string,
    stockId: string,
    query: ListStockLogsQueryDto,
  ): Promise<{ logs: IMedicineStockLog[]; total: number }> {
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

    return { logs, total };
  }

  async consumeDailyDose(
    patientId: string,
    checkinId: string,
    session?: ClientSession,
  ): Promise<string[]> {
    if (session) {
      return this.consumeDailyDoseInSession(patientId, checkinId, session);
    }

    try {
      return await DB.transaction((transactionSession) =>
        this.consumeDailyDoseInSession(
          patientId,
          checkinId,
          transactionSession,
        ),
      );
    } catch (error) {
      if (this.isDuplicateKey(error)) {
        return [];
      }
      throw error;
    }
  }

  fireStockAlert(patientId: string, stockId: string): Promise<void> {
    this.logger.log({
      command: 'STOCK_ALERT',
      patientId,
      stockId,
    });
    return Promise.resolve();
  }

  private async consumeDailyDoseInSession(
    patientId: string,
    checkinId: string,
    session: ClientSession,
  ): Promise<string[]> {
    const existing = await this.logs().findOne(
      {
        patient_id: patientId,
        reason: 'CHECK_IN',
        operation_key: checkinId,
      },
      { session },
    );
    if (existing) {
      return [];
    }

    const stocks = await this.stocks()
      .find({ patient_id: patientId, is_active: true }, { session })
      .toArray();
    const insufficient = stocks.find(
      (stock) => stock.daily_dose > 0 && stock.quantity < stock.daily_dose,
    );
    if (insufficient) {
      throw new AppException(
        409,
        'INSUFFICIENT_STOCK',
        `Stok ${insufficient.medicine_name} tidak mencukupi untuk dosis harian.`,
      );
    }

    const stocksToAlert: string[] = [];
    const now = new Date();
    for (const stock of stocks) {
      if (stock.daily_dose <= 0) continue;

      const stockId = stock._id.toHexString();
      const newQuantity = stock.quantity - stock.daily_dose;
      await this.stocks().updateOne(
        { _id: stock._id, patient_id: patientId },
        {
          $set: {
            quantity: newQuantity,
            next_estimated_empty_date: this.recalculateEmptyDate(
              newQuantity,
              stock.daily_dose,
            ),
            updated_at: now,
          },
        },
        { session },
      );
      await this.createLog(
        {
          medicine_stock_id: stockId,
          patient_id: patientId,
          change_quantity: -stock.daily_dose,
          previous_quantity: stock.quantity,
          current_quantity: newQuantity,
          reason: 'CHECK_IN',
          note: null,
          operation_key: checkinId,
        },
        session,
      );

      if (
        stock.quantity > stock.threshold_quantity &&
        newQuantity <= stock.threshold_quantity
      ) {
        stocksToAlert.push(stockId);
      }
    }

    return stocksToAlert;
  }

  private async findOwnedStock(
    userId: string,
    stockId: ObjectId,
    session: ClientSession,
  ): Promise<WithId<IMedicineStock>> {
    const stock = await this.stocks().findOne(
      { _id: stockId, patient_id: userId },
      { session },
    );
    if (!stock) {
      throw this.stockNotFound();
    }
    return stock;
  }

  private async findOperation(
    patientId: string,
    stockId: string,
    reason: StockLogReason,
    operationKey: string,
    session?: ClientSession,
  ): Promise<WithId<IMedicineStockLog> | null> {
    return this.logs().findOne(
      {
        patient_id: patientId,
        medicine_stock_id: stockId,
        reason,
        operation_key: operationKey,
      },
      { session },
    );
  }

  private async resolveConcurrentDuplicate(
    patientId: string,
    stockId: string,
    reason: StockLogReason,
    operationKey: string,
    changeQuantity: number,
    note: string | null,
  ): Promise<void> {
    const existing = await this.findOperation(
      patientId,
      stockId,
      reason,
      operationKey,
    );
    if (!existing) {
      throw new AppException(
        409,
        'IDEMPOTENCY_CONFLICT',
        'Operasi dengan idempotency key tersebut sedang diproses.',
      );
    }
    this.assertSameOperation(existing, changeQuantity, note);
  }

  private assertSameOperation(
    existing: WithId<IMedicineStockLog>,
    changeQuantity: number,
    note: string | null,
  ): void {
    if (existing.change_quantity !== changeQuantity || existing.note !== note) {
      throw new AppException(
        409,
        'IDEMPOTENCY_CONFLICT',
        'Idempotency key sudah digunakan untuk payload yang berbeda.',
      );
    }
  }

  private async createLog(
    log: Omit<IMedicineStockLog, '_id' | 'created_at'>,
    session: ClientSession,
  ): Promise<void> {
    await this.logs().insertOne(
      {
        _id: new ObjectId(),
        ...log,
        created_at: new Date(),
      },
      { session },
    );
  }

  private validateIdempotencyKey(
    value: string | undefined,
  ): asserts value is string {
    if (
      !value ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new AppException(
        400,
        'VALIDATION_ERROR',
        'Header Idempotency-Key wajib berupa UUID v4.',
      );
    }
  }

  private isDuplicateKey(error: unknown): boolean {
    return error instanceof MongoServerError && error.code === 11000;
  }

  private parseStockId(stockId: string): ObjectId {
    if (!ObjectId.isValid(stockId)) {
      throw new AppException(400, 'INVALID_ID', 'ID stok obat tidak valid.');
    }
    return new ObjectId(stockId);
  }

  private recalculateEmptyDate(
    quantity: number,
    dailyDose: number,
  ): Date | null {
    if (dailyDose <= 0) return null;
    return addDays(startOfDay(new Date()), Math.floor(quantity / dailyDose));
  }

  private stockNotFound(): AppException {
    return new AppException(
      404,
      'RESOURCE_NOT_FOUND',
      'Stok obat tidak ditemukan.',
    );
  }

  private inactiveStock(): AppException {
    return new AppException(
      400,
      'BUSINESS_RULE_VIOLATION',
      'Stok tidak aktif.',
    );
  }

  private stocks(): Collection<IMedicineStock> {
    return this.database().collection<IMedicineStock>('medicine_stocks');
  }

  private logs(): Collection<IMedicineStockLog> {
    return this.database().collection<IMedicineStockLog>('medicine_stock_logs');
  }

  private database() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    );
  }
}
