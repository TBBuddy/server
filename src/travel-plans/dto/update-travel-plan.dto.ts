import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class UpdateTravelPlanDto {
  @ApiPropertyOptional({ example: 'Bandung, Jawa Barat' })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  destination?: string;

  @ApiPropertyOptional({ example: '2026-07-03' })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, {
    message: 'departureDate harus format YYYY-MM-DD',
  })
  departureDate?: string;

  @ApiPropertyOptional({ example: '2026-07-07' })
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'returnDate harus format YYYY-MM-DD' })
  returnDate?: string;
}
