import { INotification } from '../models/notification.model';
import { NotificationResponseDto } from '../dto/notification-response.dto';

export class NotificationSerializer {
  static toResponse(notification: INotification): NotificationResponseDto {
    return {
      id: notification._id.toHexString(),
      type: notification.type,
      title: notification.title,
      body: notification.body,
      deepLink: notification.deep_link,
      isRead: notification.read_at !== null,
      readAt: notification.read_at?.toISOString() ?? null,
      patientProfileId: notification.patient_profile_id,
      metadata: this.publicMetadata(notification.metadata),
      createdAt: notification.created_at?.toISOString() ?? '',
    };
  }

  private static publicMetadata(
    metadata: Record<string, unknown>,
  ): Record<string, unknown> {
    const hidden = new Set(['emailHtml', 'emailSubject', 'emailTo']);
    return Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !hidden.has(key)),
    );
  }
}
