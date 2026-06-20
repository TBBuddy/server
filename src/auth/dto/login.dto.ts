import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'aulia@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString({ message: 'Email atau username harus berupa teks.' })
  @IsNotEmpty({ message: 'Email atau username wajib diisi.' })
  @MaxLength(254, { message: 'Email atau username terlalu panjang.' })
  identifier!: string;

  @ApiProperty({ example: 'Aman12345' })
  @IsString({ message: 'Password harus berupa teks.' })
  @IsNotEmpty({ message: 'Password wajib diisi.' })
  password!: string;
}
