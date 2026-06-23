import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { DailyCheckin } from '../checkins/models/daily-checkin.model';
import { MedicineStock } from '../medicine-stocks/models/medicine-stock.model';
import { PatientPmo } from '../patients/models/patient-pmo.model';
import { PatientProfile } from '../patients/models/patient-profile.model';
import { UsersModule } from '../users/users.module';
import { Notification } from './models/notification.model';
import { NOTIFICATIONS_QUEUE } from './notification.queue';
import { NotificationProducer } from './notification.producer';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsWorker } from './notifications.worker';
import { ExpoPushProvider } from './providers/expo-push.provider';
import { MailProvider } from './providers/mail.provider';

@Module({
  imports: [
    MongoloquentModule.forFeature([
      Notification,
      PatientProfile,
      PatientPmo,
      DailyCheckin,
      MedicineStock,
    ]),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    UsersModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationProducer,
    NotificationsWorker,
    ExpoPushProvider,
    MailProvider,
  ],
  exports: [NotificationsService, NotificationProducer, MongoloquentModule],
})
export class NotificationsModule {}
