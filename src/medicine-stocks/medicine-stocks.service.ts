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
import { AppException } from '../common/exceptions/app.exception';
import { runTransaction } from '../database/run-transaction';
import { NotificationsService } from '../notifications/notifications.service';
import { PatientsIndexService } from '../patients/patients-index.service';
import { AdjustMedicineDto } from './dto/adjust-medicine.dto';
import { CreateMedicineStockDto } from './dto/create-medicine-stock.dto';
import { ListMedicineStocksQueryDto } from './dto/list-medicine-stocks-query.dto';
import { ListStockLogsQueryDto } from './dto/list-stock-logs-query.dto';
import { RestockMedicineDto } from './dto/restock-medicine.dto';
import { UpdateMedicineStockDto } from './dto/update-medicine-stock.dto';
import { UpdateMedicineStockStatusDto } from './dto/update-medicine-stock-status.dto';
import {
  MedicineStockSummaryDto,
  TravelStockRequirementDto,
  TravelStockRequirementSummaryDto,
} from './dto/medicine-stock-response.dto';
import {
  IMedicineStockLog,
  MedicineStockLog,
  StockLogReason,
} from './models/medicine-stock-log.model';
import { IMedicineStock, MedicineStock } from './models/medicine-stock.model';
import { MedicineStockSerializer } from './serializers/medicine-stock.serializer';

@Injectable()
export class MedicineStocksService {
  private readonly logger = new Logger(MedicineStocksService.name);

