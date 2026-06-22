import { Module } from '@nestjs/common';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { Symptom } from './models/symptom.model';
import { DailyCheckin } from './models/daily-checkin.model';
import { CheckinSymptom } from './models/checkin-symptom.model';
import { PatientProfile } from '../patients/models/patient-profile.model';
import { CheckinsService } from './checkins.service';
import { CheckinsIndexService } from './checkins-index.service';
import { CheckinsController } from './checkins.controller';
import { SymptomsController } from './symptoms.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    MongoloquentModule.forFeature([
      Symptom,
      DailyCheckin,
      CheckinSymptom,
      PatientProfile,
    ]),
    UsersModule,
  ],
  controllers: [CheckinsController, SymptomsController],
  providers: [CheckinsService, CheckinsIndexService],
  exports: [CheckinsService],
})
export class CheckinsModule {}
