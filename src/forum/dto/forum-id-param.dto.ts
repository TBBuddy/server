import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class ForumPostIdParamDto {
  @ApiProperty({ example: '6853a5edc9e4978ed92bca10' })
  @IsMongoId()
  id!: string;
}

export class ForumCommentIdParamDto {
  @ApiProperty({ example: '6853a5edc9e4978ed92bca10' })
  @IsMongoId()
  id!: string;
}
