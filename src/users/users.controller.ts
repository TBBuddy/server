import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { PushTokenDto } from './dto/push-token.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: MessageResponseDto })
  async updateOwnProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<MessageResponseDto> {
    await this.usersService.updateOwnProfile(user.id, dto);
    return { message: 'Profil berhasil diperbarui.' };
  }

  @Post('me/push-tokens')
  @HttpCode(HttpStatus.CREATED)
  async addPushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushTokenDto,
  ): Promise<MessageResponseDto> {
    await this.usersService.addPushToken(user.id, dto.token);
    return { message: 'Token notifikasi berhasil disimpan.' };
  }

  @Delete('me/push-tokens')
  @HttpCode(HttpStatus.OK)
  async removePushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushTokenDto,
  ): Promise<MessageResponseDto> {
    await this.usersService.removePushToken(user.id, dto.token);
    return { message: 'Token notifikasi berhasil dihapus.' };
  }
}
