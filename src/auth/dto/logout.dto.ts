import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LogoutDto {
  @ApiPropertyOptional({
    description: 'Push token device yang dilepas saat logout.',
    example: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Push token harus berupa teks.' })
  @MaxLength(255, { message: 'Push token maksimal 255 karakter.' })
  pushToken?: string;
}
