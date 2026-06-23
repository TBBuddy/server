import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateTravelPlanDto {
  @ApiProperty({ example: 'Bandung, Jawa Barat' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  destination!: string;

  @ApiProperty({ example: '2026-07-03' })
  @IsString()
  @Matches(DATE_ONLY_REGEX, {
    message: 'departureDate harus format YYYY-MM-DD',
  })
  departureDate!: string;

  @ApiProperty({ example: '2026-07-07' })
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'returnDate harus format YYYY-MM-DD' })
  returnDate!: string;
}
