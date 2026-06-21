import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

export class UpdatePatientProfileDto {
  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'medicineTime harus format HH:mm' })
  medicineTime?: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  treatmentStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  previousTreatmentNote?: string;
}
