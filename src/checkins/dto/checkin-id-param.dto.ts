import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class CheckinIdParamDto {
  @ApiProperty()
  @IsMongoId()
  id!: string;
}
