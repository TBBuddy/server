import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';


export class CreatePmoInlineDto{
  @ApiProperty({example: "Budi Santoso"})
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({example: "keluarga"})
  @IsOptional()
  @IsString()
  relationship?: string;


  @ApiPropertyOptional({example: "+6281234567890"})
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: "+6281234567890" })
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiProperty({ example: "budi@example.com" })
  @IsEmail()
  email!: string;

}

export class OnboardingDto{
  @ApiProperty({ example: '2026-01-15' })
  @IsDateString()
  diagnosisDate!: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'medicineTime harus format HH:mm' })
  medicineTime!: string;

  @ApiPropertyOptional({ example: '2026-01-20' })
  @IsOptional()
  @IsDateString()
  treatmentStartDate?: string;


  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  hasDroppedBefore?: boolean;

  @ApiPropertyOptional({ example: 'Sempat berhenti 3 bulan karena efek samping.' })
  @IsOptional()
  @IsString()
  previousTreatmentNote?: string;

  @ApiPropertyOptional({ type: CreatePmoInlineDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePmoInlineDto)
  pmo?: CreatePmoInlineDto;

}