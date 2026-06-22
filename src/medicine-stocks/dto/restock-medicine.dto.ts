import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class RestockMedicineDto {
  @ApiProperty({ example: 60, description: 'Jumlah tablet yang ditambahkan' })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantity!: number;
}