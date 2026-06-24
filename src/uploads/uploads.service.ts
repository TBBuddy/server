import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { ObjectId } from 'mongodb';
import { AppException } from '../common/exceptions/app.exception';
import { ImageUploadSignatureResponseDto } from './dto/upload-response.dto';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
const CLOUDINARY_FOLDER = 'tbuddy/forum';

@Injectable()
export class UploadsService {
  constructor(private readonly configService: ConfigService) {}

  createImageUploadSignature(userId: string): ImageUploadSignatureResponseDto {
    const config = this.cloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `${CLOUDINARY_FOLDER}/${userId}/${new ObjectId().toHexString()}`;
    const signature = cloudinary.utils.api_sign_request(
      {
        folder: CLOUDINARY_FOLDER,
        public_id: publicId,
        timestamp,
      },
      config.apiSecret,
    );

    return {
      cloudName: config.cloudName,
      apiKey: config.apiKey,
      timestamp,
      signature,
      folder: CLOUDINARY_FOLDER,
      publicId,
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
      allowedFormats: ALLOWED_IMAGE_FORMATS,
      maxFileSizeBytes: MAX_IMAGE_SIZE_BYTES,
    };
  }

  private cloudinaryConfig(): {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
  } {
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

    return { cloudName, apiKey, apiSecret };
  }
}
