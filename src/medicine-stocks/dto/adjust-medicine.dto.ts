import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, IsNegative, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class AdjustMedicineDto {
  @ApiProperty({
    example: -5,
    description: 'Perubahan jumlah tablet. Negatif jika mengurangi, positif jika menambah.',
  })
  @IsInt()
  @Type(() => Number)
  changeQuantity!: number;

  @ApiProperty({ example: 'Obat jatuh dan rusak sebanyak 5 tablet' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  note!: string;
}