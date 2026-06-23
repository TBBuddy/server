import { ConfigService } from '@nestjs/config';
import { ClientSession, ObjectId } from 'mongodb';
import { DB } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import { MedicineStocksService } from './medicine-stocks.service';
import { MedicineStockLog } from './models/medicine-stock-log.model';
import { IMedicineStock, MedicineStock } from './models/medicine-stock.model';
import { PatientsIndexService } from '../patients/patients-index.service';

describe('MedicineStocksService', () => {
  const session = {} as ClientSession;
  const stockId = new ObjectId();
  const patientId = 'patient-1';
  const patientProfileId = new ObjectId().toHexString();
  const operationKey = '0c9b2ff0-871d-4ce4-8f5a-8ced6e9507a0';
  const baseStock: IMedicineStock = {
    _id: stockId,
    patient_id: patientId,
    patient_profile_id: patientProfileId,
    medicine_name: 'Rifampicin',
    medicine_type: 'OAT',
    quantity: 10,
    unit: 'tablet',
    daily_dose: 2,
    threshold_quantity: 5,
    source_facility_id: null,
    last_restock_at: null,
    next_estimated_empty_date: null,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const stocks = {
    findOne: jest.fn(),
    find: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
  };
  const logs = {
    findOne: jest.fn(),
    insertOne: jest.fn(),
  };
  const stockQuery = {
    where: jest.fn(),
    first: jest.fn(),
    update: jest.fn(),
  };
  stockQuery.where.mockReturnValue(stockQuery);
  const mockStockModel = {
    where: jest.fn(() => stockQuery),
    query: jest.fn(() => ({
      getMongoDBCollection: jest.fn(() => stocks),
    })),
  } as unknown as typeof MedicineStock;
  const mockStockLogModel = {
    query: jest.fn(() => ({
      getMongoDBCollection: jest.fn(() => logs),
    })),
  } as unknown as typeof MedicineStockLog;
  const patientsIndex = {
    getPatientProfile: jest.fn().mockResolvedValue({
      _id: new ObjectId(patientProfileId),
    }),
  } as unknown as PatientsIndexService;
  const service = new MedicineStocksService(
    mockStockModel,
    mockStockLogModel,
    patientsIndex,
    {
      getOrThrow: jest.fn((key: string) =>
        key === 'MONGODB_CONNECTION' ? 'mongodb://test' : 'test',
      ),
    } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(DB.prototype, 'transaction')
      .mockImplementation(async (callback) => callback(session));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates initial stock and audit log in one transaction', async () => {
    stocks.insertOne.mockResolvedValue({ insertedId: stockId });
    logs.insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    await service.create(patientId, {
      medicineName: 'Rifampicin',
      quantity: 30,
      dailyDose: 2,
    });

    expect(stocks.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: patientId,
        patient_profile_id: patientProfileId,
        quantity: 30,
        daily_dose: 2,
      }),
      { session },
    );
    expect(logs.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        change_quantity: 30,
        previous_quantity: 0,
        current_quantity: 30,
        reason: 'RESTOCK',
      }),
      { session },
    );
  });

  it('updates stock metadata without changing its quantity', async () => {
    stockQuery.first.mockResolvedValue(baseStock);
    stockQuery.update.mockResolvedValue({
      ...baseStock,
      daily_dose: 1,
    });

    await service.update(patientId, stockId.toHexString(), {
      dailyDose: 1,
      medicineName: 'Rifampicin 600mg',
    });

    expect(stockQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        daily_dose: 1,
        medicine_name: 'Rifampicin 600mg',
      }),
    );
    expect(logs.insertOne).not.toHaveBeenCalled();
  });

  it('soft-deactivates owned stock instead of deleting it', async () => {
    stockQuery.first.mockResolvedValue(baseStock);
    stockQuery.update.mockResolvedValue({
      ...baseStock,
      is_active: false,
    });

    await service.deactivate(patientId, stockId.toHexString());

    expect(stockQuery.update).toHaveBeenCalledWith({ is_active: false });
  });

  it('restocks stock and writes its audit log in the same session', async () => {
    logs.findOne.mockResolvedValue(null);
    stocks.findOne.mockResolvedValue(baseStock);
    stocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    logs.insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    await service.restock(
      patientId,
      stockId.toHexString(),
      { quantity: 4, note: 'Pengambilan obat' },
      operationKey,
    );

    expect(stocks.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      { session },
    );
    expect(logs.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        change_quantity: 4,
        previous_quantity: 10,
        current_quantity: 14,
        reason: 'RESTOCK',
        note: 'Pengambilan obat',
        operation_key: operationKey,
      }),
      { session },
    );
  });

  it('returns success without mutating stock for a repeated identical operation', async () => {
    logs.findOne.mockResolvedValue({
      _id: new ObjectId(),
      change_quantity: 4,
      note: null,
    });

    await service.restock(
      patientId,
      stockId.toHexString(),
      { quantity: 4 },
      operationKey,
    );

    expect(stocks.findOne).not.toHaveBeenCalled();
    expect(stocks.updateOne).not.toHaveBeenCalled();
    expect(logs.insertOne).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    logs.findOne.mockResolvedValue({
      _id: new ObjectId(),
      change_quantity: 3,
      note: null,
    });

    await expect(
      service.restock(
        patientId,
        stockId.toHexString(),
        { quantity: 4 },
        operationKey,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 409,
        code: 'IDEMPOTENCY_CONFLICT',
      }),
    );
  });

  it('rejects insufficient daily stock before any stock or log write', async () => {
    logs.findOne.mockResolvedValue(null);
    stocks.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        baseStock,
        {
          ...baseStock,
          _id: new ObjectId(),
          medicine_name: 'Isoniazid',
          quantity: 1,
          daily_dose: 2,
        },
      ]),
    });

    await expect(
      service.consumeDailyDose(patientId, patientProfileId, 'checkin-1'),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 409,
        code: 'INSUFFICIENT_STOCK',
      }),
    );
    expect(stocks.updateOne).not.toHaveBeenCalled();
    expect(logs.insertOne).not.toHaveBeenCalled();
  });

  it('rejects an adjustment that would make stock negative', async () => {
    logs.findOne.mockResolvedValue(null);
    stocks.findOne.mockResolvedValue({ ...baseStock, quantity: 1 });

    await expect(
      service.adjust(
        patientId,
        stockId.toHexString(),
        { changeQuantity: -2, note: 'Obat rusak' },
        operationKey,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 409,
        code: 'STOCK_WOULD_BE_NEGATIVE',
      }),
    );
    expect(stocks.updateOne).not.toHaveBeenCalled();
    expect(logs.insertOne).not.toHaveBeenCalled();
  });

  it('consumes all daily doses once and reports threshold transitions', async () => {
    logs.findOne.mockResolvedValue(null);
    stocks.find.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([
        { ...baseStock, quantity: 6 },
        {
          ...baseStock,
          _id: new ObjectId(),
          quantity: 10,
          threshold_quantity: 2,
        },
      ]),
    });
    stocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    logs.insertOne.mockResolvedValue({ insertedId: new ObjectId() });

    const alerts = await service.consumeDailyDose(
      patientId,
      patientProfileId,
      'checkin-1',
    );

    expect(alerts).toEqual([stockId.toHexString()]);
    expect(stocks.updateOne).toHaveBeenCalledTimes(2);
    expect(logs.insertOne).toHaveBeenCalledTimes(2);
    expect(logs.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'CHECK_IN',
        operation_key: 'checkin-1',
      }),
      { session },
    );
  });

  it('skips a duplicate check-in without reading or changing stock', async () => {
    logs.findOne.mockResolvedValue({ _id: new ObjectId() });

    await expect(
      service.consumeDailyDose(patientId, patientProfileId, 'checkin-1'),
    ).resolves.toEqual([]);
    expect(stocks.find).not.toHaveBeenCalled();
    expect(stocks.updateOne).not.toHaveBeenCalled();
  });

  it('propagates a log failure so the transaction can roll back', async () => {
    logs.findOne.mockResolvedValue(null);
    stocks.findOne.mockResolvedValue(baseStock);
    stocks.updateOne.mockResolvedValue({ modifiedCount: 1 });
    logs.insertOne.mockRejectedValue(new Error('log write failed'));

    await expect(
      service.adjust(
        patientId,
        stockId.toHexString(),
        { changeQuantity: -1, note: 'Rusak' },
        operationKey,
      ),
    ).rejects.toThrow('log write failed');
    expect(stocks.updateOne).toHaveBeenCalledTimes(1);
  });
});
