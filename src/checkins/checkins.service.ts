import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@mongoloquent/nestjs';
import { differenceInDays, startOfDay } from 'date-fns';
import {
  ClientSession,
  Collection,
  Filter,
  MongoServerError,
  ObjectId,
  Sort,
  WithId,
} from 'mongodb';
import { AppException } from '../common/exceptions/app.exception';
import { SeverityLevel } from '../common/enums/severity-level.enum';
import { MedicineStocksIndexService } from '../medicine-stocks/medicine-stocks-index.service';
import { PatientsIndexService } from '../patients/patients-index.service';
import { IPatientProfile } from '../patients/models/patient-profile.model';
import { DailyCheckinResponseDto } from './dto/checkin-response.dto';
import {
  CreateCheckinDto,
  CreateCheckinSymptomDto,
} from './dto/create-checkin.dto';
import { GetCheckinsDto } from './dto/get-checkins.dto';
import { SymptomResponseDto } from './dto/symptom-response.dto';
import { UpdateCheckinDto } from './dto/update-checkin.dto';
import {
  CheckinSymptom,
  ICheckinSymptom,
} from './models/checkin-symptom.model';
import { DailyCheckin, IDailyCheckin } from './models/daily-checkin.model';
import { ISymptom, Symptom } from './models/symptom.model';
import { symptomsSeed } from './seed/symptoms.seed';
import { runTransaction } from '../database/run-transaction';

