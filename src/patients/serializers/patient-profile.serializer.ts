import { IPatientProfile } from '../models/patient-profile.model';
import { IPatientPmo } from '../models/patient-pmo.model';
import {
  PatientDashboardResponseDto,
  PatientHistorySummaryDto,
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
      status: profile.status,
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
      endedAt: profile.ended_at,
      endedReason: profile.ended_reason,
      pmos: pmos.map((p) => this.toPmo(p)),
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    };
  }

  static toHistorySummary(profile: IPatientProfile): PatientHistorySummaryDto {
    return {
      id: profile._id.toHexString(),
      status: profile.status,
      diagnosisDate: profile.diagnosis_date,
      treatmentStartDate: profile.treatment_start_date,
      estimatedTreatmentEndDate: profile.estimated_treatment_end_date,
      endedAt: profile.ended_at,
      endedReason: profile.ended_reason,
      treatmentDurationMonths: profile.treatment_duration_months,
      totalCheckins: profile.total_checkins,
    };
  }

  static toDashboard(
    profile: IPatientProfile,
    state: {
      stockDoses: number;
      hasCheckedInToday: boolean;
    },
  ): PatientDashboardResponseDto {
    return {
      treatmentDayCount: profile.treatment_day_count,
      treatmentDurationMonths: profile.treatment_duration_months,
      treatmentStartDate: profile.treatment_start_date,
      estimatedTreatmentEndDate: profile.estimated_treatment_end_date,
      medicineTime: profile.medicine_time,
      currentStreak: profile.current_streak,
      longestStreak: profile.longest_streak,
      totalCheckins: profile.total_checkins,
      totalMissedDays: profile.total_missed_days,
      stockDoses: state.stockDoses,
      hasCheckedInToday: state.hasCheckedInToday,
      todayCheckin: null,
      latestAssessment: null,
      stockAlert: null,
      recentBadge: null,
    };
  }
}
