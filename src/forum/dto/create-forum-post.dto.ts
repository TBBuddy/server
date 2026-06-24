import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateForumPostDto {
  @ApiProperty({ example: 'Tips minum obat tepat waktu' })
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  title!: string;

  @ApiProperty({ example: 'Aku biasanya pasang alarm sebelum jam minum obat.' })
  @Transform(trimString)
  @IsString()
  @MaxLength(5000)
  content!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['https://res.cloudinary.com/demo/image/upload/forum/photo.webp'],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsUrl({}, { each: true })
  imageUrls?: string[];
}
