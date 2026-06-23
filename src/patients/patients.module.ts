import { Module } from '@nestjs/common';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { User } from '../users/user.model';
import { MedicineStock } from '../medicine-stocks/models/medicine-stock.model';
import { DailyCheckin } from '../checkins/models/daily-checkin.model';
import { PatientProfile } from './models/patient-profile.model';
import { PatientPmo } from './models/patient-pmo.model';
import { PatientsService } from './patients.service';
import { PatientsIndexService } from './patients-index.service';
import { PatientsController } from './patients.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongoloquentModule.forFeature([
      PatientProfile,
      PatientPmo,
      User,
      MedicineStock,
      DailyCheckin,
    ]),
    NotificationsModule,
  ],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsIndexService],
  exports: [PatientsIndexService, MongoloquentModule],
})
export class PatientsModule {}
