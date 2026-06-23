import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { AppException } from '../common/exceptions/app.exception';
import {
  ExpoReceiptJobData,
  MedicineReminderJobData,
  MedicineSkipEvaluationJobData,
  NotificationJobData,
  NotificationJobName,
  NOTIFICATIONS_QUEUE,
  SendNotificationJobData,
  TravelReminderJobData,
} from './notification.queue';
import { NotificationsService } from './notifications.service';

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsWorker extends WorkerHost {
  private readonly logger = new Logger(NotificationsWorker.name);

  constructor(private readonly service: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationJobData>, token?: string): Promise<void> {
    void token;
    try {
      switch (job.name) {
        case NotificationJobName.SEND_NOTIFICATION:
          await this.service.sendNotification(
            (job.data as SendNotificationJobData).notificationId,
          );
          break;
        case NotificationJobName.MEDICINE_REMINDER:
          await this.service.handleMedicineReminder(
            job.data as MedicineReminderJobData,
          );
          break;
        case NotificationJobName.MEDICINE_SKIP_EVALUATION:
          await this.service.handleMedicineSkipEvaluation(
            job.data as MedicineSkipEvaluationJobData,
          );
          break;
        case NotificationJobName.TRAVEL_REMINDER_H1:
          await this.service.handleTravelReminder(job.data as TravelReminderJobData);
          break;
        case NotificationJobName.EXPO_RECEIPT:
          await this.service.recordExpoReceipts(job.data as ExpoReceiptJobData);
          break;
        default:
          this.logger.warn({ msg: 'unknown_notification_job', name: job.name });
      }
    } catch (error) {
      this.logger.error({
        msg: 'notification_job_failed',
        jobId: job.id,
        name: job.name,
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof AppException) {
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
