import { Module } from '@nestjs/common';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { MedicineStock } from './models/medicine-stock.model';
import { MedicineStockLog } from './models/medicine-stock-log.model';
import { MedicineStocksService } from './medicine-stocks.service';
import { MedicineStocksIndexService } from './medicine-stocks-index.service';
import { UsersModule } from '../users/users.module';
import { MedicineStocksController } from './medicine-stocks.controller';
import { PatientsModule } from '../patients/patients.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    MongoloquentModule.forFeature([MedicineStock, MedicineStockLog]),
    UsersModule,
    PatientsModule,
    NotificationsModule,
  ],
  controllers: [MedicineStocksController],
  providers: [MedicineStocksService, MedicineStocksIndexService],
  exports: [MedicineStocksIndexService, MongoloquentModule],
})
export class MedicineStocksModule {}