  constructor(
    @InjectModel(MedicineStock)
    private readonly stockModel: typeof MedicineStock,
    @InjectModel(MedicineStockLog)
    private readonly stockLogModel: typeof MedicineStockLog,
    private readonly patientsIndex: PatientsIndexService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateMedicineStockDto): Promise<void> {
    const patientProfileId = await this.activeProfileId(userId);
    const threshold = dto.thresholdQuantity ?? 7;
    const nextEmptyDate = this.recalculateEmptyDate(
      dto.quantity,
      dto.dailyDose,
    );
    const stockId = new ObjectId();
    const now = new Date();

    await this.transaction(async (session) => {
      await this.stocks().insertOne(
        {
          _id: stockId,
          patient_id: userId,
          patient_profile_id: patientProfileId,
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
          patient_profile_id: patientProfileId,
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
    const patientProfileId = await this.activeProfileId(userId);
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
      .where('patient_profile_id', patientProfileId)
      .where('is_active', isActive)
      .count();
    const stocks = await this.stockModel
      .where('patient_id', userId)
      .where('patient_profile_id', patientProfileId)
      .where('is_active', isActive)
      .orderBy(sortField, sortOrder)
      .offset((page - 1) * limit)
      .limit(limit)
      .get();

    return { stocks, total };
  }

  async getActiveStockSummaryForProfile(
    patientId: string,
    patientProfileId: string,
  ): Promise<MedicineStockSummaryDto[]> {
    const stocks = await this.stockModel
      .where('patient_id', patientId)
      .where('patient_profile_id', patientProfileId)
      .where('is_active', true)
      .get();
    return stocks.map((stock) => MedicineStockSerializer.toSummary(stock));
  }

  async calculateTravelRequirementForProfile(
    patientId: string,
    patientProfileId: string,
    durationDays: number,
  ): Promise<TravelStockRequirementSummaryDto> {
    if (!Number.isInteger(durationDays) || durationDays <= 0) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Durasi perjalanan harus berupa bilangan bulat positif.',
      );
    }

    const summaries = await this.getActiveStockSummaryForProfile(
      patientId,
      patientProfileId,
    );
    const stocks: TravelStockRequirementDto[] = summaries.map((summary) => {
      const needed = summary.dailyDose * durationDays;
      const shortage = Math.max(0, needed - summary.quantity);
      return {
        stockId: summary.id,
        medicineName: summary.medicineName,
        dailyDose: summary.dailyDose,
        durationDays,
        neededQuantity: needed,
        availableQuantity: summary.quantity,
        isEnough: summary.quantity >= needed,
        shortageQuantity: shortage,
      };
    });

    return {
      isAllStockEnough: stocks.every((stock) => stock.isEnough),
      totalNeeded: stocks.reduce((acc, stock) => acc + stock.neededQuantity, 0),
      totalAvailable: stocks.reduce(
        (acc, stock) => acc + stock.availableQuantity,
        0,
      ),
      stocks,
    };
  }

  async findOne(userId: string, stockId: string): Promise<IMedicineStock> {
    const patientProfileId = await this.activeProfileId(userId);
    const objectId = this.parseStockId(stockId);
    const stock = await this.stockModel
      .where('_id', objectId)
      .where('patient_id', userId)
      .where('patient_profile_id', patientProfileId)
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
      .where('patient_profile_id', stock.patient_profile_id)
      .update(changes);

    const newThreshold = dto.thresholdQuantity ?? stock.threshold_quantity;
    if (
      stock.quantity > stock.threshold_quantity &&
      stock.quantity <= newThreshold
    ) {
      await this.fireStockAlert(userId, stockId);
    }
  }

  async updateStatus(
    userId: string,
    stockId: string,
    dto: UpdateMedicineStockStatusDto,
  ): Promise<void> {
    const stock = await this.findOne(userId, stockId);

    await this.stockModel
      .where('_id', this.parseStockId(stockId))
      .where('patient_id', userId)
      .where('patient_profile_id', stock.patient_profile_id)
      .update({
        is_active: dto.isActive,
        updated_at: new Date(),
      });
  }

  async restock(
    userId: string,
    stockId: string,
    dto: RestockMedicineDto,
    idempotencyKey: string,
  ): Promise<void> {
    this.validateIdempotencyKey(idempotencyKey);
    const patientProfileId = await this.activeProfileId(userId);
    const objectId = this.parseStockId(stockId);

    try {
      await this.transaction(async (session) => {
        const existing = await this.findOperation(
          userId,
          patientProfileId,
          stockId,
          'RESTOCK',
          idempotencyKey,
          session,
        );
        if (existing) {
          this.assertSameOperation(existing, dto.quantity, dto.note ?? null);
          return;
        }

        const stock = await this.findOwnedStock(
          userId,
          patientProfileId,
          objectId,
          session,
        );
        if (!stock.is_active) {
          throw this.inactiveStock();
        }

        const newQuantity = stock.quantity + dto.quantity;
        const now = new Date();
        await this.stocks().updateOne(
          {
            _id: objectId,
            patient_id: userId,
            patient_profile_id: patientProfileId,
          },
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
            patient_profile_id: patientProfileId,
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
          patientProfileId,
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
    const patientProfileId = await this.activeProfileId(userId);
    const objectId = this.parseStockId(stockId);
    let thresholdCrossed = false;

    try {
      await this.transaction(async (session) => {
        const existing = await this.findOperation(
          userId,
          patientProfileId,
          stockId,
          'ADJUSTMENT',
          idempotencyKey,
          session,
        );
        if (existing) {
          this.assertSameOperation(existing, dto.changeQuantity, dto.note);
          return;
        }

        const stock = await this.findOwnedStock(
          userId,
          patientProfileId,
          objectId,
          session,
        );
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
          {
            _id: objectId,
            patient_id: userId,
            patient_profile_id: patientProfileId,
          },
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
            patient_profile_id: patientProfileId,
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
          patientProfileId,
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
      .where('patient_profile_id', stock.patient_profile_id)
      .update({ is_active: false });
  }

  async findLogs(
    userId: string,
    stockId: string,
    query: ListStockLogsQueryDto,
  ): Promise<{ logs: IMedicineStockLog[]; total: number }> {
    const stock = await this.findOne(userId, stockId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    let countQuery = this.stockLogModel
      .where('medicine_stock_id', stockId)
      .where('patient_id', userId)
      .where('patient_profile_id', stock.patient_profile_id);
    let dataQuery = this.stockLogModel
      .where('medicine_stock_id', stockId)
      .where('patient_id', userId)
      .where('patient_profile_id', stock.patient_profile_id);

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
    patientProfileId: string,
    checkinId: string,
    session?: ClientSession,
  ): Promise<string[]> {
    if (session) {
      return this.consumeDailyDoseInSession(
        patientId,
        patientProfileId,
        checkinId,
        session,
      );
    }

    try {
      return await this.transaction((transactionSession) =>
        this.consumeDailyDoseInSession(
          patientId,
          patientProfileId,
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

  async fireStockAlert(patientId: string, stockId: string): Promise<void> {
    this.logger.log({
      command: 'STOCK_ALERT',
      patientId,
      stockId,
    });
    await this.notificationsService.sendStockAlert(patientId, stockId);
  }

  private async consumeDailyDoseInSession(
    patientId: string,
    patientProfileId: string,
    checkinId: string,
    session: ClientSession,
  ): Promise<string[]> {
    const existing = await this.logs().findOne(
      {
        patient_id: patientId,
        patient_profile_id: patientProfileId,
        reason: 'CHECK_IN',
        operation_key: checkinId,
      },
      { session },
    );
    if (existing) {
      return [];
    }

    const stocks = await this.stocks()
      .find(
        {
          patient_id: patientId,
          patient_profile_id: patientProfileId,
          is_active: true,
        },
        { session },
      )
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
        {
          _id: stock._id,
          patient_id: patientId,
          patient_profile_id: patientProfileId,
        },
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
          patient_profile_id: patientProfileId,
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
    patientProfileId: string,
    stockId: ObjectId,
    session: ClientSession,
  ): Promise<WithId<IMedicineStock>> {
    const stock = await this.stocks().findOne(
      {
        _id: stockId,
        patient_id: userId,
        patient_profile_id: patientProfileId,
      },
      { session },
    );
    if (!stock) {
      throw this.stockNotFound();
    }
    return stock;
  }

  private async findOperation(
    patientId: string,
    patientProfileId: string,
    stockId: string,
    reason: StockLogReason,
    operationKey: string,
    session?: ClientSession,
  ): Promise<WithId<IMedicineStockLog> | null> {
    return this.logs().findOne(
      {
        patient_id: patientId,
        patient_profile_id: patientProfileId,
        medicine_stock_id: stockId,
        reason,
        operation_key: operationKey,
      },
      { session },
    );
  }

  private async resolveConcurrentDuplicate(
    patientId: string,
    patientProfileId: string,
    stockId: string,
    reason: StockLogReason,
    operationKey: string,
    changeQuantity: number,
    note: string | null,
  ): Promise<void> {
    const existing = await this.findOperation(
      patientId,
      patientProfileId,
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

  private async activeProfileId(userId: string): Promise<string> {
    const profile = await this.patientsIndex.getPatientProfile(userId);
    return profile._id.toHexString();
  }

  private stocks(): Collection<IMedicineStock> {
    return this.stockModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IMedicineStock>;
  }

  private logs(): Collection<IMedicineStockLog> {
    return this.stockLogModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IMedicineStockLog>;
  }

  private transaction<T>(
    callback: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    return runTransaction(this.configService, callback);
  }
}
