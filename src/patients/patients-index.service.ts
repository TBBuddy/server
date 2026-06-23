import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@mongoloquent/nestjs';
import { ClientSession } from 'mongodb';
import {
  PatientProfile,
  IPatientProfile,
} from './models/patient-profile.model';
import { PatientPmo, IPatientPmo } from './models/patient-pmo.model';
import { PatientsService } from './patients.service';
import { PatientProfileStatus } from '../common/enums/patient-profile-status.enum';

@Injectable()
export class PatientsIndexService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(PatientProfile)
    private readonly profileModel: typeof PatientProfile,
    @InjectModel(PatientPmo)
    private readonly pmoModel: typeof PatientPmo,
    private readonly patientsService: PatientsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.profileModel
      .query()
      .getMongoDBCollection()
      .createIndexes([
        {
          key: { user_id: 1, status: 1 },
          name: 'patient_profiles_user_status',
        },
        {
          key: { user_id: 1 },
          name: 'patient_profiles_one_active_per_user',
          unique: true,
          partialFilterExpression: { status: PatientProfileStatus.ACTIVE },
        },
      ]);
    await this.pmoModel
      .query()
      .getMongoDBCollection()
      .createIndexes([
        {
          key: { patient_profile_id: 1, is_active: 1 },
          name: 'patient_pmos_profile_active',
        },
        {
          key: { patient_id: 1, patient_profile_id: 1 },
          name: 'patient_pmos_patient_profile',
        },
      ]);
  }

  async getPatientState(userId: string): Promise<{
    hasActivePatientProfile: boolean;
    hasPatientHistory: boolean;
  }> {
    const [active, historyCount] = await Promise.all([
      this.profileModel
        .where('user_id', userId)
        .where('status', PatientProfileStatus.ACTIVE)
        .first(),
      this.profileModel.where('user_id', userId).count(),
    ]);
    return {
      hasActivePatientProfile: active !== null,
      hasPatientHistory: historyCount > 0,
    };
  }

  async hasProfile(userId: string): Promise<boolean> {
    return (await this.getPatientState(userId)).hasActivePatientProfile;
  }

  async getPatientProfile(userId: string): Promise<IPatientProfile> {
    return this.patientsService.requireActiveProfile(userId);
  }

  async getMedicineSchedule(userId: string): Promise<{ medicineTime: string }> {
    const profile = await this.patientsService.requireActiveProfile(userId);
    return { medicineTime: profile.medicine_time };
  }

  async incrementPatientStats(
    userId: string,
    stats: Partial<{
      totalCheckins: number;
      totalMissedDays: number;
      currentStreak: number;
      longestStreak: number;
      treatmentDayCount: number;
    }>,
    session?: ClientSession,
  ): Promise<void> {
    const profile = await this.patientsService.requireActiveProfile(userId);
    const changes: Record<string, number> = {};

    if (stats.totalCheckins)
      changes.total_checkins = profile.total_checkins + stats.totalCheckins;
    if (stats.totalMissedDays)
      changes.total_missed_days =
        profile.total_missed_days + stats.totalMissedDays;
    if (stats.currentStreak !== undefined)
      changes.current_streak = stats.currentStreak;
    if (stats.longestStreak !== undefined)
      changes.longest_streak = Math.max(
        profile.longest_streak,
        stats.longestStreak,
      );
    if (stats.treatmentDayCount !== undefined)
      changes.treatment_day_count = stats.treatmentDayCount;

    if (Object.keys(changes).length > 0) {
      await this.profileModel
        .query()
        .getMongoDBCollection()
        .updateOne(
          {
            _id: profile._id,
            user_id: userId,
            status: PatientProfileStatus.ACTIVE,
          },
          { $set: { ...changes, updated_at: new Date() } },
          { session },
        );
    }
  }

  async setDroppedBefore(userId: string): Promise<void> {
    const profile = await this.profileModel
      .where('user_id', userId)
      .where('status', PatientProfileStatus.ACTIVE)
      .first();

    // Idempotent: tidak lakukan apa-apa jika sudah true
    if (!profile || profile.has_dropped_before) return;

    await this.profileModel
      .where('_id', profile._id)
      .update({ has_dropped_before: true });
  }

  async getPrimaryPmo(userId: string): Promise<IPatientPmo | null> {
    const profile = await this.patientsService.requireActiveProfile(userId);
    const pmo = await this.pmoModel
      .where('patient_id', userId)
      .where('patient_profile_id', profile._id.toHexString())
      .where('is_primary', true)
      .where('is_active', true)
      .first();
    return pmo ?? null;
  }
}
