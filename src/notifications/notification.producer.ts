import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { addDays, addHours, startOfDay, subMinutes } from 'date-fns';
import { Job, Queue } from 'bullmq';
import {
  ExpoReceiptJobData,
  MedicineReminderJobData,
  MedicineReminderKind,
  MedicineSkipEvaluationJobData,
  NotificationJobData,
  NotificationJobName,
  NOTIFICATIONS_QUEUE,
  SendNotificationJobData,
  TravelReminderJobData,
} from './notification.queue';

export interface TravelReminderPlanInput {
  id: string;
  patient_id: string;
  patient_profile_id: string;
  destination: string;
  departure_date: Date;
}

@Injectable()
export class NotificationProducer {
  constructor(
    @InjectQueue(NOTIFICATIONS_QUEUE)
    private readonly queue: Queue<NotificationJobData>,
  ) {}

  async enqueueSend(notificationId: string): Promise<string> {
    const data: SendNotificationJobData = { notificationId };
    const job = await this.queue.add(
      NotificationJobName.SEND_NOTIFICATION,
      data,
      {
        jobId: `notification:${notificationId}:send`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 86400 },
        removeOnFail: true,
      },
    );
    return String(job.id);
  }

  async scheduleDailyMedicineReminders(
    patientId: string,
    patientProfileId: string,
    medicineTime: string,
    now = new Date(),
  ): Promise<string[]> {
    const jobIds = await Promise.all([
      this.scheduleNextMedicineReminder(
        patientId,
        patientProfileId,
        medicineTime,
        'BEFORE',
        now,
      ),
      this.scheduleNextMedicineReminder(
        patientId,
        patientProfileId,
        medicineTime,
        'TIME',
        now,
      ),
      this.scheduleNextMedicineSkipEvaluation(
        patientId,
        patientProfileId,
        medicineTime,
        now,
      ),
    ]);
    return jobIds.filter((id): id is string => id !== null);
  }

  async scheduleMedicineReminderForDate(
    patientId: string,
    patientProfileId: string,
    medicineTime: string,
    reminderDate: string,
    kind: MedicineReminderKind,
    now = new Date(),
  ): Promise<string | null> {
    const medicineDate = this.parseDateKey(reminderDate);
    const scheduledFor = this.medicineScheduledAt(
      medicineDate,
      medicineTime,
      kind,
    );
    if (scheduledFor <= now) return null;

    const data: MedicineReminderJobData = {
      patientId,
      patientProfileId,
      medicineTime,
      reminderDate,
      scheduledFor: scheduledFor.toISOString(),
      kind,
    };
    const job = await this.queue.add(
      NotificationJobName.MEDICINE_REMINDER,
      data,
      {
        jobId: NotificationProducer.medicineJobId(
          patientProfileId,
          kind,
          reminderDate,
        ),
        delay: this.delayMs(scheduledFor, now),
        attempts: 2,
        removeOnComplete: { age: 86400 },
        removeOnFail: true,
      },
    );
    return String(job.id);
  }

  async scheduleMedicineSkipEvaluationForDate(
    patientId: string,
    patientProfileId: string,
    medicineTime: string,
    reminderDate: string,
    now = new Date(),
  ): Promise<string | null> {
    const medicineDate = this.parseDateKey(reminderDate);
    const scheduledFor = addHours(
      this.medicineScheduledAt(medicineDate, medicineTime, 'TIME'),
      2,
    );
    if (scheduledFor <= now) return null;

    const data: MedicineSkipEvaluationJobData = {
      patientId,
      patientProfileId,
      medicineTime,
      reminderDate,
      scheduledFor: scheduledFor.toISOString(),
    };
    const job = await this.queue.add(
      NotificationJobName.MEDICINE_SKIP_EVALUATION,
      data,
      {
        jobId: NotificationProducer.medicineJobId(
          patientProfileId,
          'SKIP',
          reminderDate,
        ),
        delay: this.delayMs(scheduledFor, now),
        attempts: 2,
        removeOnComplete: { age: 86400 },
        removeOnFail: true,
      },
    );
    return String(job.id);
  }

  async scheduleTravelReminders(
    plan: TravelReminderPlanInput,
    now = new Date(),
  ): Promise<string | null> {
    const departure = startOfDay(plan.departure_date);
    const scheduledFor = addDays(departure, -1);
    scheduledFor.setHours(9, 0, 0, 0);

    if (scheduledFor <= now) return null;

    const data: TravelReminderJobData = {
      travelPlanId: plan.id,
      patientId: plan.patient_id,
      patientProfileId: plan.patient_profile_id,
      destination: plan.destination,
      departureDate: this.dateKey(departure),
      scheduledFor: scheduledFor.toISOString(),
    };
    const job = await this.queue.add(
      NotificationJobName.TRAVEL_REMINDER_H1,
      data,
      {
        jobId: `travel:${plan.patient_profile_id}:${plan.id}:h1`,
        delay: this.delayMs(scheduledFor, now),
        attempts: 2,
        removeOnComplete: { age: 86400 },
        removeOnFail: true,
      },
    );
    return String(job.id);
  }

  async scheduleExpoReceiptCheck(data: ExpoReceiptJobData): Promise<string> {
    const job = await this.queue.add(NotificationJobName.EXPO_RECEIPT, data, {
      jobId: `expo-receipt:${data.notificationId}:${data.tickets
        .map((ticket) => ticket.ticketId)
        .join(',')}`,
      delay: 15 * 60 * 1000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 86400 },
      removeOnFail: true,
    });
    return String(job.id);
  }

  async cancelPendingProfileJobs(patientProfileId: string): Promise<number> {
    const jobs = await this.queue.getJobs(['delayed', 'waiting', 'paused']);
    return this.removeMatchingJobs(jobs, (job) => {
      const data = job.data;
      return (
        typeof data === 'object' &&
        data !== null &&
        'patientProfileId' in data &&
        data.patientProfileId === patientProfileId
      );
    });
  }

  async cancelPendingByMetadata(metadata: {
    patientProfileId?: string;
    travelPlanId?: string;
  }): Promise<number> {
    const jobs = await this.queue.getJobs(['delayed', 'waiting', 'paused']);
    return this.removeMatchingJobs(jobs, (job) => {
      const data = job.data;
      if (typeof data !== 'object' || data === null) return false;
      if (
        metadata.patientProfileId &&
        'patientProfileId' in data &&
        data.patientProfileId === metadata.patientProfileId
      ) {
        return true;
      }
      return (
        metadata.travelPlanId !== undefined &&
        'travelPlanId' in data &&
        data.travelPlanId === metadata.travelPlanId
      );
    });
  }

  static medicineJobId(
    patientProfileId: string,
    kind: MedicineReminderKind | 'SKIP',
    reminderDate: string,
  ): string {
    return `medicine:${patientProfileId}:${kind.toLowerCase()}:${reminderDate}`;
  }

  private async scheduleNextMedicineReminder(
    patientId: string,
    patientProfileId: string,
    medicineTime: string,
    kind: MedicineReminderKind,
    now: Date,
  ): Promise<string | null> {
    const target = this.nextMedicineTarget(medicineTime, kind, now);
    return this.scheduleMedicineReminderForDate(
      patientId,
      patientProfileId,
      medicineTime,
      target.reminderDate,
      kind,
      now,
    );
  }

  private async scheduleNextMedicineSkipEvaluation(
    patientId: string,
    patientProfileId: string,
    medicineTime: string,
    now: Date,
  ): Promise<string | null> {
    const target = this.nextMedicineTarget(medicineTime, 'SKIP', now);
    return this.scheduleMedicineSkipEvaluationForDate(
      patientId,
      patientProfileId,
      medicineTime,
      target.reminderDate,
      now,
    );
  }

  private nextMedicineTarget(
    medicineTime: string,
    kind: MedicineReminderKind | 'SKIP',
    now: Date,
  ): { reminderDate: string; scheduledFor: Date } {
    let medicineDate = startOfDay(now);
    for (let index = 0; index < 370; index += 1) {
      const scheduledFor =
        kind === 'SKIP'
          ? addHours(
              this.medicineScheduledAt(medicineDate, medicineTime, 'TIME'),
              2,
            )
          : this.medicineScheduledAt(medicineDate, medicineTime, kind);
      if (scheduledFor > now) {
        return {
          reminderDate: this.dateKey(medicineDate),
          scheduledFor,
        };
      }
      medicineDate = addDays(medicineDate, 1);
    }
    throw new Error('Unable to calculate medicine reminder schedule.');
  }

  private medicineScheduledAt(
    medicineDate: Date,
    medicineTime: string,
    kind: MedicineReminderKind,
  ): Date {
    const [hours, minutes] = medicineTime.split(':').map(Number);
    const exact = startOfDay(medicineDate);
    exact.setHours(hours, minutes, 0, 0);
    return kind === 'BEFORE' ? subMinutes(exact, 15) : exact;
  }

  private async removeMatchingJobs(
    jobs: Job<NotificationJobData>[],
    matches: (job: Job<NotificationJobData>) => boolean,
  ): Promise<number> {
    let removed = 0;
    for (const job of jobs) {
      if (!matches(job)) continue;
      await job.remove();
      removed += 1;
    }
    return removed;
  }

  private delayMs(target: Date, now: Date): number {
    return Math.max(target.getTime() - now.getTime(), 0);
  }

  private parseDateKey(date: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
