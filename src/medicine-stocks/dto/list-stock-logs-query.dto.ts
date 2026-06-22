import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import type { StockLogReason } from '../models/medicine-stock-log.model';

export class ListStockLogsQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: ['CHECK_IN', 'RESTOCK', 'ADJUSTMENT', 'TRAVEL_PREPARATION'],
    description: 'Filter berdasarkan reason log',
  })
  @IsOptional()
  @IsIn(['CHECK_IN', 'RESTOCK', 'ADJUSTMENT', 'TRAVEL_PREPARATION'])
  reason?: StockLogReason;
}