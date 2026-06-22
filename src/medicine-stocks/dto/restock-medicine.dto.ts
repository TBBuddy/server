import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class RestockMedicineDto {
  @ApiProperty({ example: 60, description: 'Jumlah tablet yang ditambahkan' })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantity!: number;

  @ApiPropertyOptional({ example: 'Pengambilan obat dari puskesmas' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(255)
  note?: string;
}
