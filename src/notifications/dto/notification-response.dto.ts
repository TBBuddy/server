import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../enums/notification-type.enum';

export class NotificationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: NotificationType }) type!: NotificationType;
  @ApiProperty() title!: string;
  @ApiProperty() body!: string;
  @ApiPropertyOptional() deepLink!: string | null;
  @ApiProperty() isRead!: boolean;
  @ApiPropertyOptional() readAt!: string | null;
  @ApiPropertyOptional() patientProfileId!: string | null;
  @ApiPropertyOptional({ type: Object })
  metadata!: Record<string, unknown>;
  @ApiProperty() createdAt!: string;
}

export class NotificationPaginationMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() totalItems!: number;
  @ApiProperty() totalPages!: number;
  @ApiProperty() hasNextPage!: boolean;
  @ApiProperty() hasPreviousPage!: boolean;
}

export class PaginatedNotificationResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  data!: NotificationResponseDto[];

  @ApiProperty({ type: NotificationPaginationMetaDto })
  meta!: NotificationPaginationMetaDto;
}

export class NotificationDataResponseDto {
  @ApiProperty({ type: NotificationResponseDto })
  data!: NotificationResponseDto;
}

export class UnreadNotificationCountResponseDto {
  @ApiProperty({ example: 3 })
  unreadCount!: number;
}