interface PaginatedCheckins {
  data: DailyCheckinResponseDto[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

@Injectable()
export class CheckinsService {
  constructor(
    @InjectModel(Symptom) private readonly symptomModel: typeof Symptom,
    @InjectModel(DailyCheckin)
    private readonly checkinModel: typeof DailyCheckin,
    @InjectModel(CheckinSymptom)
    private readonly checkinSymptomModel: typeof CheckinSymptom,
    private readonly patientsIndex: PatientsIndexService,
    private readonly medicineStocksIndex: MedicineStocksIndexService,
    private readonly configService: ConfigService,
  ) {}

  async getSymptoms(): Promise<SymptomResponseDto[]> {
    const symptoms = await this.symptomModel
      .orderBy('category', 'asc')
      .orderBy('name', 'asc')
      .get();
    return symptoms.map((symptom) => ({
      id: symptom._id.toString(),
      name: symptom.name,
      description: symptom.description ?? null,
      category: symptom.category ?? null,
      isCommonTbSymptom: symptom.is_common_tb_symptom,
      isPossibleSideEffect: symptom.is_possible_side_effect,
    }));
  }

  async getTodayCheckin(
    userId: string,
  ): Promise<DailyCheckinResponseDto | null> {
    const profile = await this.patientsIndex.getPatientProfile(userId);
    const checkin = await this.checkins().findOne({
      patient_id: userId,
      patient_profile_id: profile._id.toHexString(),
      checkin_date: startOfDay(new Date()),
    });
    return checkin ? this.buildCheckinResponse(checkin) : null;
  }

  async createCheckin(
    userId: string,
    dto: CreateCheckinDto,
    // idempotencyKey: string,
  ): Promise<void> {
    // this.validateIdempotencyKey(idempotencyKey);
    const profile = await this.patientsIndex.getPatientProfile(userId);
    const normalized = await this.normalizeInput(dto);
    const today = startOfDay(new Date());
    const checkinId = new ObjectId();
    const patientProfileId = profile._id.toHexString();

    const existing = await this.checkins().findOne({
      patient_id: userId,
      patient_profile_id: patientProfileId,
      checkin_date: today,
    });
    if (existing) {
      await this.assertSameCreate(existing, normalized);
      return;
    }

    try {
      const stockAlerts = await this.transaction(async (session) => {
        const now = new Date();
        await this.checkins().insertOne(
          {
            _id: checkinId,
            patient_id: userId,
            patient_profile_id: patientProfileId,
            checkin_date: today,
            treatment_day_number: this.treatmentDay(profile, today),
            has_taken_medicine: normalized.hasTakenMedicine,
            taken_at: normalized.takenAt,
            has_complaint: normalized.hasComplaint,
            severity: normalized.severity,
            general_note: normalized.generalNote,
            skipped_reason: normalized.skippedReason,
            created_at: now,
            updated_at: now,
          },
          { session },
        );
        await this.replaceSymptoms(
          checkinId.toHexString(),
          userId,
          patientProfileId,
          normalized.symptoms,
          session,
        );

        const alerts = normalized.hasTakenMedicine
          ? await this.medicineStocksIndex.consumeDailyDose(
              userId,
              patientProfileId,
              checkinId.toHexString(),
              session,
            )
          : [];
        await this.patientsIndex.incrementPatientStats(
          userId,
          {
            totalCheckins: 1,
            totalMissedDays: normalized.hasTakenMedicine ? 0 : 1,
            treatmentDayCount: this.treatmentDay(profile, today),
          },
          session,
        );
        return alerts;
      });

      await Promise.all(
        stockAlerts.map((stockId) =>
          this.medicineStocksIndex.fireStockAlert(userId, stockId),
        ),
      );
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const concurrent = await this.checkins().findOne({
          patient_id: userId,
          patient_profile_id: patientProfileId,
          checkin_date: today,
        });
        if (concurrent) {
          await this.assertSameCreate(concurrent, normalized);
          return;
        }
      }
      throw error;
    }
  }

  async updateCheckin(
    userId: string,
    checkinId: string,
    dto: UpdateCheckinDto,
  ): Promise<void> {
    const profile = await this.patientsIndex.getPatientProfile(userId);
    const patientProfileId = profile._id.toHexString();
    const objectId = new ObjectId(checkinId);
    const existing = await this.requireOwnedCheckin(
      userId,
      patientProfileId,
      objectId,
    );
    if (
      startOfDay(existing.checkin_date).getTime() !==
      startOfDay(new Date()).getTime()
    ) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Koreksi hanya dapat dilakukan pada hari yang sama.',
      );
    }
    if (existing.has_taken_medicine && dto.hasTakenMedicine === false) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Status obat yang sudah dikonsumsi tidak dapat dibatalkan.',
      );
    }

    const currentSymptoms = await this.getStoredSymptoms(checkinId);
    const resultingTaken = dto.hasTakenMedicine ?? existing.has_taken_medicine;
    const normalized = await this.normalizeInput({
      hasTakenMedicine: resultingTaken,
      hasComplaint: dto.hasComplaint ?? existing.has_complaint,
      takenAt:
        dto.takenAt ??
        (existing.taken_at ? existing.taken_at.toISOString() : undefined),
      skippedReason: resultingTaken
        ? dto.skippedReason
        : (dto.skippedReason ?? existing.skipped_reason ?? undefined),
      generalNote: dto.generalNote ?? existing.general_note ?? undefined,
      symptoms:
        dto.symptoms ??
        currentSymptoms.map((item) => ({
          symptomId: item.symptom_id,
          severity: item.severity,
          note: item.note ?? undefined,
        })),
    });

    const stockAlerts = await this.transaction(async (session) => {
      await this.checkins().updateOne(
        {
          _id: objectId,
          patient_id: userId,
          patient_profile_id: patientProfileId,
        },
        {
          $set: {
            has_taken_medicine: normalized.hasTakenMedicine,
            taken_at: normalized.takenAt,
            has_complaint: normalized.hasComplaint,
            severity: normalized.severity,
            general_note: normalized.generalNote,
            skipped_reason: normalized.skippedReason,
            updated_at: new Date(),
          },
        },
        { session },
      );
      await this.replaceSymptoms(
        checkinId,
        userId,
        patientProfileId,
        normalized.symptoms,
        session,
      );
      if (!existing.has_taken_medicine && normalized.hasTakenMedicine) {
        const alerts = await this.medicineStocksIndex.consumeDailyDose(
          userId,
          patientProfileId,
          checkinId,
          session,
        );
        await this.patientsIndex.incrementPatientStats(
          userId,
          { totalMissedDays: -1 },
          session,
        );
        return alerts;
      }
      return [];
    });

    await Promise.all(
      stockAlerts.map((stockId) =>
        this.medicineStocksIndex.fireStockAlert(userId, stockId),
      ),
    );
  }

  async getCheckins(
    userId: string,
    dto: GetCheckinsDto,
  ): Promise<PaginatedCheckins> {
    const profile = await this.patientsIndex.getPatientProfile(userId);
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const filter: Filter<IDailyCheckin> = {
      patient_id: userId,
      patient_profile_id: profile._id.toHexString(),
    };
    if ((dto.year === undefined) !== (dto.month === undefined)) {
      throw new AppException(
        400,
        'INVALID_QUERY',
        'Parameter year dan month harus dikirim bersama.',
      );
    }
    if (dto.year && dto.month) {
      filter.checkin_date = {
        $gte: new Date(dto.year, dto.month - 1, 1),
        $lt: new Date(dto.year, dto.month, 1),
      };
    }
    const sort: Sort = { checkin_date: dto.sortOrder === 'asc' ? 1 : -1 };
    const [items, totalItems] = await Promise.all([
      this.checkins()
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.checkins().countDocuments(filter),
    ]);
    const totalPages = Math.ceil(totalItems / limit);
    return {
      data: await Promise.all(
        items.map((item) => this.buildCheckinResponse(item)),
      ),
      meta: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async getCheckinById(
    userId: string,
    checkinId: string,
  ): Promise<DailyCheckinResponseDto> {
    const profile = await this.patientsIndex.getPatientProfile(userId);
    return this.buildCheckinResponse(
      await this.requireOwnedCheckin(
        userId,
        profile._id.toHexString(),
        new ObjectId(checkinId),
      ),
    );
  }

  async seedSymptoms(): Promise<{
    insertedCount: number;
    existingCount: number;
  }> {
    const now = new Date();
    const result = await this.symptoms().bulkWrite(
      symptomsSeed.map((symptom) => ({
        updateOne: {
          filter: { name: symptom.name },
          update: {
            $setOnInsert: {
              _id: new ObjectId(),
              ...symptom,
              created_at: now,
              updated_at: now,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    return {
      insertedCount: result.upsertedCount,
      existingCount: symptomsSeed.length - result.upsertedCount,
    };
  }

  private async normalizeInput(dto: CreateCheckinDto) {
    const hasComplaint = dto.hasComplaint ?? (dto.symptoms?.length ?? 0) > 0;
    const symptoms = hasComplaint ? (dto.symptoms ?? []) : [];
    if (hasComplaint && symptoms.length === 0) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Minimal satu gejala wajib dipilih saat ada keluhan.',
      );
    }
    if (!dto.hasTakenMedicine && !dto.skippedReason) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Alasan melewatkan obat wajib diisi.',
      );
    }
    if (dto.hasTakenMedicine && dto.skippedReason) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Alasan melewatkan obat tidak boleh diisi saat obat diminum.',
      );
    }
    if (!dto.hasTakenMedicine && dto.takenAt) {
      throw new AppException(
        400,
        'BUSINESS_RULE_VIOLATION',
        'Waktu minum obat tidak boleh diisi saat obat tidak diminum.',
      );
    }
    await this.validateSymptoms(symptoms);
    return {
      hasTakenMedicine: dto.hasTakenMedicine,
      takenAt: dto.takenAt ? new Date(dto.takenAt) : null,
      hasComplaint,
      severity: hasComplaint ? this.maxSeverity(symptoms) : SeverityLevel.NONE,
      generalNote: dto.generalNote ?? null,
      skippedReason: dto.hasTakenMedicine ? null : (dto.skippedReason ?? null),
      symptoms,
    };
  }

  private async validateSymptoms(
    symptoms: CreateCheckinSymptomDto[],
  ): Promise<void> {
    const uniqueIds = new Set(symptoms.map((item) => item.symptomId));
    if (uniqueIds.size !== symptoms.length) {
      throw new AppException(
        400,
        'INVALID_SYMPTOM',
        'Gejala yang sama tidak boleh dikirim lebih dari sekali.',
      );
    }
    const ids = symptoms.map((item) => new ObjectId(item.symptomId));
    const found = await this.symptoms().countDocuments({ _id: { $in: ids } });
    if (found !== symptoms.length) {
      throw new AppException(
        400,
        'INVALID_SYMPTOM',
        'Terdapat symptom yang tidak valid.',
      );
    }
    if (symptoms.some((item) => item.severity === SeverityLevel.NONE)) {
      throw new AppException(
        400,
        'INVALID_SYMPTOM',
        'Severity symptom tidak boleh NONE.',
      );
    }
  }

  private async assertSameCreate(
    existing: WithId<IDailyCheckin>,
    normalized: Awaited<ReturnType<CheckinsService['normalizeInput']>>,
  ): Promise<void> {
    const stored = await this.getStoredSymptoms(existing._id.toHexString());
    const same =
      existing.has_taken_medicine === normalized.hasTakenMedicine &&
      (existing.taken_at?.toISOString() ?? null) ===
        (normalized.takenAt?.toISOString() ?? null) &&
      existing.has_complaint === normalized.hasComplaint &&
      existing.severity === normalized.severity &&
      (existing.general_note ?? null) === normalized.generalNote &&
      (existing.skipped_reason ?? null) === normalized.skippedReason &&
      this.symptomSignature(stored) ===
        this.symptomSignature(normalized.symptoms);
    if (!same) {
      throw new AppException(
        409,
        'IDEMPOTENCY_CONFLICT',
        'Check-in hari ini sudah ada dengan payload berbeda.',
      );
    }
  }

  private symptomSignature(
    symptoms: Array<{
      symptom_id?: string;
      symptomId?: string;
      severity: SeverityLevel;
      note?: string | null;
    }>,
  ): string {
    return JSON.stringify(
      symptoms
        .map((item) => ({
          id: item.symptomId ?? item.symptom_id,
          severity: item.severity,
          note: item.note ?? null,
        }))
        .sort((a, b) => (a.id ?? '').localeCompare(b.id ?? '')),
    );
  }

  private maxSeverity(symptoms: CreateCheckinSymptomDto[]): SeverityLevel {
    const rank = {
      [SeverityLevel.NONE]: 0,
      [SeverityLevel.MILD]: 1,
      [SeverityLevel.MODERATE]: 2,
      [SeverityLevel.SEVERE]: 3,
    };
    return symptoms.reduce<SeverityLevel>(
      (highest, item) =>
        rank[item.severity] > rank[highest] ? item.severity : highest,
      SeverityLevel.NONE,
    );
  }

  private async replaceSymptoms(
    checkinId: string,
    patientId: string,
    patientProfileId: string,
    symptoms: CreateCheckinSymptomDto[],
    session: ClientSession,
  ): Promise<void> {
    await this.checkinSymptoms().deleteMany(
      { checkin_id: checkinId },
      { session },
    );
    if (symptoms.length === 0) return;
    await this.checkinSymptoms().insertMany(
      symptoms.map((item) => ({
        _id: new ObjectId(),
        checkin_id: checkinId,
        patient_id: patientId,
        patient_profile_id: patientProfileId,
        symptom_id: item.symptomId,
        severity: item.severity,
        note: item.note ?? null,
        created_at: new Date(),
      })),
      { session },
    );
  }

  private async buildCheckinResponse(
    checkin: WithId<IDailyCheckin>,
  ): Promise<DailyCheckinResponseDto> {
    const records = await this.getStoredSymptoms(checkin._id.toHexString());
    const symptomIds = records.map((item) => new ObjectId(item.symptom_id));
    const master = symptomIds.length
      ? await this.symptoms()
          .find({ _id: { $in: symptomIds } })
          .toArray()
      : [];
    const names = new Map(
      master.map((item) => [item._id.toHexString(), item.name]),
    );
    return {
      id: checkin._id.toHexString(),
      checkinDate: checkin.checkin_date.toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Jakarta',
      }),
      treatmentDayNumber: checkin.treatment_day_number,
      hasTakenMedicine: checkin.has_taken_medicine,
      takenAt: checkin.taken_at?.toISOString() ?? null,
      hasComplaint: checkin.has_complaint,
      severity: checkin.severity,
      generalNote: checkin.general_note ?? null,
      skippedReason: checkin.skipped_reason ?? null,
      symptoms: records.map((item) => ({
        id: item._id.toHexString(),
        symptomId: item.symptom_id,
        name: names.get(item.symptom_id) ?? '',
        severity: item.severity,
        note: item.note ?? null,
      })),
      createdAt: checkin.created_at?.toISOString() ?? '',
      updatedAt: checkin.updated_at?.toISOString() ?? '',
    };
  }

  private getStoredSymptoms(checkinId: string) {
    return this.checkinSymptoms()
      .find({ checkin_id: checkinId })
      .sort({ created_at: 1 })
      .toArray();
  }

  private async requireOwnedCheckin(
    userId: string,
    patientProfileId: string,
    checkinId: ObjectId,
  ): Promise<WithId<IDailyCheckin>> {
    const checkin = await this.checkins().findOne({
      _id: checkinId,
      patient_id: userId,
      patient_profile_id: patientProfileId,
    });
    if (!checkin) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Check-in tidak ditemukan.',
      );
    }
    return checkin;
  }

  private treatmentDay(profile: IPatientProfile, today: Date): number {
    return Math.max(
      1,
      differenceInDays(today, startOfDay(profile.treatment_start_date!)) + 1,
    );
  }

  private validateIdempotencyKey(value: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value ?? '',
      )
    ) {
      throw new AppException(
        400,
        'VALIDATION_ERROR',
        'Header Idempotency-Key wajib berupa UUID v4.',
      );
    }
  }

  private transaction<T>(
    callback: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    return runTransaction(this.configService, callback);
  }

  private symptoms(): Collection<ISymptom> {
    return this.symptomModel
      .query()
      .getMongoDBCollection() as unknown as Collection<ISymptom>;
  }

  private checkins(): Collection<IDailyCheckin> {
    return this.checkinModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IDailyCheckin>;
  }

  private checkinSymptoms(): Collection<ICheckinSymptom> {
    return this.checkinSymptomModel
      .query()
      .getMongoDBCollection() as unknown as Collection<ICheckinSymptom>;
  }
}
