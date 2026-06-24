import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateForumCommentDto {
  @ApiProperty({ example: 'Setuju, alarm sangat membantu.' })
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  content!: string;

  @ApiPropertyOptional({ example: '6853a5edc9e4978ed92bca10' })
  @IsOptional()
  @IsMongoId()
  parentCommentId?: string;
}
