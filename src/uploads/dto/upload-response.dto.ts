import { ApiProperty } from '@nestjs/swagger';

export class ImageUploadSignatureResponseDto {
  @ApiProperty({ example: 'demo' })
  cloudName!: string;

  @ApiProperty({ example: '123456789012345' })
  apiKey!: string;

  @ApiProperty({ example: 1719216000 })
  timestamp!: number;

  @ApiProperty({ example: 'a1b2c3d4e5f6' })
  signature!: string;

  @ApiProperty({ example: 'tbuddy/forum' })
  folder!: string;

  @ApiProperty({ example: 'tbuddy/forum/6853a5edc9e4978ed92bca10' })
  publicId!: string;

  @ApiProperty({
    example: 'https://api.cloudinary.com/v1_1/demo/image/upload',
  })
  uploadUrl!: string;

  @ApiProperty({ type: [String], example: ['jpg', 'jpeg', 'png', 'webp'] })
  allowedFormats!: string[];

  @ApiProperty({ example: 5242880 })
  maxFileSizeBytes!: number;
}

export class ImageUploadSignatureDataResponseDto {
  @ApiProperty({ type: ImageUploadSignatureResponseDto })
  data!: ImageUploadSignatureResponseDto;
}
