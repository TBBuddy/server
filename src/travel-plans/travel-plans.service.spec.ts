import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';
import { Database } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import { MedicineStocksIndexService } from '../medicine-stocks/medicine-stocks-index.service';
import { PatientsIndexService } from '../patients/patients-index.service';
import { TravelPlansService } from './travel-plans.service';
import { ITravelPlan, TravelPlan } from './models/travel-plan.model';

describe('TravelPlansService', () => {
  const patientId = 'patient-1';
  const activeProfileId = new ObjectId().toHexString();
  const oldProfileId = new ObjectId().toHexString();
  const planId = new ObjectId();
  const now = new Date();
  const stockReadiness = {
    isAllStockEnough: false,
    totalNeeded: 5,
    totalAvailable: 3,
    stocks: [
      {
        stockId: new ObjectId().toHexString(),
        medicineName: 'OAT Travel',
        dailyDose: 1,
        durationDays: 5,
        neededQuantity: 5,
        availableQuantity: 3,
        isEnough: false,
        shortageQuantity: 2,
      },
    ],
  };
  const basePlan: ITravelPlan = {
    _id: planId,
    patient_id: patientId,
    patient_profile_id: activeProfileId,
    destination: 'Bandung, Jawa Barat',
    departure_date: dateOnlyAfter(10),
    return_date: dateOnlyAfter(14),
    cancelled_at: null,
    created_at: now,
    updated_at: now,
  };
  const cursor = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    toArray: jest.fn(),
  };
  const collection = {
    find: jest.fn(),
    findOne: jest.fn(),
    countDocuments: jest.fn(),
    updateOne: jest.fn(),
  };
  const createTravelPlan = jest.fn();
  const calculateTravelRequirementForProfile = jest.fn();
  const travelPlanModel = {
    create: createTravelPlan,
    query: jest.fn(() => ({
      getMongoDBCollection: jest.fn(() => ({
        createIndexes: jest.fn(),
      })),
    })),
  } as unknown as typeof TravelPlan;
  const patientsIndex = {
    getPatientProfile: jest.fn().mockResolvedValue({
      _id: new ObjectId(activeProfileId),
    }),
  } as unknown as PatientsIndexService;
  const medicineStocksIndex = {
    calculateTravelRequirementForProfile,
  } as unknown as MedicineStocksIndexService;
  const service = new TravelPlansService(
    travelPlanModel,
    patientsIndex,
    medicineStocksIndex,
    {
      getOrThrow: jest.fn((key: string) =>
        key === 'MONGODB_CONNECTION' ? 'mongodb://test' : 'test',
      ),
    } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    cursor.sort.mockReturnValue(cursor);
    cursor.skip.mockReturnValue(cursor);
    cursor.limit.mockReturnValue(cursor);
    cursor.toArray.mockResolvedValue([basePlan]);
    collection.find.mockReturnValue(cursor);
    collection.findOne.mockResolvedValue(basePlan);
    collection.countDocuments.mockResolvedValue(1);
    collection.updateOne.mockResolvedValue({ modifiedCount: 1 });
    calculateTravelRequirementForProfile.mockResolvedValue(stockReadiness);
    jest.spyOn(Database, 'getDb').mockReturnValue({
      collection: jest.fn(() => collection),
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a plan without longlat, facility, or stock snapshot fields', async () => {
    await service.create(patientId, {
      destination: 'Bandung, Jawa Barat',
      departureDate: formatDateOnly(dateOnlyAfter(10)),
      returnDate: formatDateOnly(dateOnlyAfter(14)),
    });

    expect(createTravelPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: patientId,
        patient_profile_id: activeProfileId,
        destination: 'Bandung, Jawa Barat',
        cancelled_at: null,
      }),
    );
    const [payload] = createTravelPlan.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(payload).not.toHaveProperty('lat');
    expect(payload).not.toHaveProperty('lng');
    expect(payload).not.toHaveProperty('latitude');
    expect(payload).not.toHaveProperty('longitude');
    expect(payload).not.toHaveProperty('location');
    expect(payload).not.toHaveProperty('stockReadiness');
    expect(payload).not.toHaveProperty('stock_readiness');
  });

  it('rejects past departure and return date before departure', async () => {
    await expect(
      service.create(patientId, {
        destination: 'Tanggal lampau',
        departureDate: formatDateOnly(dateOnlyAfter(-1)),
        returnDate: formatDateOnly(dateOnlyAfter(2)),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 400,
        code: 'BUSINESS_RULE_VIOLATION',
      }),
    );

    await expect(
      service.create(patientId, {
        destination: 'Tanggal kembali salah',
        departureDate: formatDateOnly(dateOnlyAfter(10)),
        returnDate: formatDateOnly(dateOnlyAfter(9)),
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 400,
        code: 'BUSINESS_RULE_VIOLATION',
      }),
    );
  });

  it('lists only active episode plans and computes stock readiness at read time', async () => {
    const result = await service.findAll(patientId, { page: 1, limit: 20 });

    expect(collection.find).toHaveBeenCalledWith({
      patient_id: patientId,
      patient_profile_id: activeProfileId,
    });
    expect(result.total).toBe(1);
    expect(result.plans[0]).toEqual(
      expect.objectContaining({
        id: planId.toHexString(),
        destination: 'Bandung, Jawa Barat',
        durationDays: 5,
        status: 'PLANNED',
        isEditable: true,
        stockReadiness,
      }),
    );
    expect(calculateTravelRequirementForProfile).toHaveBeenCalledWith(
      patientId,
      activeProfileId,
      5,
    );
  });

  it('updates editable active episode plans', async () => {
    await service.update(patientId, planId.toHexString(), {
      destination: 'Bandung Barat, Jawa Barat',
      returnDate: formatDateOnly(dateOnlyAfter(15)),
    });

    const [filter, update] = collection.updateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Partial<ITravelPlan> },
    ];
    expect(filter).toEqual({
      _id: planId,
      patient_id: patientId,
      patient_profile_id: activeProfileId,
      cancelled_at: null,
    });
    expect(update.$set).toEqual(
      expect.objectContaining({
        destination: 'Bandung Barat, Jawa Barat',
        return_date: startOfDate(dateOnlyAfter(15)),
      }),
    );
  });

  it('rejects cancelled, completed, and old episode mutation', async () => {
    collection.findOne.mockResolvedValueOnce({
      ...basePlan,
      cancelled_at: new Date(),
    });
    await expect(
      service.update(patientId, planId.toHexString(), {
        destination: 'Tidak boleh',
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 409,
        code: 'TRAVEL_PLAN_NOT_EDITABLE',
      }),
    );

    collection.findOne.mockResolvedValueOnce({
      ...basePlan,
      departure_date: dateOnlyAfter(-10),
      return_date: dateOnlyAfter(-5),
    });
    await expect(
      service.cancel(patientId, planId.toHexString()),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 409,
        code: 'TRAVEL_PLAN_NOT_EDITABLE',
      }),
    );

    collection.findOne.mockResolvedValueOnce({
      ...basePlan,
      patient_profile_id: oldProfileId,
    });
    await expect(
      service.cancel(patientId, planId.toHexString()),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        statusCode: 409,
        code: 'TRAVEL_PLAN_NOT_EDITABLE',
      }),
    );
  });

  it('keeps old episode detail readable but not editable', async () => {
    collection.findOne.mockResolvedValueOnce({
      ...basePlan,
      patient_profile_id: oldProfileId,
    });
    calculateTravelRequirementForProfile.mockResolvedValueOnce({
      ...stockReadiness,
      stocks: [],
    });

    const result = await service.findOne(patientId, planId.toHexString());

    expect(result).toEqual(
      expect.objectContaining({
        id: planId.toHexString(),
        patientProfileId: oldProfileId,
        isEditable: false,
      }),
    );
    expect(calculateTravelRequirementForProfile).toHaveBeenCalledWith(
      patientId,
      oldProfileId,
      5,
    );
  });
});

function dateOnlyAfter(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return startOfDate(date);
}

function startOfDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
