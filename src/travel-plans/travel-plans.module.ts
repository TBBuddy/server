import { Module } from '@nestjs/common';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { MedicineStocksModule } from '../medicine-stocks/medicine-stocks.module';
import { PatientsModule } from '../patients/patients.module';
import { TravelPlan } from './models/travel-plan.model';
import { TravelPlansController } from './travel-plans.controller';
import { TravelPlansService } from './travel-plans.service';

@Module({
  imports: [
    MongoloquentModule.forFeature([TravelPlan]),
    PatientsModule,
    MedicineStocksModule,
  ],
  controllers: [TravelPlansController],
  providers: [TravelPlansService],
  exports: [TravelPlansService],
})
export class TravelPlansModule {}
