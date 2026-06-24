import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@mongoloquent/nestjs';
import { addDays, startOfDay } from 'date-fns';
import {
  Collection,
  Filter,
  MongoServerError,
  ObjectId,
  Sort,
  WithId,
} from 'mongodb';
import { AppException } from '../common/exceptions/app.exception';
import {
  AiAssessment,
  IAiAssessment,
} from '../ai-assessments/models/ai-assessment.model';
import { AiRiskLevel } from '../common/enums/ai-risk-level.enum';
import { PatientProfileStatus } from '../common/enums/patient-profile-status.enum';
import {
  DailyCheckin,
  IDailyCheckin,
} from '../checkins/models/daily-checkin.model';
import {
  IMedicineStock,
  MedicineStock,
} from '../medicine-stocks/models/medicine-stock.model';
import { PatientPmo, IPatientPmo } from '../patients/models/patient-pmo.model';
import { ITravelPlan, TravelPlan } from '../travel-plans/models/travel-plan.model';
import {
  IPatientProfile,
  PatientProfile,
} from '../patients/models/patient-profile.model';
import { UsersService } from '../users/users.service';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import {
  TestNotificationDto,
  TestNotificationResponseDto,
} from './dto/test-notification.dto';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { NotificationDeliveryStatus } from './enums/notification-status.enum';
import { NotificationType } from './enums/notification-type.enum';
import {
  INotification,
  Notification,
  NotificationChannelResult,
  NotificationChannelResults,
} from './models/notification.model';
import { NotificationProducer, TravelReminderPlanInput } from './notification.producer';
import {
  ExpoReceiptJobData,
  MedicineReminderJobData,
  MedicineReminderKind,
  MedicineSkipEvaluationJobData,
  TravelReminderJobData,
} from './notification.queue';
import { ExpoPushProvider, ExpoPushSendResult } from './providers/expo-push.provider';
import { MailProvider } from './providers/mail.provider';
import { NotificationSerializer } from './serializers/notification.serializer';

interface PaginatedNotifications {
  notifications: NotificationResponseDto[];
  total: number;
}

interface NotificationEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface CreateNotificationInput {
  recipientUserId: string;
  patientId: string;
  patientProfileId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  deepLink?: string | null;
  metadata?: Record<string, unknown>;
  logicalKey?: string | null;
  scheduledFor?: Date | null;
  push?: boolean;
  email?: NotificationEmailInput | null;
  emailSkipReason?: string | null;
}

interface AiWarningInput {
  assessmentId: string;
  riskLevel: string;
  shouldConsultDoctor: boolean;
  summary: string;
  recommendation?: string | null;
}

