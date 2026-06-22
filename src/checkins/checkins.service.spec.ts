import { ConfigService } from '@nestjs/config';
import { ClientSession, ObjectId } from 'mongodb';
import { DB, Database } from 'mongoloquent';
import { AppException } from '../common/exceptions/app.exception';
import { SeverityLevel } from '../common/enums/severity-level.enum';
import { MedicineStocksIndexService } from '../medicine-stocks/medicine-stocks-index.service';
import { PatientsIndexService } from '../patients/patients-index.service';
import { CheckinsService } from './checkins.service';
import { CheckinSymptom } from './models/checkin-symptom.model';
import { DailyCheckin } from './models/daily-checkin.model';
import { Symptom } from './models/symptom.model';

describe('CheckinsService', () => {
  const session = {} as ClientSession;
  const patientId = 'patient-1';
  const symptomId = new ObjectId();
  const checkinId = new ObjectId();
  const profile = {
    _id: new ObjectId(),
    user_id: patientId,
    treatment_start_date: new Date(),
    total_checkins: 0,
    total_missed_days: 0,
    treatment_day_count: 1,
  };
  const symptoms = {
    countDocuments: jest.fn(),
    find: jest.fn(),
    bulkWrite: jest.fn(),
  };
  const checkins = {
    findOne: jest.fn(),
    insertOne: jest.fn(),
    updateOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };
  const checkinSymptoms = {
    find: jest.fn(),
    deleteMany: jest.fn(),
    insertMany: jest.fn(),
  };
  const patientsIndex = {
    getPatientProfile: jest.fn(),
    incrementPatientStats: jest.fn(),
  };
  const medicineStocksIndex = {
    consumeDailyDose: jest.fn(),
    fireStockAlert: jest.fn(),
  };
  const service = new CheckinsService(
    Symptom,
    DailyCheckin,
    CheckinSymptom,
    patientsIndex as unknown as PatientsIndexService,
    medicineStocksIndex as unknown as MedicineStocksIndexService,
    {
      getOrThrow: jest.fn((key: string) =>
        key === 'MONGODB_CONNECTION' ? 'mongodb://test' : 'test',
      ),
    } as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    patientsIndex.getPatientProfile.mockResolvedValue(profile);
    patientsIndex.incrementPatientStats.mockResolvedValue(undefined);
    medicineStocksIndex.consumeDailyDose.mockResolvedValue([]);
    medicineStocksIndex.fireStockAlert.mockResolvedValue(undefined);
    symptoms.countDocuments.mockResolvedValue(0);
    symptoms.find.mockReturnValue({ toArray: jest.fn().mockResolvedValue([]) });
    checkins.findOne.mockResolvedValue(null);
    checkins.insertOne.mockResolvedValue({ insertedId: checkinId });
    checkins.updateOne.mockResolvedValue({ modifiedCount: 1 });
    checkinSymptoms.deleteMany.mockResolvedValue({ deletedCount: 0 });
    checkinSymptoms.insertMany.mockResolvedValue({ insertedCount: 1 });
    checkinSymptoms.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      }),
    });
    jest.spyOn(Database, 'getDb').mockReturnValue({
      collection: jest.fn((name: string) => {
        if (name === 'symptoms') return symptoms;
        if (name === 'daily_checkins') return checkins;
        return checkinSymptoms;
      }),
    } as never);
    jest
      .spyOn(DB, 'transaction')
      .mockImplementation(async (callback) => callback(session));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates a taken check-in and consumes stock in the same session', async () => {
    await service.createCheckin(
      patientId,
      { hasTakenMedicine: true, hasComplaint: false },
      '4d165eda-5d7d-45f5-8ab0-b2ea1354bb31',
    );

    expect(checkins.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: patientId,
        has_taken_medicine: true,
        severity: SeverityLevel.NONE,
      }),
      { session },
    );
    expect(medicineStocksIndex.consumeDailyDose).toHaveBeenCalledWith(
      patientId,
      expect.any(String),
      session,
    );
    expect(patientsIndex.incrementPatientStats).toHaveBeenCalledWith(
      patientId,
      expect.objectContaining({ totalCheckins: 1, totalMissedDays: 0 }),
      session,
    );
  });

  it('creates complaint symptoms and derives the highest severity', async () => {
    symptoms.countDocuments.mockResolvedValue(1);

    await service.createCheckin(
      patientId,
      {
        hasTakenMedicine: true,
        hasComplaint: true,
        symptoms: [
          {
            symptomId: symptomId.toHexString(),
            severity: SeverityLevel.SEVERE,
          },
        ],
      },
      '7d985c7e-c682-47d2-aa38-ae7fbef59068',
    );

    expect(checkins.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({ severity: SeverityLevel.SEVERE }),
      { session },
    );
    expect(checkinSymptoms.insertMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          symptom_id: symptomId.toHexString(),
          severity: SeverityLevel.SEVERE,
        }),
      ],
      { session },
    );
  });

  it('requires a skipped reason when medicine was not taken', async () => {
    await expect(
      service.createCheckin(
        patientId,
        { hasTakenMedicine: false },
        '7039bd90-74ac-44c8-8283-cb6577c69578',
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        code: 'BUSINESS_RULE_VIOLATION',
      }),
    );
    expect(checkins.insertOne).not.toHaveBeenCalled();
  });

  it('rejects invalid symptoms before opening the transaction', async () => {
    symptoms.countDocuments.mockResolvedValue(0);

    await expect(
      service.createCheckin(
        patientId,
        {
          hasTakenMedicine: true,
          hasComplaint: true,
          symptoms: [
            {
              symptomId: symptomId.toHexString(),
              severity: SeverityLevel.MILD,
            },
          ],
        },
        '89d2c79c-6bd8-4826-9b98-37e9286b63ee',
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        code: 'INVALID_SYMPTOM',
      }),
    );
    expect(checkins.insertOne).not.toHaveBeenCalled();
  });

  it('treats a repeated identical daily payload as successful', async () => {
    checkins.findOne.mockResolvedValue({
      _id: checkinId,
      patient_id: patientId,
      checkin_date: new Date(),
      treatment_day_number: 1,
      has_taken_medicine: true,
      taken_at: null,
      has_complaint: false,
      severity: SeverityLevel.NONE,
      general_note: null,
      skipped_reason: null,
    });

    await service.createCheckin(
      patientId,
      { hasTakenMedicine: true, hasComplaint: false },
      '1a366c61-f23e-48d7-8d61-831921be613e',
    );

    expect(checkins.insertOne).not.toHaveBeenCalled();
    expect(medicineStocksIndex.consumeDailyDose).not.toHaveBeenCalled();
  });

  it('returns idempotency conflict for a different retry payload', async () => {
    checkins.findOne.mockResolvedValue({
      _id: checkinId,
      patient_id: patientId,
      checkin_date: new Date(),
      treatment_day_number: 1,
      has_taken_medicine: false,
      taken_at: null,
      has_complaint: false,
      severity: SeverityLevel.NONE,
      general_note: null,
      skipped_reason: 'Lupa',
    });

    await expect(
      service.createCheckin(
        patientId,
        { hasTakenMedicine: true, hasComplaint: false },
        '13180c7c-1fe5-453b-b1f5-39cc7d680b85',
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        code: 'IDEMPOTENCY_CONFLICT',
      }),
    );
  });

  it('propagates stock failure so the database transaction rolls back', async () => {
    medicineStocksIndex.consumeDailyDose.mockRejectedValue(
      new Error('stock failed'),
    );

    await expect(
      service.createCheckin(
        patientId,
        { hasTakenMedicine: true },
        '4f981dcb-a4f9-42ce-a893-bd86109ed3e5',
      ),
    ).rejects.toThrow('stock failed');
    expect(checkins.insertOne).toHaveBeenCalled();
  });

  it('consumes stock once when same-day correction changes skipped to taken', async () => {
    checkins.findOne.mockResolvedValue({
      _id: checkinId,
      patient_id: patientId,
      checkin_date: new Date(),
      treatment_day_number: 1,
      has_taken_medicine: false,
      taken_at: null,
      has_complaint: false,
      severity: SeverityLevel.NONE,
      general_note: null,
      skipped_reason: 'Lupa',
    });

    await service.updateCheckin(patientId, checkinId.toHexString(), {
      hasTakenMedicine: true,
      skippedReason: undefined,
    });

    expect(medicineStocksIndex.consumeDailyDose).toHaveBeenCalledWith(
      patientId,
      checkinId.toHexString(),
      session,
    );
  });

  it('returns paginated monthly history metadata', async () => {
    checkins.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });
    checkins.countDocuments.mockResolvedValue(21);

    const result = await service.getCheckins(patientId, {
      page: 2,
      limit: 20,
      year: 2026,
      month: 6,
      sortOrder: 'desc',
    });

    expect(result.meta).toEqual({
      page: 2,
      limit: 20,
      totalItems: 21,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it('rejects access to a check-in owned by another patient', async () => {
    checkins.findOne.mockResolvedValue(null);

    await expect(
      service.getCheckinById(patientId, checkinId.toHexString()),
    ).rejects.toEqual(
      expect.objectContaining<Partial<AppException>>({
        code: 'RESOURCE_NOT_FOUND',
      }),
    );
  });
});
