import { Injectable } from '@nestjs/common';
import { InjectModel } from '@mongoloquent/nestjs';
import { DB } from 'mongoloquent';
import { ObjectId } from 'mongodb';
import { addMonths, differenceInDays, parseISO, startOfDay } from 'date-fns';
import { AppException } from '../common/exceptions/app.exception';
import { PatientProfile, IPatientProfile } from './models/patient-profile.model';
import { PatientPmo, IPatientPmo } from './models/patient-pmo.model';
import { OnboardingDto } from './dto/onboarding.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { CreatePmoDto } from './dto/create-pmo.dto';
import { UpdatePmoDto } from './dto/update-pmo.dto';
import { PatientProfileSerializer } from './serializers/patient-profile.serializer';
import {
  PatientProfileResponseDto,
  PatientDashboardResponseDto,
  PatientPmoResponseDto,
} from './dto/patient-response.dto';

@Injectable()
export class PatientsService {
  constructor(
    @InjectModel(PatientProfile)
    private readonly profileModel: typeof PatientProfile,
    @InjectModel(PatientPmo)
    private readonly pmoModel: typeof PatientPmo,
  ) {}

  // ─── ONBOARDING ───────────────────────────────────────────────────────────

  async createOnboarding(userId: string, dto: OnboardingDto): Promise<void> {
    const existing = await this.profileModel
      .where('user_id', userId)
      .first();

    if (existing) {
      throw new AppException(
        409,
        'ONBOARDING_ALREADY_COMPLETED',
        'Pasien sudah menyelesaikan onboarding.',
      );
    }

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

    const estimatedEnd = addMonths(startDate, durationMonths);
    const today = startOfDay(new Date());
    const treatmentDayCount = Math.max(
      1,
      differenceInDays(today, startDate) + 1,
    );

    await this.profileModel.create({
      user_id: userId,
      diagnosis_date: diagnosisDate,
      medicine_time: dto.medicineTime,
      treatment_start_date: startDate,
      estimated_treatment_end_date: estimatedEnd,
      treatment_day_count: treatmentDayCount,
      treatment_duration_months: durationMonths,
      has_dropped_before: dto.hasDroppedBefore ?? false,
      previous_treatment_note: dto.previousTreatmentNote ?? null,
      current_streak: 0,
      longest_streak: 0,
      total_checkins: 0,
      total_missed_days: 0,
    });

    if (dto.pmo) {
      this.validatePmoContact(dto.pmo);
      await this.pmoModel.create({
        patient_id: userId,
        name: dto.pmo.name,
        relationship: dto.pmo.relationship ?? null,
        phone_number: dto.pmo.phoneNumber ?? null,
        whatsapp_number: dto.pmo.whatsappNumber ?? null,
        email: dto.pmo.email ?? null,
        is_primary: true,
        is_active: true,
      });
    }
  }

  // ─── PROFILE ──────────────────────────────────────────────────────────────

  async getOwnProfile(userId: string): Promise<PatientProfileResponseDto> {
    const profile = await this.requireProfile(userId);
    const pmos = await this.pmoModel
      .where('patient_id', userId)
      .where('is_active', true)
      .get();

    return PatientProfileSerializer.toProfile(profile, pmos as IPatientPmo[]);
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

    const profile = await this.requireProfile(userId);

    // medicine_time dan treatment_start_date hanya boleh diubah jika has_dropped_before = true
    if (
      (dto.medicineTime !== undefined || dto.treatmentStartDate !== undefined) &&
      !profile.has_dropped_before
    ) {
      throw new AppException(
        403,
        'BUSINESS_RULE_VIOLATION',
        'Perubahan jadwal pengobatan hanya diizinkan bagi pasien yang pernah putus obat.',
      );
    }

    const changes: Partial<IPatientProfile> = {};

    if (dto.medicineTime !== undefined) {
      changes.medicine_time = dto.medicineTime;
    }

    if (dto.previousTreatmentNote !== undefined) {
      changes.previous_treatment_note = dto.previousTreatmentNote;
    }

    // Restart treatment flow
    if (dto.treatmentStartDate !== undefined) {
      const newStart = startOfDay(parseISO(dto.treatmentStartDate));
      const diagnosisDate = startOfDay(new Date(profile.diagnosis_date));

      if (newStart < diagnosisDate) {
        throw new AppException(
          422,
          'BUSINESS_RULE_VIOLATION',
          'Tanggal mulai pengobatan tidak boleh sebelum tanggal diagnosis.',
        );
      }

      // Field yang direset untuk siklus baru
      changes.treatment_start_date = newStart;
      changes.estimated_treatment_end_date = addMonths(newStart, 8);
      changes.treatment_duration_months = 8;
      changes.treatment_day_count = 0;
      changes.current_streak = 0;
      // total_checkins, total_missed_days, longest_streak, has_dropped_before
      // TIDAK direset — ini lifetime stats
    }

    await this.profileModel
      .where('user_id', userId)
      .update(changes);
  }

