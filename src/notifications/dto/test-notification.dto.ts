import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationType } from '../enums/notification-type.enum';

export const TEST_NOTIFICATION_TYPES = [
  NotificationType.MEDICINE_REMINDER_BEFORE,
  NotificationType.MEDICINE_REMINDER_TIME,
  NotificationType.MEDICINE_SKIP_ALERT,
  NotificationType.STOCK_ALERT,
  NotificationType.AI_WARNING,
  NotificationType.TRAVEL_REMINDER_H1,
] as const;

export type TestNotificationType = (typeof TEST_NOTIFICATION_TYPES)[number];

export class TestNotificationDto {
  @ApiProperty({ enum: TEST_NOTIFICATION_TYPES })
  @IsEnum(NotificationType)
  type!: TestNotificationType;

  @ApiPropertyOptional({ minimum: 0, maximum: 60, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  delaySeconds?: number;
}

export class TestNotificationResponseDto {
  @ApiProperty({ example: true })
  queued!: true;

  @ApiProperty({ enum: TEST_NOTIFICATION_TYPES })
  type!: TestNotificationType;

  @ApiProperty({ minimum: 0, maximum: 60, example: 5 })
  delaySeconds!: number;

  @ApiProperty()
  jobId!: string;
}
