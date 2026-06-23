import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class TravelPlanIdParamDto {
  @ApiProperty({ example: '6853a5edc9e4978ed92bca10' })
  @IsMongoId()
  id!: string;
}
