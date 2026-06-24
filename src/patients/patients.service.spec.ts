/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config';
import { ClientSession, MongoServerError, ObjectId } from 'mongodb';
import { DB } from 'mongoloquent';
import { PatientProfileStatus } from '../common/enums/patient-profile-status.enum';
import { TreatmentStatus } from '../common/enums/treatment-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { PatientsService } from './patients.service';
import { PatientPmo } from './models/patient-pmo.model';
import {
  IPatientProfile,
  PatientProfile,
} from './models/patient-profile.model';
import { User } from '../users/user.model';
import { MedicineStock } from '../medicine-stocks/models/medicine-stock.model';
import { DailyCheckin } from '../checkins/models/daily-checkin.model';

describe('PatientsService', () => {
  const session = {} as ClientSession;
  const userId = new ObjectId().toHexString();
  const profileId = new ObjectId();
  const activeProfile: IPatientProfile = {
    _id: profileId,
    user_id: userId,
    status: PatientProfileStatus.ACTIVE,
    diagnosis_date: new Date('2026-01-01'),
    medicine_time: '07:30',
    treatment_start_date: new Date('2026-01-02'),
    estimated_treatment_end_date: new Date('2026-07-02'),
    treatment_day_count: 1,
    treatment_duration_months: 6,
    has_dropped_before: false,
    previous_treatment_note: null,
    current_streak: 0,
    longest_streak: 0,
    total_checkins: 0,
    total_missed_days: 0,
    ended_at: null,
    ended_reason: null,
  };
  const profileQuery = {
    where: jest.fn(),
    first: jest.fn(),
    get: jest.fn(),
    orderBy: jest.fn(),
    update: jest.fn(),
  };
  profileQuery.where.mockReturnValue(profileQuery);
  profileQuery.orderBy.mockReturnValue(profileQuery);
  const pmoQuery = {
    where: jest.fn(),
    get: jest.fn(),
    first: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  };
  pmoQuery.where.mockReturnValue(pmoQuery);
  const profileModel = {
    where: jest.fn(() => profileQuery),
    query: jest.fn(() => ({
      getMongoDBCollection: jest.fn(() => profiles),
    })),
  } as unknown as typeof PatientProfile;
  const pmoModel = {
    where: jest.fn(() => pmoQuery),
    create: jest.fn(),
    query: jest.fn(() => ({
      getMongoDBCollection: jest.fn(() => pmos),
    })),
  } as unknown as typeof PatientPmo;
  const profiles = {
    insertOne: jest.fn(),
    updateOne: jest.fn(),
  };
  const pmos = {
    insertOne: jest.fn(),
    updateMany: jest.fn(),
    updateOne: jest.fn(),
  };
  const users = {
    updateOne: jest.fn(),
  };
  const stocks = {
    updateMany: jest.fn(),
    find: jest.fn(),
  };
  const stockCursor = {
    project: jest.fn(),
    toArray: jest.fn(),
  };
  const checkins = {
    findOne: jest.fn(),
  };
  const userModel = {
    query: jest.fn(() => ({
      getMongoDBCollection: jest.fn(() => users),
    })),
  } as unknown as typeof User;
  const stockModel = {
    query: jest.fn(() => ({
      getMongoDBCollection: jest.fn(() => stocks),
    })),
  } as unknown as typeof MedicineStock;
  const checkinModel = {
    query: jest.fn(() => ({
      getMongoDBCollection: jest.fn(() => checkins),
    })),
  } as unknown as typeof DailyCheckin;
  const notificationsService = {
    scheduleDailyMedicineReminders: jest.fn(),
    cancelPendingEpisodeJobs: jest.fn(),
    rescheduleDailyMedicineReminders: jest.fn(),
  };
  const service = new PatientsService(
    profileModel,
    pmoModel,
    userModel,
    stockModel,
    checkinModel,
    {
      getOrThrow: jest.fn((key: string) =>
        key === 'MONGODB_CONNECTION' ? 'mongodb://test' : 'test',
      ),
    } as unknown as ConfigService,
    notificationsService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    profileQuery.where.mockReturnValue(profileQuery);
    profileQuery.orderBy.mockReturnValue(profileQuery);
    pmoQuery.where.mockReturnValue(pmoQuery);
    profileQuery.first.mockResolvedValue(null);
    profiles.insertOne.mockResolvedValue({ insertedId: profileId });
    profiles.updateOne.mockResolvedValue({ matchedCount: 1 });
    pmos.insertOne.mockResolvedValue({ insertedId: new ObjectId() });
    pmos.updateMany.mockResolvedValue({ modifiedCount: 1 });
    users.updateOne.mockResolvedValue({ matchedCount: 1 });
    stocks.updateMany.mockResolvedValue({ modifiedCount: 1 });
    stocks.find.mockReturnValue(stockCursor);
    stockCursor.project.mockReturnValue(stockCursor);
    stockCursor.toArray.mockResolvedValue([{ quantity: 8 }, { quantity: 10 }]);
    checkins.findOne.mockResolvedValue({ _id: new ObjectId() });
    notificationsService.scheduleDailyMedicineReminders.mockResolvedValue([]);
    notificationsService.cancelPendingEpisodeJobs.mockResolvedValue(undefined);
    notificationsService.rescheduleDailyMedicineReminders.mockResolvedValue([]);
    jest
      .spyOn(DB.prototype, 'transaction')
      .mockImplementation(async (callback) => callback(session));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates an active episode and promotes a supporter to patient atomically', async () => {
    await service.createOnboarding(userId, {
      diagnosisDate: '2026-01-01',
      treatmentStartDate: '2026-01-02',
      medicineTime: '07:30',
      pmo: {
        name: 'PMO Test',
        email: 'pmo@example.com',
      },
    });

    expect(profiles.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        status: PatientProfileStatus.ACTIVE,
      }),
      { session },
    );
    expect(pmos.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: userId,
        patient_profile_id: expect.any(String),
      }),
      { session },
    );
    expect(users.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          role: UserRole.PATIENT,
          treatment_status: TreatmentStatus.ON_TREATMENT,
        }),
      }),
      { session },
    );
  });

  it('rejects onboarding while an active episode exists', async () => {
    profileQuery.first.mockResolvedValue(activeProfile);

    await expect(
      service.createOnboarding(userId, {
        diagnosisDate: '2026-01-01',
        medicineTime: '07:30',
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ONBOARDING_ALREADY_COMPLETED' }),
    );
    expect(DB.prototype.transaction).not.toHaveBeenCalled();
  });

  it('maps concurrent active-profile insertion to an onboarding conflict', async () => {
    jest.spyOn(DB.prototype, 'transaction').mockRejectedValueOnce(
      new MongoServerError({
        ok: 0,
        code: 11000,
        errmsg: 'duplicate active profile',
      }),
    );

    await expect(
      service.createOnboarding(userId, {
        diagnosisDate: '2026-01-01',
        medicineTime: '07:30',
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: 'ONBOARDING_ALREADY_COMPLETED' }),
    );
  });

  it('closes an episode, disables active resources, and returns the user to supporter', async () => {
    profileQuery.first.mockResolvedValue(activeProfile);

    await service.closeActiveProfile(userId, {
      outcome: PatientProfileStatus.RECOVERED,
      reason: 'Pengobatan selesai.',
    });

    expect(profiles.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ _id: profileId }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: PatientProfileStatus.RECOVERED,
          ended_reason: 'Pengobatan selesai.',
        }),
      }),
      { session },
    );
    expect(pmos.updateMany).toHaveBeenCalled();
    expect(stocks.updateMany).toHaveBeenCalled();
    expect(users.updateOne).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        $set: expect.objectContaining({
          role: UserRole.SUPPORTER,
          treatment_status: TreatmentStatus.RECOVERED,
        }),
      }),
      { session },
    );
  });

  it('builds the active dashboard from the current episode only', async () => {
    profileQuery.first.mockResolvedValue(activeProfile);

    await expect(service.getDashboard(userId)).resolves.toEqual(
      expect.objectContaining({
        treatmentStartDate: activeProfile.treatment_start_date,
        stockDoses: 18,
        hasCheckedInToday: true,
      }),
    );
    expect(stocks.find).toHaveBeenCalledWith({
      patient_id: userId,
      patient_profile_id: profileId.toHexString(),
      is_active: true,
    });
    expect(checkins.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        patient_id: userId,
        patient_profile_id: profileId.toHexString(),
      }),
    );
  });

  it('does not expose a treatment episode owned by another user', async () => {
    profileQuery.first.mockResolvedValue(null);

    await expect(
      service.getHistoryById(userId, new ObjectId().toHexString()),
    ).rejects.toEqual(expect.objectContaining({ code: 'RESOURCE_NOT_FOUND' }));
  });
});
