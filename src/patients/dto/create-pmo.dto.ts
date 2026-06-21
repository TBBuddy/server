import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePmoDto {
  @ApiProperty({ example: 'Budi Santoso' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'keluarga' })
  @IsOptional()
  @IsString()
  relationship?: string;

  @ApiPropertyOptional({ example: '+6281234567890' })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: '+6281234567890' })
  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @ApiProperty({ example: 'budi@example.com' })
  @IsEmail()
  email!: string;
}