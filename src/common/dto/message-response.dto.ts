import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ example: 'Data berhasil disimpan.' })
  message!: string;
}
