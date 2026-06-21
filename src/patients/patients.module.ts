import { Module } from '@nestjs/common';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { PatientProfile } from './models/patient-profile.model';
import { PatientPmo } from './models/patient-pmo.model';
import { PatientsService } from './patients.service';
import { PatientsIndexService } from './patients-index.service';
import { PatientsController } from './patients.controller';

@Module({
  imports: [MongoloquentModule.forFeature([PatientProfile, PatientPmo])],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsIndexService],
  exports: [PatientsIndexService, MongoloquentModule],
})
export class PatientsModule {}