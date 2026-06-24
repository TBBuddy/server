import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ImageUploadSignatureDataResponseDto } from './dto/upload-response.dto';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@Roles(UserRole.PATIENT, UserRole.SUPPORTER)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post('images')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Buat signed URL upload gambar forum' })
  @ApiCreatedResponse({ type: ImageUploadSignatureDataResponseDto })
  createImageUploadSignature(
    @CurrentUser() user: AuthenticatedUser,
  ): ImageUploadSignatureDataResponseDto {
    const data = this.service.createImageUploadSignature(user.id);
    return { data };
  }
}
