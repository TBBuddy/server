import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { NotificationIdParamDto } from './dto/notification-id-param.dto';
import {
  TestNotificationDto,
  TestNotificationResponseDto,
} from './dto/test-notification.dto';
import {
  NotificationDataResponseDto,
  PaginatedNotificationResponseDto,
  UnreadNotificationCountResponseDto,
} from './dto/notification-response.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Roles(UserRole.PATIENT, UserRole.SUPPORTER)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Daftar notifikasi user' })
  @ApiOkResponse({ type: PaginatedNotificationResponseDto })
  async findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<PaginatedNotificationResponseDto> {
    const { notifications, total } = await this.service.list(user.id, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const totalPages = Math.ceil(total / limit);

    return {
      data: notifications,
      meta: {
        page,
        limit,
        totalItems: total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Jumlah notifikasi belum dibaca' })
  @ApiOkResponse({ type: UnreadNotificationCountResponseDto })
  async unreadCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UnreadNotificationCountResponseDto> {
    return { unreadCount: await this.service.unreadCount(user.id) };
  }

  @Post('test')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Antrekan test notification lokal/dev' })
  @ApiCreatedResponse({ type: TestNotificationResponseDto })
  async testNotification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TestNotificationDto,
  ): Promise<TestNotificationResponseDto> {
    return this.service.scheduleTestNotification(user.id, dto);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tandai satu notifikasi sebagai dibaca' })
  @ApiOkResponse({ type: NotificationDataResponseDto })
  async markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: NotificationIdParamDto,
  ): Promise<NotificationDataResponseDto> {
    return { data: await this.service.markRead(user.id, params.id) };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tandai semua notifikasi sebagai dibaca' })
  @ApiOkResponse({ type: MessageResponseDto })
  async markAllRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponseDto> {
    await this.service.markAllRead(user.id);
    return { message: 'Semua notifikasi berhasil ditandai dibaca.' };
  }
}
