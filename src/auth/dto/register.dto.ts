import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../common/enums/user-role.enum';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const trimLowercase = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'aulia@example.com' })
  @Transform(trimLowercase)
  @IsEmail({}, { message: 'Email harus menggunakan format yang valid.' })
  @MaxLength(254, { message: 'Email maksimal 254 karakter.' })
  email!: string;

  @ApiProperty({ example: 'aulia_diaz' })
  @Transform(trimLowercase)
  @IsString({ message: 'Username harus berupa teks.' })
  @Matches(/^[a-z0-9_]{3,30}$/, {
    message:
      'Username harus 3-30 karakter dan hanya berisi huruf kecil, angka, atau underscore.',
  })
  username!: string;

  @ApiProperty({ example: 'Aman12345', minLength: 8 })
  @IsString({ message: 'Password harus berupa teks.' })
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @MaxLength(72, { message: 'Password maksimal 72 karakter.' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'Password harus mengandung huruf dan angka.',
  })
  password!: string;

  @ApiPropertyOptional({ example: 'Aulia Diaz' })
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Nama lengkap harus berupa teks.' })
  @MinLength(2, { message: 'Nama lengkap minimal 2 karakter.' })
  @MaxLength(100, { message: 'Nama lengkap maksimal 100 karakter.' })
  fullName?: string;

  @ApiProperty({
    enum: [UserRole.PATIENT, UserRole.SUPPORTER],
    example: UserRole.PATIENT,
  })
  @IsIn([UserRole.PATIENT, UserRole.SUPPORTER], {
    message: 'Role register hanya boleh PATIENT atau SUPPORTER.',
  })
  role!: UserRole.PATIENT | UserRole.SUPPORTER;
}
