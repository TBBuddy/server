import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { ImageUploadDataResponseDto } from './dto/upload-response.dto';
import { UploadsService } from './uploads.service';

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

@ApiTags('uploads')
@ApiBearerAuth()
@Roles(UserRole.PATIENT, UserRole.SUPPORTER)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post('images')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Upload gambar forum' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['image'],
    },
  })
  @ApiCreatedResponse({ type: ImageUploadDataResponseDto })
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImageUploadDataResponseDto> {
    const data = await this.service.uploadImage(file);
    return { data };
  }
}
