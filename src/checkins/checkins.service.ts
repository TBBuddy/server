import { Injectable } from '@nestjs/common';
import { InjectModel } from '@mongoloquent/nestjs';
import { ConfigService } from '@nestjs/config';
import { Database } from 'mongoloquent';
import { ObjectId } from 'mongodb';
import { differenceInDays, startOfDay } from 'date-fns';
import { AppException } from '../common/exceptions/app.exception';
import { SeverityLevel } from '../common/enums/severity-level.enum';
import { Symptom, ISymptom } from './models/symptom.model';
import { DailyCheckin, IDailyCheckin } from './models/daily-checkin.model';
import {
  CheckinSymptom,
  ICheckinSymptom,
} from './models/checkin-symptom.model';
import {
  PatientProfile,
  IPatientProfile,
} from '../patients/models/patient-profile.model';
import { CreateCheckinDto } from './dto/create-checkin.dto';
import { UpdateCheckinDto } from './dto/update-checkin.dto';
import { GetCheckinsDto } from './dto/get-checkins.dto';
import { CheckinResponseDto } from './dto/checkin-response.dto';
import { SymptomResponseDto } from './dto/symptom-response.dto';
import { symptomsSeed } from './seed/symptoms.seed';

@Injectable()
export class CheckinsService {
  constructor(
    @InjectModel(Symptom)
    private readonly symptomModel: typeof Symptom,
    @InjectModel(DailyCheckin)
    private readonly checkinModel: typeof DailyCheckin,
    @InjectModel(CheckinSymptom)
    private readonly checkinSymptomModel: typeof CheckinSymptom,
    @InjectModel(PatientProfile)
    private readonly profileModel: typeof PatientProfile,
    private readonly configService: ConfigService,
  ) {}

  async getSymptoms(): Promise<SymptomResponseDto[]> {
    const symptoms = await this.symptomModel
      .orderBy('category', 'asc')
      .orderBy('name', 'asc')
      .get();

    return symptoms.map((s) => ({
      _id: s._id.toString(),
      name: s.name,
      description: s.description ?? null,
      category: s.category ?? null,
      is_common_tb_symptom: s.is_common_tb_symptom,
      is_possible_side_effect: s.is_possible_side_effect,
    }));
  }

  async getTodayCheckin(userId: string): Promise<CheckinResponseDto | null> {
    await this.requireProfile(userId);

    const today = startOfDay(new Date());
    const checkin = await this.checkinModel
      .where('patient_id', userId)
      .where('checkin_date', today)
      .first();

    if (!checkin) return null;

    return this.buildCheckinResponse(checkin);
  }

  async createCheckin(
    userId: string,
    dto: CreateCheckinDto,
  ): Promise<CheckinResponseDto> {
    const profile = await this.requireProfile(userId);
    const today = startOfDay(new Date());

    const existing = await this.checkinModel
      .where('patient_id', userId)
      .where('checkin_date', today)
      .first();

    if (existing) {
      throw new AppException(
        409,
        'CHECKIN_ALREADY_EXISTS',
        'Check-in hari ini sudah dilakukan. Gunakan PATCH untuk koreksi.',
      );
    }

    const hasComplaint = dto.has_complaint ?? (dto.symptoms?.length ?? 0) > 0;
    const rawSymptoms = hasComplaint ? (dto.symptoms ?? []) : [];

    if (hasComplaint && rawSymptoms.length === 0) {
      throw new AppException(
        422,
        'BUSINESS_RULE_VIOLATION',
        'Wajib melaporkan minimal satu gejala jika ada keluhan.',
      );
    }

    const validatedSymptoms = await this.validateSymptoms(rawSymptoms);
    const overallSeverity = hasComplaint
      ? this.calcOverallSeverity(validatedSymptoms.map((s) => s.severity))
      : null;

    const treatmentDayNumber = Math.max(
      1,
      differenceInDays(today, startOfDay(profile.treatment_start_date!)) + 1,
    );

    const checkin = await this.checkinModel.create({
      patient_id: userId,
      checkin_date: today,
      treatment_day_number: treatmentDayNumber,
      has_taken_medicine: dto.has_taken_medicine,
      taken_at: dto.taken_at ? new Date(dto.taken_at) : null,
      has_complaint: hasComplaint,
      severity: overallSeverity,
      general_note: dto.general_note ?? null,
      skipped_reason: dto.skipped_reason ?? null,
    });

    if (validatedSymptoms.length > 0) {
      await this.nativeCheckinSymptoms().insertMany(
        validatedSymptoms.map((s) => ({
          checkin_id: checkin._id.toString(),
          patient_id: userId,
          symptom_id: s.symptom_id,
          severity: s.severity,
          note: s.note ?? null,
          created_at: new Date(),
        })) as any[],
      );
    }

    return this.buildCheckinResponse(checkin);
  }

