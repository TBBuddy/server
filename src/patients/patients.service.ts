import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@mongoloquent/nestjs';
import { addMonths, differenceInDays, parseISO, startOfDay } from 'date-fns';
import {
  ClientSession,
  Collection,
  MongoServerError,
  ObjectId,
  WithId,
} from 'mongodb';
import { PatientProfileStatus } from '../common/enums/patient-profile-status.enum';
import { TreatmentStatus } from '../common/enums/treatment-status.enum';
import { UserRole } from '../common/enums/user-role.enum';
import { AppException } from '../common/exceptions/app.exception';
import {
  IMedicineStock,
  MedicineStock,
} from '../medicine-stocks/models/medicine-stock.model';
import {
  DailyCheckin,
  IDailyCheckin,
} from '../checkins/models/daily-checkin.model';
import { IUser, User } from '../users/user.model';
import { runTransaction } from '../database/run-transaction';
import { ClosePatientProfileDto } from './dto/close-patient-profile.dto';
import { CreatePmoDto } from './dto/create-pmo.dto';
import { OnboardingDto } from './dto/onboarding.dto';
import {
  PatientDashboardResponseDto,
  PatientHistorySummaryDto,
  PatientPmoResponseDto,
  PatientProfileResponseDto,
} from './dto/patient-response.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { UpdatePmoDto } from './dto/update-pmo.dto';
import { IPatientPmo, PatientPmo } from './models/patient-pmo.model';
import {
  IPatientProfile,
  PatientProfile,
} from './models/patient-profile.model';
import { PatientProfileSerializer } from './serializers/patient-profile.serializer';

@Injectable()
export class PatientsService {
  constructor(
    @InjectModel(PatientProfile)
    private readonly profileModel: typeof PatientProfile,
    @InjectModel(PatientPmo)
    private readonly pmoModel: typeof PatientPmo,
    @InjectModel(User)
    private readonly userModel: typeof User,
    @InjectModel(MedicineStock)
    private readonly stockModel: typeof MedicineStock,
    @InjectModel(DailyCheckin)
    private readonly checkinModel: typeof DailyCheckin,
    private readonly configService: ConfigService,
  ) {}