@Injectable()
export class NotificationsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification)
    private readonly notificationModel: typeof Notification,
    @InjectModel(PatientProfile)
    private readonly profileModel: typeof PatientProfile,
    @InjectModel(PatientPmo)
    private readonly pmoModel: typeof PatientPmo,
    @InjectModel(DailyCheckin)
    private readonly checkinModel: typeof DailyCheckin,
    @InjectModel(MedicineStock)
    private readonly stockModel: typeof MedicineStock,
    @InjectModel(AiAssessment)
    private readonly assessmentModel: typeof AiAssessment,
    @InjectModel(TravelPlan)
    private readonly travelPlanModel: typeof TravelPlan,
    private readonly usersService: UsersService,
    private readonly producer: NotificationProducer,
    private readonly pushProvider: ExpoPushProvider,
    private readonly mailProvider: MailProvider,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.notifications().createIndexes([
      {
        key: { recipient_user_id: 1, read_at: 1, created_at: -1 },
        name: 'notifications_recipient_read_created',
      },
      {
        key: { patient_profile_id: 1, type: 1, scheduled_for: 1 },
        name: 'notifications_profile_type_schedule',
      },
      {
        key: { logical_key: 1 },
        name: 'notifications_logical_key_unique',
        unique: true,
        partialFilterExpression: { logical_key: { $type: 'string' } },
      },
    ]);
  }

  async list(
    userId: string,
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedNotifications> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Filter<INotification> = { recipient_user_id: userId };
    if (query.unreadOnly) {
      filter.read_at = null;
    }

    const sort: Sort = { created_at: query.sortOrder === 'asc' ? 1 : -1 };
    const [items, total] = await Promise.all([
      this.notifications()
        .find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      this.notifications().countDocuments(filter),
    ]);

    return {
      notifications: items.map((item) => NotificationSerializer.toResponse(item)),
      total,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notifications().countDocuments({
      recipient_user_id: userId,
      read_at: null,
    });
  }

  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<NotificationResponseDto> {
    if (!ObjectId.isValid(notificationId)) {
      throw new AppException(
        400,
        'INVALID_ID',
        'ID notifikasi tidak valid.',
      );
    }

    const notification = await this.notifications().findOneAndUpdate(
      { _id: new ObjectId(notificationId), recipient_user_id: userId },
      { $set: { read_at: new Date(), updated_at: new Date() } },
      { returnDocument: 'after' },
    );
    if (!notification) {
      throw new AppException(
        404,
        'RESOURCE_NOT_FOUND',
        'Notifikasi tidak ditemukan.',
      );
    }

    return NotificationSerializer.toResponse(notification);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifications().updateMany(
      { recipient_user_id: userId, read_at: null },
      { $set: { read_at: new Date(), updated_at: new Date() } },
    );
  }

  async scheduleDailyMedicineReminders(
    patientId: string,
    patientProfileId?: string,
  ): Promise<string[]> {
    const profile = await this.getActiveProfile(patientId, patientProfileId);
    if (!profile) return [];
    return this.producer.scheduleDailyMedicineReminders(
      patientId,
      profile._id.toHexString(),
      profile.medicine_time,
    );
  }

  async rescheduleDailyMedicineReminders(
    patientId: string,
    patientProfileId: string,
  ): Promise<string[]> {
    await this.cancelPendingEpisodeJobs(patientId, patientProfileId);
    return this.scheduleDailyMedicineReminders(patientId, patientProfileId);
  }

  async cancelPendingEpisodeJobs(
    patientId: string,
    patientProfileId: string,
  ): Promise<void> {
    const removed = await this.producer.cancelPendingProfileJobs(patientProfileId);
    await this.notifications().updateMany(
      {
        patient_id: patientId,
        patient_profile_id: patientProfileId,
        status: NotificationDeliveryStatus.PENDING,
      },
      {
        $set: {
          status: NotificationDeliveryStatus.SKIPPED,
          updated_at: new Date(),
          'channels.in_app.status': NotificationDeliveryStatus.SKIPPED,
          'channels.in_app.skipped_at': new Date(),
          'channels.in_app.reason': 'EPISODE_CLOSED',
        },
      },
    );
    this.logger.log({
      msg: 'notification_jobs_cancelled',
      patientId,
      patientProfileId,
      removed,
    });
  }

  async scheduleTravelReminders(
    travelPlan: TravelReminderPlanInput,
  ): Promise<string | null> {
    return this.producer.scheduleTravelReminders(travelPlan);
  }

  async cancelByMetadata(metadata: {
    patientProfileId?: string;
    travelPlanId?: string;
  }): Promise<void> {
    await this.producer.cancelPendingByMetadata(metadata);
  }

  async cancelTravelReminder(travelPlanId: string): Promise<void> {
    await this.producer.cancelTravelReminder(travelPlanId);
  }

  async scheduleTestNotification(
    userId: string,
    dto: TestNotificationDto,
  ): Promise<TestNotificationResponseDto> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Endpoint test notification tidak tersedia di production.');
    }

    const delaySeconds = dto.delaySeconds ?? 5;
    const delayMs = delaySeconds * 1000;
    const profile = await this.getActiveProfile(userId);
    if (!profile) {
      throw new BadRequestException('User tidak memiliki patient profile aktif untuk test notification.');
    }

    const patientProfileId = profile._id.toHexString();
    const now = new Date();
    const scheduledFor = new Date(now.getTime() + delayMs).toISOString();
    const reminderDate = this.dateKey(now);
    let jobId: string | null;

    switch (dto.type) {
      case NotificationType.MEDICINE_REMINDER_BEFORE:
        jobId = await this.producer.enqueueTestMedicineReminder(
          {
            patientId: userId,
            patientProfileId,
            medicineTime: profile.medicine_time,
            reminderDate,
            scheduledFor,
            kind: 'BEFORE',
          },
          delayMs,
        );
        break;
      case NotificationType.MEDICINE_REMINDER_TIME:
        jobId = await this.producer.enqueueTestMedicineReminder(
          {
            patientId: userId,
            patientProfileId,
            medicineTime: profile.medicine_time,
            reminderDate,
            scheduledFor,
            kind: 'TIME',
          },
          delayMs,
        );
        break;
      case NotificationType.MEDICINE_SKIP_ALERT:
        jobId = await this.producer.enqueueTestMedicineSkipEvaluation(
          {
            patientId: userId,
            patientProfileId,
            medicineTime: profile.medicine_time,
            reminderDate,
            scheduledFor,
          },
          delayMs,
        );
        break;
      case NotificationType.STOCK_ALERT: {
        const stock = await this.findTestStock(userId, patientProfileId);
        jobId = await this.sendStockAlert(userId, stock._id.toHexString(), delayMs);
        break;
      }
      case NotificationType.AI_WARNING: {
        const assessment = await this.findTestAiWarningAssessment(
          userId,
          patientProfileId,
        );
        jobId = await this.sendAiWarning(
          userId,
          patientProfileId,
          {
            assessmentId: assessment._id.toHexString(),
            riskLevel: assessment.risk_level,
            shouldConsultDoctor: assessment.should_consult_doctor,
            summary: assessment.summary,
            recommendation: assessment.recommendation,
          },
          delayMs,
        );
        break;
      }
      case NotificationType.TRAVEL_REMINDER_H1: {
        const plan = await this.findTestTravelPlan(userId, patientProfileId);
        jobId = await this.producer.enqueueTestTravelReminder(
          {
            travelPlanId: plan._id.toHexString(),
            patientId: userId,
            patientProfileId,
            destination: plan.destination,
            departureDate: this.dateKey(startOfDay(plan.departure_date)),
            scheduledFor,
          },
          delayMs,
        );
        break;
      }
      default:
        throw new BadRequestException('Type notification test tidak valid.');
    }

    if (!jobId) {
      throw new BadRequestException('Notification test gagal diantrekan karena data tidak valid.');
    }

    return {
      queued: true,
      type: dto.type,
      delaySeconds,
      jobId,
    };
  }

  async sendStockAlert(
    patientId: string,
    stockId: string,
    delayMs = 0,
  ): Promise<string | null> {
    if (!ObjectId.isValid(stockId)) return null;
    const stock = await this.stocks().findOne({
      _id: new ObjectId(stockId),
      patient_id: patientId,
    });
    if (!stock) return null;

    const notification = await this.createNotification({
      recipientUserId: patientId,
      patientId,
      patientProfileId: stock.patient_profile_id,
      type: NotificationType.STOCK_ALERT,
      title: 'Stok obat hampir habis',
      body: `${stock.medicine_name} tersisa ${stock.quantity} ${stock.unit}. Segera rencanakan restock.`,
      deepLink: `/medicine-stocks/${stockId}`,
      metadata: {
        stockId,
        medicineName: stock.medicine_name,
        quantity: stock.quantity,
        thresholdQuantity: stock.threshold_quantity,
      },
      logicalKey: `stock-alert:${stock.patient_profile_id}:${stockId}:${this.dateKey(new Date())}`,
      push: true,
    });
    return this.producer.enqueueSend(notification._id.toHexString(), delayMs);
  }

  async sendAiWarning(
    patientId: string,
    patientProfileId: string,
    input: AiWarningInput,
    delayMs = 0,
  ): Promise<string> {
    const email = await this.buildPmoEmail(patientId, patientProfileId, {
      subject: 'Peringatan risiko pasien TBuddy',
      html: `
        <h2>Peringatan Risiko Pasien</h2>
        <p>Sistem mendeteksi risiko tinggi atau kebutuhan konsultasi dokter.</p>
        <p><strong>Ringkasan:</strong> ${this.escapeHtml(input.summary)}</p>
        ${
          input.recommendation
            ? `<p><strong>Rekomendasi:</strong> ${this.escapeHtml(input.recommendation)}</p>`
            : ''
        }
      `,
      text: `Sistem mendeteksi risiko tinggi atau kebutuhan konsultasi dokter. Ringkasan: ${input.summary}`,
    });

    const notification = await this.createNotification({
      recipientUserId: patientId,
      patientId,
      patientProfileId,
      type: NotificationType.AI_WARNING,
      title: 'Perlu perhatian lanjutan',
      body: 'Hasil pemantauan menunjukkan risiko tinggi atau perlu konsultasi dokter.',
      deepLink: `/ai-assessments/${input.assessmentId}`,
      metadata: {
        assessmentId: input.assessmentId,
        riskLevel: input.riskLevel,
        shouldConsultDoctor: input.shouldConsultDoctor,
        emailTo: email?.to,
        emailSubject: email?.subject,
        emailHtml: email?.html,
      },
      logicalKey: `ai-warning:${input.assessmentId}`,
      push: true,
      email,
      emailSkipReason: email ? null : 'PMO_EMAIL_MISSING',
    });
    return this.producer.enqueueSend(notification._id.toHexString(), delayMs);
  }

  async handleMedicineReminder(job: MedicineReminderJobData): Promise<void> {
    const profile = await this.getActiveProfile(job.patientId, job.patientProfileId);
    if (!profile || profile.medicine_time !== job.medicineTime) return;

    const scheduledFor = new Date(job.scheduledFor);
    const notification = await this.createNotification({
      recipientUserId: job.patientId,
      patientId: job.patientId,
      patientProfileId: job.patientProfileId,
      type:
        job.kind === 'BEFORE'
          ? NotificationType.MEDICINE_REMINDER_BEFORE
          : NotificationType.MEDICINE_REMINDER_TIME,
      title:
        job.kind === 'BEFORE'
          ? 'Siap-siap minum obat'
          : 'Waktunya minum obat',
      body:
        job.kind === 'BEFORE'
          ? '15 menit lagi jadwal minum obat TB Anda.'
          : 'Silakan minum obat TB dan lakukan check-in hari ini.',
      deepLink: '/checkins/today',
      metadata: {
        reminderDate: job.reminderDate,
        medicineTime: job.medicineTime,
        kind: job.kind,
      },
      logicalKey: `medicine:${job.patientProfileId}:${job.kind.toLowerCase()}:${job.reminderDate}`,
      scheduledFor,
      push: true,
    });
    await this.sendNotification(notification._id.toHexString());
    await this.scheduleNextMedicineJob(job, profile.medicine_time);
  }

  async handleMedicineSkipEvaluation(
    job: MedicineSkipEvaluationJobData,
  ): Promise<void> {
    const profile = await this.getActiveProfile(job.patientId, job.patientProfileId);
    if (!profile || profile.medicine_time !== job.medicineTime) return;

    const checkinDate = this.parseDateKey(job.reminderDate);
    const hasTakenMedicine = await this.checkins().findOne({
      patient_id: job.patientId,
      patient_profile_id: job.patientProfileId,
      checkin_date: checkinDate,
      has_taken_medicine: true,
    });
    if (hasTakenMedicine) {
      await this.producer.scheduleMedicineSkipEvaluationForDate(
        job.patientId,
        job.patientProfileId,
        profile.medicine_time,
        this.addDaysKey(job.reminderDate, 1),
      );
      return;
    }

    const email = await this.buildPmoEmail(job.patientId, job.patientProfileId, {
      subject: 'Pasien belum check-in minum obat',
      html: `
        <h2>Check-in Obat Belum Tercatat</h2>
        <p>Pasien belum tercatat minum obat sampai 2 jam setelah jadwal ${this.escapeHtml(
          job.medicineTime,
        )}.</p>
      `,
      text: `Pasien belum tercatat minum obat sampai 2 jam setelah jadwal ${job.medicineTime}.`,
    });

    const notification = await this.createNotification({
      recipientUserId: job.patientId,
      patientId: job.patientId,
      patientProfileId: job.patientProfileId,
      type: NotificationType.MEDICINE_SKIP_ALERT,
      title: 'Check-in obat belum tercatat',
      body: 'Sudah 2 jam dari jadwal minum obat. Jika sudah minum, segera lakukan check-in.',
      deepLink: '/checkins/today',
      metadata: {
        reminderDate: job.reminderDate,
        medicineTime: job.medicineTime,
        emailTo: email?.to,
        emailSubject: email?.subject,
        emailHtml: email?.html,
      },
      logicalKey: `medicine:${job.patientProfileId}:skip:${job.reminderDate}`,
      scheduledFor: new Date(job.scheduledFor),
      push: true,
      email,
      emailSkipReason: email ? null : 'PMO_EMAIL_MISSING',
    });
    await this.sendNotification(notification._id.toHexString());
    await this.producer.scheduleMedicineSkipEvaluationForDate(
      job.patientId,
      job.patientProfileId,
      profile.medicine_time,
      this.addDaysKey(job.reminderDate, 1),
    );
  }

  async handleTravelReminder(job: TravelReminderJobData): Promise<void> {
    const profile = await this.getActiveProfile(job.patientId, job.patientProfileId);
    if (!profile) return;

    const notification = await this.createNotification({
      recipientUserId: job.patientId,
      patientId: job.patientId,
      patientProfileId: job.patientProfileId,
      type: NotificationType.TRAVEL_REMINDER_H1,
      title: 'Persiapan perjalanan besok',
      body: `Besok jadwal keberangkatan ke ${job.destination}. Cek stok obat sebelum berangkat.`,
      deepLink: `/travel-plans/${job.travelPlanId}`,
      metadata: {
        travelPlanId: job.travelPlanId,
        destination: job.destination,
        departureDate: job.departureDate,
      },
      logicalKey: `travel:${job.travelPlanId}:h1`,
      scheduledFor: new Date(job.scheduledFor),
      push: true,
    });
    await this.sendNotification(notification._id.toHexString());
  }

  async sendNotification(notificationId: string): Promise<void> {
    if (!ObjectId.isValid(notificationId)) return;
    const notification = await this.notifications().findOne({
      _id: new ObjectId(notificationId),
    });
    if (!notification) return;

    const now = new Date();
    const channels = this.cloneChannels(notification.channels);
    let changed = false;

    if (channels.in_app.status === NotificationDeliveryStatus.PENDING) {
      channels.in_app = {
        ...channels.in_app,
        status: NotificationDeliveryStatus.SENT,
        sent_at: now,
      };
      changed = true;
    }

    if (channels.push?.status === NotificationDeliveryStatus.PENDING) {
      const result = await this.sendPush(notification);
      channels.push = this.pushChannelFromResult(result, now);
      changed = true;

      const receiptTickets = result.tickets
        .filter((item) => item.ticket.status === 'ok')
        .map((item) => ({
          token: item.token,
          ticketId: item.ticket.status === 'ok' ? item.ticket.id : '',
        }))
        .filter((item) => item.ticketId);
      if (receiptTickets.length > 0) {
        await this.producer.scheduleExpoReceiptCheck({
          notificationId,
          patientId: notification.patient_id,
          tickets: receiptTickets,
        });
      }
    }

    if (channels.email?.status === NotificationDeliveryStatus.PENDING) {
      const email = this.emailInputFromNotification(notification);
      if (!email) {
        channels.email = this.skippedChannel('PMO_EMAIL_MISSING', now);
      } else {
        const result = await this.mailProvider.send(email);
        channels.email =
          result.status === 'sent'
            ? {
                ...channels.email,
                status: NotificationDeliveryStatus.SENT,
                sent_at: now,
                provider_message_id: result.messageId ?? null,
              }
            : result.status === 'skipped'
              ? this.skippedChannel(result.reason ?? 'MAIL_SKIPPED', now)
              : this.failedChannel(result.reason ?? 'MAIL_SEND_FAILED', now);
      }
      changed = true;
    }

    if (!changed) return;
    await this.notifications().updateOne(
      { _id: notification._id },
      {
        $set: {
          channels,
          status: this.resolveStatus(channels),
          updated_at: now,
        },
      },
    );
  }

  async recordExpoReceipts(data: ExpoReceiptJobData): Promise<void> {
    const ticketIds = data.tickets.map((ticket) => ticket.ticketId);
    const result = await this.pushProvider.getReceipts(ticketIds);
    if (result.receipts.length === 0) return;

    const notification = await this.notifications().findOne({
      _id: new ObjectId(data.notificationId),
    });
    if (!notification?.channels.push) return;

    const ticketTokenMap = new Map(
      data.tickets.map((ticket) => [ticket.ticketId, ticket.token]),
    );
    await Promise.all(
      result.deviceNotRegisteredTicketIds.map((ticketId) => {
        const token = ticketTokenMap.get(ticketId);
        return token
          ? this.usersService.removePushToken(data.patientId, token)
          : Promise.resolve();
      }),
    );

    await this.notifications().updateOne(
      { _id: notification._id },
      {
        $set: {
          'channels.push.receipts': result.receipts.map((item) => ({
            ticketId: item.ticketId,
            receipt: item.receipt as unknown as Record<string, unknown>,
          })),
          updated_at: new Date(),
        },
      },
    );
  }

  private async createNotification(
    input: CreateNotificationInput,
  ): Promise<WithId<INotification>> {
    const now = new Date();
    const notification: WithId<INotification> = {
      _id: new ObjectId(),
      recipient_user_id: input.recipientUserId,
      patient_id: input.patientId,
      patient_profile_id: input.patientProfileId,
      type: input.type,
      title: input.title,
      body: input.body,
      deep_link: input.deepLink ?? null,
      metadata: input.metadata ?? {},
      logical_key: input.logicalKey ?? null,
      scheduled_for: input.scheduledFor ?? null,
      status: NotificationDeliveryStatus.PENDING,
      channels: this.initialChannels(input),
      read_at: null,
      created_at: now,
      updated_at: now,
    };

    try {
      await this.notifications().insertOne(notification);
      return notification;
    } catch (error) {
      if (this.isDuplicateKey(error) && input.logicalKey) {
        const existing = await this.notifications().findOne({
          logical_key: input.logicalKey,
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  private initialChannels(
    input: CreateNotificationInput,
  ): NotificationChannelResults {
    const now = new Date();
    const channels: NotificationChannelResults = {
      in_app: { status: NotificationDeliveryStatus.PENDING },
    };
    if (input.push) {
      channels.push = { status: NotificationDeliveryStatus.PENDING };
    }
    if (input.email) {
      channels.email = { status: NotificationDeliveryStatus.PENDING };
    } else if (input.emailSkipReason) {
      channels.email = this.skippedChannel(input.emailSkipReason, now);
    }
    return channels;
  }

  private async sendPush(
    notification: WithId<INotification>,
  ): Promise<ExpoPushSendResult> {
    const tokens = await this.usersService.getPushTokens(
      notification.recipient_user_id,
    );
    return this.pushProvider.send({
      tokens,
      title: notification.title,
      body: notification.body,
      data: {
        notificationId: notification._id.toHexString(),
        type: notification.type,
        deepLink: notification.deep_link,
        ...NotificationSerializer.toResponse(notification).metadata,
      },
    });
  }

  private pushChannelFromResult(
    result: ExpoPushSendResult,
    now: Date,
  ): NotificationChannelResult {
    if (result.status === 'sent') {
      return {
        status: NotificationDeliveryStatus.SENT,
        sent_at: now,
        tickets: result.tickets.map((item) => ({
          token: item.token,
          ticket: item.ticket as unknown as Record<string, unknown>,
        })),
        reason: result.invalidTokens.length
          ? `INVALID_TOKENS:${result.invalidTokens.length}`
          : null,
      };
    }
    if (result.status === 'skipped') {
      return this.skippedChannel(result.reason ?? 'PUSH_SKIPPED', now);
    }
    return this.failedChannel(result.reason ?? 'PUSH_SEND_FAILED', now);
  }

  private emailInputFromNotification(
    notification: INotification,
  ): NotificationEmailInput | null {
    const metadata = notification.metadata;
    const to = metadata.emailTo;
    const subject = metadata.emailSubject;
    const html = metadata.emailHtml;
    if (
      typeof to !== 'string' ||
      typeof subject !== 'string' ||
      typeof html !== 'string'
    ) {
      return null;
    }
    return {
      to,
      subject,
      html,
      text: typeof metadata.emailText === 'string' ? metadata.emailText : undefined,
    };
  }

  private async buildPmoEmail(
    patientId: string,
    patientProfileId: string,
    content: Omit<NotificationEmailInput, 'to'>,
  ): Promise<NotificationEmailInput | null> {
    const pmo = await this.pmos().findOne({
      patient_id: patientId,
      patient_profile_id: patientProfileId,
      is_primary: true,
      is_active: true,
      email: { $type: 'string', $ne: '' },
    });
    if (!pmo?.email) return null;
    return { to: pmo.email, ...content };
  }

  private async getActiveProfile(
    patientId: string,
    patientProfileId?: string,
  ): Promise<WithId<IPatientProfile> | null> {
    const filter: Filter<IPatientProfile> = {
      user_id: patientId,
      status: PatientProfileStatus.ACTIVE,
    };
    if (patientProfileId) {
      if (!ObjectId.isValid(patientProfileId)) return null;
      filter._id = new ObjectId(patientProfileId);
    }
    return this.profiles().findOne(filter);
  }

  private async scheduleNextMedicineJob(
    job: MedicineReminderJobData,
    medicineTime: string,
  ): Promise<void> {
    await this.producer.scheduleMedicineReminderForDate(
      job.patientId,
      job.patientProfileId,
      medicineTime,
      this.addDaysKey(job.reminderDate, 1),
      job.kind,
    );
  }

  private async findTestStock(
    patientId: string,
    patientProfileId: string,
  ): Promise<WithId<IMedicineStock>> {
    const stock = await this.stocks().findOne(
      {
        patient_id: patientId,
        patient_profile_id: patientProfileId,
        is_active: true,
      },
      { sort: { quantity: 1, created_at: 1 } },
    );
    if (!stock) {
      throw new BadRequestException('Tidak ada stok obat aktif milik user untuk test STOCK_ALERT.');
    }
    return stock;
  }

  private async findTestAiWarningAssessment(
    patientId: string,
    patientProfileId: string,
  ): Promise<WithId<IAiAssessment>> {
    const assessment = await this.assessments().findOne(
      {
        patient_id: patientId,
        patient_profile_id: patientProfileId,
        $or: [
          { risk_level: AiRiskLevel.HIGH },
          { should_consult_doctor: true },
        ],
      },
      { sort: { created_at: -1 } },
    );
    if (!assessment) {
      throw new BadRequestException('Tidak ada AI assessment berisiko milik user untuk test AI_WARNING.');
    }
    return assessment;
  }

  private async findTestTravelPlan(
    patientId: string,
    patientProfileId: string,
  ): Promise<WithId<ITravelPlan>> {
    const plan = await this.travelPlans().findOne(
      {
        patient_id: patientId,
        patient_profile_id: patientProfileId,
        cancelled_at: null,
      },
      { sort: { departure_date: 1, created_at: 1 } },
    );
    if (!plan) {
      throw new BadRequestException('Tidak ada travel plan aktif milik user untuk test TRAVEL_REMINDER_H1.');
    }
    return plan;
  }

  private cloneChannels(
    channels: NotificationChannelResults,
  ): NotificationChannelResults {
    return {
      in_app: { ...channels.in_app },
      push: channels.push ? { ...channels.push } : undefined,
      email: channels.email ? { ...channels.email } : undefined,
    };
  }

  private resolveStatus(
    channels: NotificationChannelResults,
  ): NotificationDeliveryStatus {
    const values = Object.values(channels).filter(Boolean);
    if (
      values.some(
        (channel) => channel.status === NotificationDeliveryStatus.PENDING,
      )
    ) {
      return NotificationDeliveryStatus.PENDING;
    }
    if (
      values.some((channel) => channel.status === NotificationDeliveryStatus.SENT)
    ) {
      return NotificationDeliveryStatus.SENT;
    }
    if (
      values.some(
        (channel) => channel.status === NotificationDeliveryStatus.FAILED,
      )
    ) {
      return NotificationDeliveryStatus.FAILED;
    }
    return NotificationDeliveryStatus.SKIPPED;
  }

  private skippedChannel(reason: string, now: Date): NotificationChannelResult {
    return {
      status: NotificationDeliveryStatus.SKIPPED,
      skipped_at: now,
      reason,
    };
  }

  private failedChannel(reason: string, now: Date): NotificationChannelResult {
    return {
      status: NotificationDeliveryStatus.FAILED,
      failed_at: now,
      reason,
    };
  }

  private parseDateKey(date: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private addDaysKey(date: string, amount: number): string {
    return this.dateKey(addDays(this.parseDateKey(date), amount));
  }

  private dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private isDuplicateKey(error: unknown): boolean {
    return error instanceof MongoServerError && error.code === 11000;
  }

  private notifications(): Collection<INotification> {
    return this.notificationModel
      .query()
      .getMongoDBCollection() as unknown as Collection<INotification>;
  }

  private profiles(): Collection<IPatientProfile> {
    return this.profileModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IPatientProfile>;
  }

  private pmos(): Collection<IPatientPmo> {
    return this.pmoModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IPatientPmo>;
  }

  private checkins(): Collection<IDailyCheckin> {
    return this.checkinModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IDailyCheckin>;
  }

  private assessments(): Collection<IAiAssessment> {
    return this.assessmentModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IAiAssessment>;
  }

  private travelPlans(): Collection<ITravelPlan> {
    return this.travelPlanModel
      .query()
      .getMongoDBCollection() as unknown as Collection<ITravelPlan>;
  }

  private stocks(): Collection<IMedicineStock> {
    return this.stockModel
      .query()
      .getMongoDBCollection() as unknown as Collection<IMedicineStock>;
  }
}
