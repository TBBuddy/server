import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  NotEquals,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class AdjustMedicineDto {
  @ApiProperty({
    example: -5,
    description:
      'Perubahan jumlah tablet. Negatif jika mengurangi, positif jika menambah.',
  })
  @IsInt()
  @NotEquals(0, { message: 'changeQuantity tidak boleh 0.' })
  @Type(() => Number)
  changeQuantity!: number;

  @ApiProperty({ example: 'Obat jatuh dan rusak sebanyak 5 tablet' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  note!: string;
}
