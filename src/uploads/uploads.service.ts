import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
import { AppException } from '../common/exceptions/app.exception';
import { ImageUploadResponseDto } from './dto/upload-response.dto';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class UploadsService {
  constructor(private readonly configService: ConfigService) {}

  async uploadImage(
    file: Express.Multer.File,
  ): Promise<ImageUploadResponseDto> {
    this.validateFile(file);
    this.configureCloudinary();

    const response = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'tbuddy/forum',
          resource_type: 'image',
          allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        },
        (error, result) => {
          if (error || !result) {
            reject(
              error instanceof Error
                ? error
                : new Error('Cloudinary upload failed.'),
            );
            return;
          }
          resolve(result);
        },
      );
      stream.end(file.buffer);
    });

    return {
      url: response.secure_url,
      publicId: response.public_id,
    };
  }

  private validateFile(
    file: Express.Multer.File | undefined,
  ): asserts file is Express.Multer.File {
    if (!file) {
      throw new AppException(
        400,
        'VALIDATION_ERROR',
        'File gambar wajib dikirim.',
      );
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
      throw new AppException(
        400,
        'VALIDATION_ERROR',
        'File harus berupa JPG, PNG, atau WebP.',
      );
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      throw new AppException(
        400,
        'VALIDATION_ERROR',
        'Ukuran gambar maksimal 5 MB.',
      );
    }
  }

  private configureCloudinary(): void {
    const enabled = this.configService.get<boolean>(
      'CLOUDINARY_ENABLED',
      false,
    );
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!enabled || !cloudName || !apiKey || !apiSecret) {
      throw new AppException(
        503,
        'UPLOAD_PROVIDER_UNAVAILABLE',
        'Upload gambar belum dikonfigurasi.',
      );
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }
}
