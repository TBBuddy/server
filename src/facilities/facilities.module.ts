import { Module } from '@nestjs/common';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { HealthFacility } from './health-facility.model';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesIndexService } from './facilities-index.service';
import { FacilitiesService } from './facilities.service';

@Module({
  imports: [MongoloquentModule.forFeature([HealthFacility])],
  controllers: [FacilitiesController],
  providers: [FacilitiesService, FacilitiesIndexService],
  exports: [FacilitiesService],
})
export class FacilitiesModule {}
