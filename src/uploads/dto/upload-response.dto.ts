import { ApiProperty } from '@nestjs/swagger';

export class ImageUploadResponseDto {
  @ApiProperty({
    example: 'https://res.cloudinary.com/demo/image/upload/forum/photo.webp',
  })
  url!: string;

  @ApiProperty({ example: 'tb-tbuddy/forum/photo' })
  publicId!: string;
}

export class ImageUploadDataResponseDto {
  @ApiProperty({ type: ImageUploadResponseDto })
  data!: ImageUploadResponseDto;
}
