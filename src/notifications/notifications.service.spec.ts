import { ConfigService } from '@nestjs/config';
import { ObjectId } from 'mongodb';
import { PatientProfileStatus } from '../common/enums/patient-profile-status.enum';
import { DailyCheckin } from '../checkins/models/daily-checkin.model';
import { MedicineStock } from '../medicine-stocks/models/medicine-stock.model';
import { PatientPmo } from '../patients/models/patient-pmo.model';
import { PatientProfile } from '../patients/models/patient-profile.model';
import { UsersService } from '../users/users.service';
import { NotificationDeliveryStatus } from './enums/notification-status.enum';
import { NotificationType } from './enums/notification-type.enum';
import { Notification } from './models/notification.model';
import { NotificationProducer } from './notification.producer';
import { ExpoPushProvider } from './providers/expo-push.provider';
import { MailProvider } from './providers/mail.provider';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const patientId = new ObjectId().toHexString();
  const patientProfileId = new ObjectId().toHexString();
  const notificationId = new ObjectId();
  const now = new Date('2026-07-03T07:30:00.000Z');
  const baseNotification = {
    _id: notificationId,
    recipient_user_id: patientId,
    patient_id: patientId,
    patient_profile_id: patientProfileId,
    type: NotificationType.MEDICINE_REMINDER_TIME,
    title: 'Waktunya minum obat',
    body: 'Silakan minum obat TB dan lakukan check-in hari ini.',
    deep_link: '/checkins/today',
    metadata: {},
    logical_key: 'medicine:key',
    scheduled_for: now,
    status: NotificationDeliveryStatus.PENDING,
    channels: {
      in_app: { status: NotificationDeliveryStatus.PENDING },
      push: { status: NotificationDeliveryStatus.PENDING },
    },
    read_at: null,
    created_at: now,
    updated_at: now,
  };
  const cursor = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    toArray: jest.fn(),
  };
  const notifications = {
    createIndexes: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
    insertOne: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  };
  const profiles = {
    findOne: jest.fn(),
  };
  const pmos = {
    findOne: jest.fn(),
  };
  const checkins = {
    findOne: jest.fn(),
  };
  const stocks = {
    findOne: jest.fn(),
  };
  const notificationModel = modelFor(notifications) as typeof Notification;
  const profileModel = modelFor(profiles) as typeof PatientProfile;
  const pmoModel = modelFor(pmos) as typeof PatientPmo;
  const checkinModel = modelFor(checkins) as typeof DailyCheckin;
  const stockModel = modelFor(stocks) as typeof MedicineStock;
  const usersService = {
    getPushTokens: jest.fn(),
    removePushToken: jest.fn(),
  } as unknown as UsersService;
  const producer = {
    enqueueSend: jest.fn(),
    scheduleDailyMedicineReminders: jest.fn(),
    cancelPendingProfileJobs: jest.fn(),
    scheduleTravelReminders: jest.fn(),
    cancelPendingByMetadata: jest.fn(),
    scheduleMedicineReminderForDate: jest.fn(),
    scheduleMedicineSkipEvaluationForDate: jest.fn(),
    scheduleExpoReceiptCheck: jest.fn(),
  } as unknown as NotificationProducer;
  const pushProvider = {
    send: jest.fn(),
    getReceipts: jest.fn(),
  } as unknown as ExpoPushProvider;
  const mailProvider = {
    send: jest.fn(),
  } as unknown as MailProvider;
  const service = new NotificationsService(
    notificationModel,
    profileModel,
    pmoModel,
    checkinModel,
    stockModel,
    usersService,
    producer,
    pushProvider,
    mailProvider,
    {} as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    cursor.sort.mockReturnValue(cursor);
    cursor.skip.mockReturnValue(cursor);
    cursor.limit.mockReturnValue(cursor);
    cursor.toArray.mockResolvedValue([baseNotification]);
    notifications.find.mockReturnValue(cursor);
    notifications.countDocuments.mockResolvedValue(1);
    notifications.findOneAndUpdate.mockResolvedValue({
      ...baseNotification,
      read_at: new Date(),
    });
    notifications.updateMany.mockResolvedValue({ modifiedCount: 1 });
    notifications.insertOne.mockResolvedValue({ insertedId: notificationId });
    notifications.findOne.mockResolvedValue(baseNotification);
    notifications.updateOne.mockResolvedValue({ modifiedCount: 1 });
    profiles.findOne.mockResolvedValue({
      _id: new ObjectId(patientProfileId),
      user_id: patientId,
      status: PatientProfileStatus.ACTIVE,
      medicine_time: '07:30',
    });
    pmos.findOne.mockResolvedValue({
      email: 'pmo@example.com',
      is_primary: true,
      is_active: true,
    });
    checkins.findOne.mockResolvedValue(null);
    stocks.findOne.mockResolvedValue(null);
    (usersService.getPushTokens as jest.Mock).mockResolvedValue([]);
    (usersService.removePushToken as jest.Mock).mockResolvedValue(undefined);
    (producer.enqueueSend as jest.Mock).mockResolvedValue('job-1');
    (producer.scheduleDailyMedicineReminders as jest.Mock).mockResolvedValue([]);
    (producer.cancelPendingProfileJobs as jest.Mock).mockResolvedValue(1);
    (producer.scheduleMedicineReminderForDate as jest.Mock).mockResolvedValue(
      'next-job',
    );
    (
      producer.scheduleMedicineSkipEvaluationForDate as jest.Mock
    ).mockResolvedValue('next-skip');
    (producer.scheduleExpoReceiptCheck as jest.Mock).mockResolvedValue(
      'receipt-job',
    );
    (pushProvider.send as jest.Mock).mockResolvedValue({
      status: 'skipped',
      tickets: [],
      invalidTokens: [],
      reason: 'NO_VALID_EXPO_PUSH_TOKEN',
    });
    (pushProvider.getReceipts as jest.Mock).mockResolvedValue({
      receipts: [],
      deviceNotRegisteredTicketIds: [],
    });
    (mailProvider.send as jest.Mock).mockResolvedValue({
      status: 'sent',
      messageId: 'mail-1',
    });
  });

  it('lists and reads only notifications owned by the current user', async () => {
    const list = await service.list(patientId, { page: 1, limit: 20 });
    const read = await service.markRead(patientId, notificationId.toHexString());

    expect(notifications.find).toHaveBeenCalledWith({
      recipient_user_id: patientId,
    });
    expect(list.total).toBe(1);
    expect(read).toEqual(
      expect.objectContaining({ id: notificationId.toHexString(), isRead: true }),
    );
    expect(notifications.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: notificationId, recipient_user_id: patientId },
      expect.objectContaining({ $set: expect.objectContaining({ read_at: expect.any(Date) }) }),
      { returnDocument: 'after' },
    );
  });

  it('counts unread and marks all unread notifications as read', async () => {
    await expect(service.unreadCount(patientId)).resolves.toBe(1);
    await service.markAllRead(patientId);

    expect(notifications.countDocuments).toHaveBeenCalledWith({
      recipient_user_id: patientId,
      read_at: null,
    });
    expect(notifications.updateMany).toHaveBeenCalledWith(
      { recipient_user_id: patientId, read_at: null },
      expect.objectContaining({ $set: expect.objectContaining({ read_at: expect.any(Date) }) }),
    );
  });

  it('creates AI warning notification and PMO email delivery', async () => {
    await service.sendAiWarning(patientId, patientProfileId, {
      assessmentId: 'assessment-1',
      riskLevel: 'HIGH',
      shouldConsultDoctor: true,
      summary: 'Keluhan berat',
      recommendation: 'Hubungi dokter',
    });

    const [doc] = notifications.insertOne.mock.calls[0] as [Record<string, any>];
    expect(doc).toEqual(
      expect.objectContaining({
        type: NotificationType.AI_WARNING,
        logical_key: 'ai-warning:assessment-1',
        recipient_user_id: patientId,
      }),
    );
    expect(doc.channels.email.status).toBe(NotificationDeliveryStatus.PENDING);
    expect(doc.metadata.emailTo).toBe('pmo@example.com');
    expect(producer.enqueueSend).toHaveBeenCalledWith(doc._id.toHexString());
  });

  it('records PMO email skip when primary PMO email is missing', async () => {
    pmos.findOne.mockResolvedValueOnce(null);

    await service.sendAiWarning(patientId, patientProfileId, {
      assessmentId: 'assessment-2',
      riskLevel: 'HIGH',
      shouldConsultDoctor: false,
      summary: 'Risiko tinggi',
    });

    const [doc] = notifications.insertOne.mock.calls[0] as [Record<string, any>];
    expect(doc.channels.email).toEqual(
      expect.objectContaining({
        status: NotificationDeliveryStatus.SKIPPED,
        reason: 'PMO_EMAIL_MISSING',
      }),
    );
  });

  it('skips medicine +2h notification when patient already checked in', async () => {
    checkins.findOne.mockResolvedValueOnce({ _id: new ObjectId() });

    await service.handleMedicineSkipEvaluation({
      patientId,
      patientProfileId,
      medicineTime: '07:30',
      reminderDate: '2026-07-03',
      scheduledFor: '2026-07-03T02:30:00.000Z',
    });

    expect(notifications.insertOne).not.toHaveBeenCalled();
    expect(producer.scheduleMedicineSkipEvaluationForDate).toHaveBeenCalledWith(
      patientId,
      patientProfileId,
      '07:30',
      '2026-07-04',
    );
  });

  it('records push skip when Expo returns no valid token', async () => {
    await service.sendNotification(notificationId.toHexString());

    const [, update] = notifications.updateOne.mock.calls[0] as [
      unknown,
      { $set: Record<string, any> },
    ];
    expect(update.$set.channels.in_app.status).toBe(
      NotificationDeliveryStatus.SENT,
    );
    expect(update.$set.channels.push.status).toBe(
      NotificationDeliveryStatus.SKIPPED,
    );
    expect(update.$set.channels.push.reason).toBe('NO_VALID_EXPO_PUSH_TOKEN');
  });

  it('does not duplicate delivery when worker receives an already sent notification', async () => {
    notifications.findOne.mockResolvedValueOnce({
      ...baseNotification,
      status: NotificationDeliveryStatus.SENT,
      channels: {
        in_app: { status: NotificationDeliveryStatus.SENT, sent_at: now },
        push: { status: NotificationDeliveryStatus.SKIPPED, skipped_at: now },
      },
    });

    await service.sendNotification(notificationId.toHexString());

    expect(pushProvider.send).not.toHaveBeenCalled();
    expect(mailProvider.send).not.toHaveBeenCalled();
    expect(notifications.updateOne).not.toHaveBeenCalled();
  });

  it('records Gmail send success on the email channel', async () => {
    notifications.findOne.mockResolvedValueOnce({
      ...baseNotification,
      metadata: {
        emailTo: 'pmo@example.com',
        emailSubject: 'Subject',
        emailHtml: '<p>Body</p>',
      },
      channels: {
        in_app: { status: NotificationDeliveryStatus.SENT, sent_at: now },
        email: { status: NotificationDeliveryStatus.PENDING },
      },
    });

    await service.sendNotification(notificationId.toHexString());

    const [, update] = notifications.updateOne.mock.calls[0] as [
      unknown,
      { $set: Record<string, any> },
    ];
    expect(mailProvider.send).toHaveBeenCalledWith({
      to: 'pmo@example.com',
      subject: 'Subject',
      html: '<p>Body</p>',
      text: undefined,
    });
    expect(update.$set.channels.email).toEqual(
      expect.objectContaining({
        status: NotificationDeliveryStatus.SENT,
        provider_message_id: 'mail-1',
      }),
    );
  });

  it('records Gmail send failure on the email channel', async () => {
    (mailProvider.send as jest.Mock).mockResolvedValueOnce({
      status: 'failed',
      reason: 'auth failed',
    });
    notifications.findOne.mockResolvedValueOnce({
      ...baseNotification,
      metadata: {
        emailTo: 'pmo@example.com',
        emailSubject: 'Subject',
        emailHtml: '<p>Body</p>',
      },
      channels: {
        in_app: { status: NotificationDeliveryStatus.SENT, sent_at: now },
        email: { status: NotificationDeliveryStatus.PENDING },
      },
    });

    await service.sendNotification(notificationId.toHexString());

    const [, update] = notifications.updateOne.mock.calls[0] as [
      unknown,
      { $set: Record<string, any> },
    ];
    expect(update.$set.channels.email).toEqual(
      expect.objectContaining({
        status: NotificationDeliveryStatus.FAILED,
        reason: 'auth failed',
      }),
    );
  });

  it('removes DeviceNotRegistered Expo tokens from the user', async () => {
    (pushProvider.getReceipts as jest.Mock).mockResolvedValueOnce({
      receipts: [
        {
          ticketId: 'ticket-1',
          receipt: {
            status: 'error',
            message: 'Device not registered',
            details: { error: 'DeviceNotRegistered' },
          },
        },
      ],
      deviceNotRegisteredTicketIds: ['ticket-1'],
    });

    await service.recordExpoReceipts({
      notificationId: notificationId.toHexString(),
      patientId,
      tickets: [{ token: 'ExponentPushToken[dead]', ticketId: 'ticket-1' }],
    });

    expect(usersService.removePushToken).toHaveBeenCalledWith(
      patientId,
      'ExponentPushToken[dead]',
    );
    expect(notifications.updateOne).toHaveBeenCalledWith(
      { _id: notificationId },
      expect.objectContaining({
        $set: expect.objectContaining({
          'channels.push.receipts': expect.any(Array),
        }),
      }),
    );
  });
});

function modelFor(collection: unknown) {
  return {
    query: jest.fn(() => ({
      getMongoDBCollection: jest.fn(() => collection),
    })),
  };
}
