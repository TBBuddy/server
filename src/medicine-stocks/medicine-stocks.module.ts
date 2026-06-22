import { Module } from '@nestjs/common';
import { MongoloquentModule } from '@mongoloquent/nestjs';
import { MedicineStock } from './models/medicine-stock.model';
import { MedicineStockLog } from './models/medicine-stock-log.model';
import { MedicineStocksService } from './medicine-stocks.service';
import { MedicineStocksIndexService } from './medicine-stocks-index.service';
import { UsersModule } from '../users/users.module';
import { MedicineStocksController } from './medicine-stocks.controller';

@Module({
  imports: [
    MongoloquentModule.forFeature([MedicineStock, MedicineStockLog]),
    UsersModule,
  ],
  controllers: [MedicineStocksController],
  providers: [MedicineStocksService, MedicineStocksIndexService],
  exports: [MedicineStocksIndexService, MongoloquentModule],
})
export class MedicineStocksModule {}
