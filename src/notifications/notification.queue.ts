export const NOTIFICATIONS_QUEUE = 'notifications';

export enum NotificationJobName {
  SEND_NOTIFICATION = 'send-notification',
  MEDICINE_REMINDER = 'medicine-reminder',
  MEDICINE_SKIP_EVALUATION = 'medicine-skip-evaluation',
  TRAVEL_REMINDER_H1 = 'travel-reminder-h1',
  EXPO_RECEIPT = 'expo-receipt',
}

export type MedicineReminderKind = 'BEFORE' | 'TIME';

export interface MedicineReminderJobData {
  patientId: string;
  patientProfileId: string;
  medicineTime: string;
  reminderDate: string;
  scheduledFor: string;
  kind: MedicineReminderKind;
}

export interface MedicineSkipEvaluationJobData {
  patientId: string;
  patientProfileId: string;
  medicineTime: string;
  reminderDate: string;
  scheduledFor: string;
}

export interface SendNotificationJobData {
  notificationId: string;
}

export interface TravelReminderJobData {
  travelPlanId: string;
  patientId: string;
  patientProfileId: string;
  destination: string;
  departureDate: string;
  scheduledFor: string;
}

export interface ExpoReceiptJobData {
  notificationId: string;
  patientId: string;
  tickets: Array<{ token: string; ticketId: string }>;
}

export type NotificationJobData =
  | MedicineReminderJobData
  | MedicineSkipEvaluationJobData
  | SendNotificationJobData
  | TravelReminderJobData
  | ExpoReceiptJobData;
