import { Injectable } from '@nestjs/common';
import { InjectModel } from '@mongoloquent/nestjs';
import { ConfigService } from '@nestjs/config';
import { ClientSession } from 'mongodb';
import { Database } from 'mongoloquent';
import {
  PatientProfile,
  IPatientProfile,
} from './models/patient-profile.model';
import { PatientPmo, IPatientPmo } from './models/patient-pmo.model';
import { PatientsService } from './patients.service';

@Injectable()
export class PatientsIndexService {
  constructor(
    @InjectModel(PatientProfile)
    private readonly profileModel: typeof PatientProfile,
    @InjectModel(PatientPmo)
    private readonly pmoModel: typeof PatientPmo,
    private readonly patientsService: PatientsService,
    private readonly configService: ConfigService,
  ) {}

  async hasProfile(userId: string): Promise<boolean> {
    const profile = await this.profileModel.where('user_id', userId).first();
    return profile !== null;
  }

  async getPatientProfile(userId: string): Promise<IPatientProfile> {
    return this.patientsService.requireProfile(userId);
  }

  async getMedicineSchedule(userId: string): Promise<{ medicineTime: string }> {
    const profile = await this.patientsService.requireProfile(userId);
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
    const profile = await this.patientsService.requireProfile(userId);
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
      await Database.getDb(
        this.configService.getOrThrow<string>('MONGODB_CONNECTION'),
        this.configService.getOrThrow<string>('MONGODB_DATABASE'),
      )
        .collection<IPatientProfile>('patient_profiles')
        .updateOne(
          { user_id: userId },
          { $set: { ...changes, updated_at: new Date() } },
          { session },
        );
    }
  }

  async setDroppedBefore(userId: string): Promise<void> {
    const profile = await this.profileModel.where('user_id', userId).first();

    // Idempotent: tidak lakukan apa-apa jika sudah true
    if (!profile || profile.has_dropped_before) return;

    await this.profileModel
      .where('user_id', userId)
      .update({ has_dropped_before: true });
  }

  async getPrimaryPmo(userId: string): Promise<IPatientPmo | null> {
    const pmo = await this.pmoModel
      .where('patient_id', userId)
      .where('is_primary', true)
      .where('is_active', true)
      .first();
    return pmo ?? null;
  }
}
