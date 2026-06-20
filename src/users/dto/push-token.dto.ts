import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PushTokenDto {
  @ApiProperty({ example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Push token harus berupa teks.' })
  @IsNotEmpty({ message: 'Push token wajib diisi.' })
  @MaxLength(255, { message: 'Push token maksimal 255 karakter.' })
  token!: string;
}
