import { IPatientProfile } from '../models/patient-profile.model';
import { IPatientPmo } from '../models/patient-pmo.model';
import {
  PatientDashboardResponseDto,
  PatientProfileResponseDto,
  PatientPmoResponseDto,
} from '../dto/patient-response.dto';

export class PatientProfileSerializer {
  static toPmo(pmo: IPatientPmo): PatientPmoResponseDto {
    return {
      id: pmo._id.toHexString(),
      name: pmo.name,
      relationship: pmo.relationship,
      phoneNumber: pmo.phone_number,
      whatsappNumber: pmo.whatsapp_number,
      email: pmo.email,
      isPrimary: pmo.is_primary,
      isActive: pmo.is_active,
      createdAt: pmo.created_at,
    };
  }

  static toProfile(
    profile: IPatientProfile,
    pmos: IPatientPmo[],
  ): PatientProfileResponseDto {
    return {
      id: profile._id.toHexString(),
      userId: profile.user_id,
      diagnosisDate: profile.diagnosis_date,
      medicineTime: profile.medicine_time,
      treatmentStartDate: profile.treatment_start_date,
      estimatedTreatmentEndDate: profile.estimated_treatment_end_date,
      treatmentDayCount: profile.treatment_day_count,
      treatmentDurationMonths: profile.treatment_duration_months,
      hasDroppedBefore: profile.has_dropped_before,
      previousTreatmentNote: profile.previous_treatment_note,
      currentStreak: profile.current_streak,
      longestStreak: profile.longest_streak,
      totalCheckins: profile.total_checkins,
      totalMissedDays: profile.total_missed_days,
      pmos: pmos.map((p) => this.toPmo(p)),
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    };
  }

  static toDashboard(profile: IPatientProfile): PatientDashboardResponseDto {
    return {
      treatmentDayCount: profile.treatment_day_count,
      treatmentDurationMonths: profile.treatment_duration_months,
      estimatedTreatmentEndDate: profile.estimated_treatment_end_date,
      medicineTime: profile.medicine_time,
      currentStreak: profile.current_streak,
      longestStreak: profile.longest_streak,
      totalCheckins: profile.total_checkins,
      totalMissedDays: profile.total_missed_days,
      todayCheckin: null,
      latestAssessment: null,
      stockAlert: null,
      recentBadge: null,
    };
  }
}