  async getDashboard(userId: string): Promise<PatientDashboardResponseDto> {
    const profile = await this.requireProfile(userId);
    return PatientProfileSerializer.toDashboard(profile);
  }

  // ─── PMO ──────────────────────────────────────────────────────────────────

  async listPmos(userId: string): Promise<PatientPmoResponseDto[]> {
    const pmos = await this.pmoModel
      .where('patient_id', userId)
      .where('is_active', true)
      .get();

    return (pmos as IPatientPmo[]).map((p) =>
      PatientProfileSerializer.toPmo(p),
    );
  }

  async createPmo(userId: string, dto: CreatePmoDto): Promise<void> {
    this.validatePmoContact(dto);

    // Jika belum ada PMO aktif, yang baru ini otomatis jadi primary
    const existingCount = await this.pmoModel
      .where('patient_id', userId)
      .where('is_active', true)
      .count();

    const isPrimary = existingCount === 0;

    await this.pmoModel.create({
      patient_id: userId,
      name: dto.name,
      relationship: dto.relationship ?? null,
      phone_number: dto.phoneNumber ?? null,
      whatsapp_number: dto.whatsappNumber ?? null,
      email: dto.email ?? null,
      is_primary: isPrimary,
      is_active: true,
    });
  }

  async updatePmo(
    userId: string,
    pmoId: string,
    dto: UpdatePmoDto,
  ): Promise<void> {
    const pmo = await this.requirePmo(userId, pmoId);

    if (dto.isPrimary === true && !pmo.is_primary) {
      // Switching primary harus atomik: unset semua, lalu set yang baru
      await DB.transaction(async () => {
        await this.pmoModel
          .where('patient_id', userId)
          .where('is_primary', true)
          .update({ is_primary: false });

        await this.pmoModel
          .where('_id', new ObjectId(pmoId))
          .update({ is_primary: true });
      });
      return;
    }

    const changes: Partial<IPatientPmo> = {};
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.relationship !== undefined) changes.relationship = dto.relationship;
    if (dto.phoneNumber !== undefined) changes.phone_number = dto.phoneNumber;
    if (dto.whatsappNumber !== undefined) changes.whatsapp_number = dto.whatsappNumber;
    if (dto.email !== undefined) changes.email = dto.email;

    if (Object.keys(changes).length === 0) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Minimal satu field harus dikirim.',
      );
    }

    // Validasi email tetap ada setelah perubahan diterapkan
    const mergedEmail = changes.email ?? pmo.email;
    if (!mergedEmail) {
      throw new AppException(
        422,
        'BUSINESS_RULE_VIOLATION',
        'PMO harus memiliki email untuk menerima notifikasi.',
      );
    }

    await this.pmoModel
      .where('_id', new ObjectId(pmoId))
      .update(changes);
  }

  async deactivatePmo(userId: string, pmoId: string): Promise<void> {
    const pmo = await this.requirePmo(userId, pmoId);

    if (pmo.is_primary) {
      // Cari PMO aktif lain yang bisa dipromote jadi primary
      const otherActive = await this.pmoModel
        .where('patient_id', userId)
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

      // Promote PMO lain jadi primary, lalu nonaktifkan yang ini
      await DB.transaction(async () => {
        await this.pmoModel
          .where('_id', (otherActive as IPatientPmo)._id)
          .update({ is_primary: true });

        await this.pmoModel
          .where('_id', new ObjectId(pmoId))
          .update({ is_active: false, is_primary: false });
      });
      return;
    }

    await this.pmoModel
      .where('_id', new ObjectId(pmoId))
      .update({ is_active: false });
  }

  // ─── SHARED HELPERS ───────────────────────────────────────────────────────

  async requireProfile(userId: string): Promise<IPatientProfile> {
    const profile = await this.profileModel
      .where('user_id', userId)
      .first();

    if (!profile) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Profil pasien tidak ditemukan.',
      );
    }
    return profile as IPatientProfile;
  }

  private async requirePmo(
    userId: string,
    pmoId: string,
  ): Promise<IPatientPmo> {
    if (!ObjectId.isValid(pmoId)) {
      throw new AppException(404, 'RESOURCE_NOT_FOUND', 'PMO tidak ditemukan.');
    }

    const pmo = await this.pmoModel
      .where('_id', new ObjectId(pmoId))
      .where('patient_id', userId)
      .where('is_active', true)
      .first();

    if (!pmo) {
      throw new AppException(404, 'RESOURCE_NOT_FOUND', 'PMO tidak ditemukan.');
    }
    return pmo as IPatientPmo;
  }

  private validatePmoContact(
    dto: Pick<CreatePmoDto, 'email'>,
  ): void {
    if (!dto.email) {
      throw new AppException(
        422,
        'BUSINESS_RULE_VIOLATION',
        'PMO harus memiliki email untuk menerima notifikasi.',
      );
    }
  }
}