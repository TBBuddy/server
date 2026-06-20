import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const trimOptionalString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Aulia Diaz' })
  @IsOptional()
  @Transform(trimOptionalString)
  @IsString({ message: 'Nama lengkap harus berupa teks.' })
  @MinLength(2, { message: 'Nama lengkap minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama lengkap maksimal 100 karakter.' })
  fullName?: string;

  @ApiPropertyOptional({
    example: 'https://res.cloudinary.com/tbuddy/avatar.webp',
    nullable: true,
  })
  @IsOptional()
  @Transform(trimOptionalString)
  @IsUrl(
    { require_protocol: true },
    { message: 'Avatar URL harus menggunakan format URL yang valid.' },
  )
  @MaxLength(500, { message: 'Avatar URL maksimal 500 karakter.' })
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '+6281234567890', nullable: true })
  @IsOptional()
  @Transform(trimOptionalString)
  @Matches(/^\+?[0-9]{8,15}$/, {
    message: 'Nomor telepon harus berisi 8 sampai 15 digit.',
  })
  phoneNumber?: string;
}
