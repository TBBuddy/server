import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateForumCommentDto {
  @ApiProperty({ example: 'Setuju, alarm sangat membantu.' })
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  content!: string;
}