  async updateCheckin(
    userId: string,
    checkinId: string,
    dto: UpdateCheckinDto,
  ): Promise<CheckinResponseDto> {
    if (!ObjectId.isValid(checkinId)) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Check-in tidak ditemukan.',
      );
    }

    const checkin = await this.checkinModel
      .where('_id', new ObjectId(checkinId))
      .where('patient_id', userId)
      .first();

    if (!checkin) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Check-in tidak ditemukan.',
      );
    }

    const today = startOfDay(new Date());
    const checkinDate = startOfDay(new Date(checkin.checkin_date));
    if (checkinDate.getTime() !== today.getTime()) {
      throw new AppException(
        422,
        'BUSINESS_RULE_VIOLATION',
        'Koreksi hanya dapat dilakukan pada hari yang sama.',
      );
    }

    const hasComplaint = dto.has_complaint ?? checkin.has_complaint;
    const rawSymptoms = dto.symptoms ?? [];

    if (
      hasComplaint &&
      dto.symptoms !== undefined &&
      rawSymptoms.length === 0
    ) {
      throw new AppException(
        422,
        'BUSINESS_RULE_VIOLATION',
        'Wajib melaporkan minimal satu gejala jika ada keluhan.',
      );
    }

    const validatedSymptoms =
      dto.symptoms !== undefined && hasComplaint
        ? await this.validateSymptoms(
            rawSymptoms as Array<{
              symptom_id: string;
              severity: SeverityLevel;
              note?: string;
            }>,
          )
        : [];

    const overallSeverity = hasComplaint
      ? this.calcOverallSeverity(validatedSymptoms.map((s) => s.severity))
      : null;

    await this.nativeCheckins().updateOne(
      { _id: new ObjectId(checkinId) },
      {
        $set: {
          ...(dto.has_taken_medicine !== undefined && {
            has_taken_medicine: dto.has_taken_medicine,
          }),
          ...(dto.taken_at !== undefined && {
            taken_at: dto.taken_at ? new Date(dto.taken_at) : null,
          }),
          has_complaint: hasComplaint,
          severity: overallSeverity,
          ...(dto.skipped_reason !== undefined && {
            skipped_reason: dto.skipped_reason,
          }),
          ...(dto.general_note !== undefined && {
            general_note: dto.general_note,
          }),
          updated_at: new Date(),
        },
      },
    );

    if (dto.symptoms !== undefined) {
      await this.nativeCheckinSymptoms().deleteMany({ checkin_id: checkinId });

      if (validatedSymptoms.length > 0) {
        await this.nativeCheckinSymptoms().insertMany(
          validatedSymptoms.map((s) => ({
            checkin_id: checkinId,
            patient_id: userId,
            symptom_id: s.symptom_id,
            severity: s.severity,
            note: s.note ?? null,
            created_at: new Date(),
          })) as any[],
        );
      }
    }

    const updated = await this.checkinModel
      .where('_id', new ObjectId(checkinId))
      .first();

    return this.buildCheckinResponse(updated!);
  }

  async getCheckins(
    userId: string,
    dto: GetCheckinsDto,
  ): Promise<CheckinResponseDto[]> {
    let checkins: IDailyCheckin[];

    if (dto.year && dto.month) {
      const start = new Date(dto.year, dto.month - 1, 1);
      const end = new Date(dto.year, dto.month, 0, 23, 59, 59, 999);

      const raw = await this.nativeCheckins()
        .find({
          patient_id: userId,
          checkin_date: { $gte: start, $lte: end },
        })
        .sort({ checkin_date: -1 })
        .toArray();

      checkins = raw as unknown as IDailyCheckin[];
    } else {
      checkins = await this.checkinModel
        .where('patient_id', userId)
        .orderBy('checkin_date', 'desc')
        .get();
    }

    return Promise.all(checkins.map((c) => this.buildCheckinResponse(c)));
  }

  async getCheckinById(
    userId: string,
    checkinId: string,
  ): Promise<CheckinResponseDto> {
    if (!ObjectId.isValid(checkinId)) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Check-in tidak ditemukan.',
      );
    }

    const checkin = await this.checkinModel
      .where('_id', new ObjectId(checkinId))
      .where('patient_id', userId)
      .first();

    if (!checkin) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Check-in tidak ditemukan.',
      );
    }

    return this.buildCheckinResponse(checkin);
  }

  async seedSymptoms(): Promise<string> {
    const count = await this.symptomModel.count();
    if (count > 0) {
      return `skipped — ${count} symptoms sudah tersedia`;
    }

    await this.nativeSymptoms().insertMany(
      symptomsSeed.map((s) => ({
        ...s,
        created_at: new Date(),
        updated_at: new Date(),
      })) as any[],
    );

    return `inserted ${symptomsSeed.length} symptoms`;
  }

  private async requireProfile(userId: string): Promise<IPatientProfile> {
    const profile = await this.profileModel.where('user_id', userId).first();
    if (!profile) {
      throw new AppException(
        403,
        'PATIENT_PROFILE_NOT_FOUND',
        'Profil pasien tidak ditemukan. Selesaikan onboarding terlebih dahulu.',
      );
    }
    return profile;
  }

  private async validateSymptoms(
    symptoms: Array<{
      symptom_id: string;
      severity: SeverityLevel;
      note?: string;
    }>,
  ): Promise<
    Array<{ symptom_id: string; severity: SeverityLevel; note?: string }>
  > {
    if (symptoms.length === 0) return [];

    for (const s of symptoms) {
      if (!ObjectId.isValid(s.symptom_id)) {
        throw new AppException(
          422,
          'INVALID_SYMPTOM',
          `Symptom ID tidak valid: ${s.symptom_id}`,
        );
      }
    }

    const ids = symptoms.map((s) => new ObjectId(s.symptom_id));
    const found = await this.nativeSymptoms()
      .find({ _id: { $in: ids } })
      .toArray();

    if (found.length !== symptoms.length) {
      throw new AppException(
        422,
        'INVALID_SYMPTOM',
        'Terdapat symptom ID yang tidak ditemukan dalam master data.',
      );
    }

    return symptoms;
  }

  private calcOverallSeverity(severities: SeverityLevel[]): SeverityLevel {
    const order = [
      SeverityLevel.MILD,
      SeverityLevel.MODERATE,
      SeverityLevel.SEVERE,
    ];
    return severities.reduce(
      (max, s) => (order.indexOf(s) > order.indexOf(max) ? s : max),
      SeverityLevel.MILD,
    );
  }

  private async buildCheckinResponse(
    checkin: IDailyCheckin,
  ): Promise<CheckinResponseDto> {
    const checkinId = checkin._id.toString();

    const checkinSymptoms = await this.checkinSymptomModel
      .where('checkin_id', checkinId)
      .get();

    let symptomNames: Map<string, string> = new Map();
    if (checkinSymptoms.length > 0) {
      const ids = checkinSymptoms.map((cs) => new ObjectId(cs.symptom_id));
      const masterSymptoms = await this.nativeSymptoms()
        .find({ _id: { $in: ids } })
        .toArray();
      symptomNames = new Map(
        masterSymptoms.map((s) => [s._id.toString(), s.name as string]),
      );
    }

    return {
      _id: checkinId,
      patient_id: checkin.patient_id,
      checkin_date: checkin.checkin_date,
      treatment_day_number: checkin.treatment_day_number,
      has_taken_medicine: checkin.has_taken_medicine,
      taken_at: checkin.taken_at ?? null,
      has_complaint: checkin.has_complaint,
      severity: checkin.severity,
      general_note: checkin.general_note ?? null,
      skipped_reason: checkin.skipped_reason ?? null,
      symptoms: checkinSymptoms.map((cs) => ({
        _id: cs._id.toString(),
        symptom_id: cs.symptom_id,
        name: symptomNames.get(cs.symptom_id) ?? '',
        severity: cs.severity,
        note: cs.note ?? null,
      })),
      created_at: checkin.created_at!,
      updated_at: checkin.updated_at!,
    };
  }

  private nativeSymptoms() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<ISymptom>('symptoms');
  }

  private nativeCheckins() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<IDailyCheckin>('daily_checkins');
  }

  private nativeCheckinSymptoms() {
    return Database.getDb(
      this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
      this.configService.getOrThrow<string>('MONGODB_DATABASE'),
    ).collection<ICheckinSymptom>('checkin_symptoms');
  }
}