  async createOnboarding(userId: string, dto: OnboardingDto): Promise<void> {
    if (dto.pmo) this.validatePmoContact(dto.pmo);
    await this.assertNoActiveProfile(userId);

    const diagnosisDate = startOfDay(parseISO(dto.diagnosisDate));
    const startDate = dto.treatmentStartDate
      ? startOfDay(parseISO(dto.treatmentStartDate))
      : startOfDay(new Date());
    const durationMonths = dto.hasDroppedBefore ? 8 : 6;

    if (startDate < diagnosisDate) {
      throw new AppException(
        422,
        'BUSINESS_RULE_VIOLATION',
        'Tanggal mulai pengobatan tidak boleh sebelum tanggal diagnosis.',
      );
    }

    const profileId = new ObjectId();
    const now = new Date();
    const profile: WithId<IPatientProfile> = {
      _id: profileId,
      user_id: userId,
      status: PatientProfileStatus.ACTIVE,
      diagnosis_date: diagnosisDate,
      medicine_time: dto.medicineTime,
      treatment_start_date: startDate,
      estimated_treatment_end_date: addMonths(startDate, durationMonths),
      treatment_day_count: Math.max(
        1,
        differenceInDays(startOfDay(now), startDate) + 1,
      ),
      treatment_duration_months: durationMonths,
      has_dropped_before: dto.hasDroppedBefore ?? false,
      previous_treatment_note: dto.previousTreatmentNote ?? null,
      current_streak: 0,
      longest_streak: 0,
      total_checkins: 0,
      total_missed_days: 0,
      ended_at: null,
      ended_reason: null,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.transaction(async (session) => {
        await this.profiles().insertOne(profile, { session });

        if (dto.pmo) {
          await this.pmos().insertOne(
            {
              _id: new ObjectId(),
              patient_id: userId,
              patient_profile_id: profileId.toHexString(),
              name: dto.pmo.name,
              relationship: dto.pmo.relationship ?? null,
              phone_number: dto.pmo.phoneNumber ?? null,
              whatsapp_number: dto.pmo.whatsappNumber ?? null,
              email: dto.pmo.email,
              is_primary: true,
              is_active: true,
              created_at: now,
              updated_at: now,
            },
            { session },
          );
        }

        const userResult = await this.users().updateOne(
          { _id: this.userObjectId(userId), is_active: true },
          {
            $set: {
              role: UserRole.PATIENT,
              treatment_status: TreatmentStatus.ON_TREATMENT,
              updated_at: now,
            },
          },
          { session },
        );
        if (userResult.matchedCount === 0) {
          throw new AppException(
            404,
            'RESOURCE_NOT_FOUND',
            'User tidak ditemukan.',
          );
        }
      });
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw this.activeProfileConflict();
      }
      throw error;
    }
  }

  async closeActiveProfile(
    userId: string,
    dto: ClosePatientProfileDto,
  ): Promise<void> {
    const profile = await this.requireActiveProfile(userId);
    const now = new Date();
    const treatmentStatus = {
      [PatientProfileStatus.RECOVERED]: TreatmentStatus.RECOVERED,
      [PatientProfileStatus.DROPPED]: TreatmentStatus.DROPPED,
      [PatientProfileStatus.CANCELLED]: TreatmentStatus.CANCELLED,
    }[dto.outcome];

    await this.transaction(async (session) => {
      const result = await this.profiles().updateOne(
        {
          _id: profile._id,
          user_id: userId,
          status: PatientProfileStatus.ACTIVE,
        },
        {
          $set: {
            status: dto.outcome,
            ended_at: now,
            ended_reason: dto.reason?.trim() || null,
            updated_at: now,
          },
        },
        { session },
      );
      if (result.matchedCount === 0) {
        throw new AppException(
          409,
          'PATIENT_PROFILE_NOT_ACTIVE',
          'Episode pengobatan sudah ditutup.',
        );
      }

      const profileId = profile._id.toHexString();
      await this.pmos().updateMany(
        {
          patient_id: userId,
          patient_profile_id: profileId,
          is_active: true,
        },
        { $set: { is_active: false, is_primary: false, updated_at: now } },
        { session },
      );
      await this.stocks().updateMany(
        {
          patient_id: userId,
          patient_profile_id: profileId,
          is_active: true,
        },
        { $set: { is_active: false, updated_at: now } },
        { session },
      );
      const userResult = await this.users().updateOne(
        { _id: this.userObjectId(userId), is_active: true },
        {
          $set: {
            role: UserRole.SUPPORTER,
            treatment_status: treatmentStatus,
            updated_at: now,
          },
        },
        { session },
      );
      if (userResult.matchedCount === 0) {
        throw new AppException(
          404,
          'RESOURCE_NOT_FOUND',
          'User tidak ditemukan.',
        );
      }
    });
  }

  async getOwnProfile(userId: string): Promise<PatientProfileResponseDto> {
    const profile = await this.requireActiveProfile(userId);
    const pmos = await this.pmoModel
      .where('patient_id', userId)
      .where('patient_profile_id', profile._id.toHexString())
      .where('is_active', true)
      .get();
    return PatientProfileSerializer.toProfile(profile, pmos);
  }

  async getHistory(userId: string): Promise<PatientHistorySummaryDto[]> {
    const profiles = await this.profileModel
      .where('user_id', userId)
      .orderBy('created_at', 'desc')
      .get();
    return profiles.map((profile) =>
      PatientProfileSerializer.toHistorySummary(profile),
    );
  }

  async getHistoryById(
    userId: string,
    profileId: string,
  ): Promise<PatientProfileResponseDto> {
    if (!ObjectId.isValid(profileId)) throw this.profileNotFound();
    const profile = await this.profileModel
      .where('_id', new ObjectId(profileId))
      .where('user_id', userId)
      .first();
    if (!profile) throw this.profileNotFound();

    const pmos = await this.pmoModel
      .where('patient_id', userId)
      .where('patient_profile_id', profileId)
      .get();
    return PatientProfileSerializer.toProfile(profile, pmos);
  }

  async updateOwnProfile(
    userId: string,
    dto: UpdatePatientProfileDto,
  ): Promise<void> {
    if (
      dto.medicineTime === undefined &&
      dto.treatmentStartDate === undefined &&
      dto.previousTreatmentNote === undefined
    ) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Minimal satu field harus dikirim.',
      );
    }

    const profile = await this.requireActiveProfile(userId);
    if (
      (dto.medicineTime !== undefined ||
        dto.treatmentStartDate !== undefined) &&
      !profile.has_dropped_before
    ) {
      throw new AppException(
        403,
        'BUSINESS_RULE_VIOLATION',
        'Perubahan jadwal pengobatan hanya diizinkan bagi pasien yang pernah putus obat.',
      );
    }

    const changes: Partial<IPatientProfile> = {};
    if (dto.medicineTime !== undefined)
      changes.medicine_time = dto.medicineTime;
    if (dto.previousTreatmentNote !== undefined) {
      changes.previous_treatment_note = dto.previousTreatmentNote;
    }
    if (dto.treatmentStartDate !== undefined) {
      const newStart = startOfDay(parseISO(dto.treatmentStartDate));
      if (newStart < startOfDay(new Date(profile.diagnosis_date))) {
        throw new AppException(
          422,
          'BUSINESS_RULE_VIOLATION',
          'Tanggal mulai pengobatan tidak boleh sebelum tanggal diagnosis.',
        );
      }
      changes.treatment_start_date = newStart;
      changes.estimated_treatment_end_date = addMonths(newStart, 8);
      changes.treatment_duration_months = 8;
      changes.treatment_day_count = 0;
      changes.current_streak = 0;
    }

    await this.profileModel.where('_id', profile._id).update(changes);
  }

  async getDashboard(userId: string): Promise<PatientDashboardResponseDto> {
    const profile = await this.requireActiveProfile(userId);
    const patientProfileId = profile._id.toHexString();
    const [todayCheckin, activeStocks] = await Promise.all([
      this.checkins().findOne({
        patient_id: userId,
        patient_profile_id: patientProfileId,
        checkin_date: startOfDay(new Date()),
      }),
      this.stocks()
        .find({
          patient_id: userId,
          patient_profile_id: patientProfileId,
          is_active: true,
        })
        .project<Pick<IMedicineStock, 'quantity'>>({ quantity: 1 })
        .toArray(),
    ]);
    return PatientProfileSerializer.toDashboard(profile, {
      stockDoses: activeStocks.reduce(
        (total, stock) => total + stock.quantity,
        0,
      ),
      hasCheckedInToday: todayCheckin !== null,
    });
  }

  async listPmos(userId: string): Promise<PatientPmoResponseDto[]> {
    const profile = await this.requireActiveProfile(userId);
    const pmos = await this.pmoModel
      .where('patient_id', userId)
      .where('patient_profile_id', profile._id.toHexString())
      .where('is_active', true)
      .get();
    return pmos.map((pmo) => PatientProfileSerializer.toPmo(pmo));
  }

  async createPmo(userId: string, dto: CreatePmoDto): Promise<void> {
    this.validatePmoContact(dto);
    const profile = await this.requireActiveProfile(userId);
    const profileId = profile._id.toHexString();
    const existingCount = await this.pmoModel
      .where('patient_id', userId)
      .where('patient_profile_id', profileId)
      .where('is_active', true)
      .count();

    await this.pmoModel.create({
      patient_id: userId,
      patient_profile_id: profileId,
      name: dto.name,
      relationship: dto.relationship ?? null,
      phone_number: dto.phoneNumber ?? null,
      whatsapp_number: dto.whatsappNumber ?? null,
      email: dto.email,
      is_primary: existingCount === 0,
      is_active: true,
    });
  }

  async updatePmo(
    userId: string,
    pmoId: string,
    dto: UpdatePmoDto,
  ): Promise<void> {
    const profile = await this.requireActiveProfile(userId);
    const profileId = profile._id.toHexString();
    const pmo = await this.requirePmo(userId, profileId, pmoId);
    const changes: Partial<IPatientPmo> = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.relationship !== undefined) changes.relationship = dto.relationship;
    if (dto.phoneNumber !== undefined) changes.phone_number = dto.phoneNumber;
    if (dto.whatsappNumber !== undefined) {
      changes.whatsapp_number = dto.whatsappNumber;
    }
    if (dto.email !== undefined) changes.email = dto.email;

    if (dto.isPrimary === false && pmo.is_primary) {
      throw new AppException(
        422,
        'BUSINESS_RULE_VIOLATION',
        'PMO utama hanya dapat diganti dengan memilih PMO utama yang baru.',
      );
    }
    if (Object.keys(changes).length === 0 && dto.isPrimary === undefined) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Minimal satu field harus dikirim.',
      );
    }
    if (!(changes.email ?? pmo.email)) {
      throw new AppException(
        422,
        'BUSINESS_RULE_VIOLATION',
        'PMO harus memiliki email untuk menerima notifikasi.',
      );
    }

    if (dto.isPrimary === true && !pmo.is_primary) {
      await this.transaction(async (session) => {
        await this.pmos().updateMany(
          {
            patient_id: userId,
            patient_profile_id: profileId,
            is_primary: true,
          },
          { $set: { is_primary: false, updated_at: new Date() } },
          { session },
        );
        await this.pmos().updateOne(
          { _id: new ObjectId(pmoId), patient_profile_id: profileId },
          { $set: { ...changes, is_primary: true, updated_at: new Date() } },
          { session },
        );
      });
      return;
    }
    if (Object.keys(changes).length > 0) {
      await this.pmoModel.where('_id', new ObjectId(pmoId)).update(changes);
    }
  }

  async deactivatePmo(userId: string, pmoId: string): Promise<void> {
    const profile = await this.requireActiveProfile(userId);
    const profileId = profile._id.toHexString();
    const pmo = await this.requirePmo(userId, profileId, pmoId);

    if (pmo.is_primary) {
      const otherActive = await this.pmoModel
        .where('patient_id', userId)
        .where('patient_profile_id', profileId)
        .where('is_active', true)
        .where('_id', '!=', new ObjectId(pmoId))
        .first();
      if (!otherActive) {
        throw new AppException(
          409,
          'BUSINESS_RULE_VIOLATION',
          'Tidak dapat menonaktifkan satu-satunya PMO aktif.',
        );
      }
      await this.transaction(async (session) => {
        await this.pmos().updateOne(
          { _id: otherActive._id, patient_profile_id: profileId },
          { $set: { is_primary: true, updated_at: new Date() } },
          { session },
        );
        await this.pmos().updateOne(
          { _id: new ObjectId(pmoId), patient_profile_id: profileId },
          {
            $set: {
              is_active: false,
              is_primary: false,
              updated_at: new Date(),
            },
          },
          { session },
        );
      });
      return;
    }

    await this.pmoModel
      .where('_id', new ObjectId(pmoId))
      .update({ is_active: false, is_primary: false });
  }

  async requireActiveProfile(userId: string): Promise<IPatientProfile> {
    const profile = await this.profileModel
      .where('user_id', userId)
      .where('status', PatientProfileStatus.ACTIVE)
      .first();
    if (!profile) throw this.profileNotFound();
    return profile;
  }

  async requireProfile(userId: string): Promise<IPatientProfile> {
    return this.requireActiveProfile(userId);
  }

  private async assertNoActiveProfile(userId: string): Promise<void> {
    const existing = await this.profileModel
      .where('user_id', userId)
      .where('status', PatientProfileStatus.ACTIVE)
      .first();
    if (existing) throw this.activeProfileConflict();
  }

  private async requirePmo(
    userId: string,
    profileId: string,
    pmoId: string,
  ): Promise<IPatientPmo> {
    if (!ObjectId.isValid(pmoId)) {
      throw new AppException(404, 'RESOURCE_NOT_FOUND', 'PMO tidak ditemukan.');
    }
    const pmo = await this.pmoModel
      .where('_id', new ObjectId(pmoId))
      .where('patient_id', userId)
      .where('patient_profile_id', profileId)
      .where('is_active', true)
      .first();
    if (!pmo) {
      throw new AppException(404, 'RESOURCE_NOT_FOUND', 'PMO tidak ditemukan.');
    }
    return pmo;
  }

  private validatePmoContact(dto: Pick<CreatePmoDto, 'email'>): void {
    if (!dto.email) {
      throw new AppException(
        422,
        'BUSINESS_RULE_VIOLATION',
        'PMO harus memiliki email untuk menerima notifikasi.',
      );
    }
  }

  private activeProfileConflict(): AppException {
    return new AppException(
      409,
      'ONBOARDING_ALREADY_COMPLETED',
      'Pasien masih memiliki episode pengobatan aktif.',
    );
  }

  private profileNotFound(): AppException {
    return new AppException(
      404,
      'RESOURCE_NOT_FOUND',
      'Profil pasien aktif tidak ditemukan.',
    );
  }

  private userObjectId(userId: string): ObjectId {
    if (!ObjectId.isValid(userId)) throw this.profileNotFound();
    return new ObjectId(userId);
  }

  private transaction<T>(
    callback: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    return runTransaction(this.configService, callback);
  }

  private profiles(): Collection<IPatientProfile> {
    return this.profileModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IPatientProfile>;
  }

  private pmos(): Collection<IPatientPmo> {
    return this.pmoModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IPatientPmo>;
  }

  private users(): Collection<IUser> {
    return this.userModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IUser>;
  }

  private stocks(): Collection<IMedicineStock> {
    return this.stockModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IMedicineStock>;
  }

  private checkins(): Collection<IDailyCheckin> {
    return this.checkinModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IDailyCheckin>;
  }
}
