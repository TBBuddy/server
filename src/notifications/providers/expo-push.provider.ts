import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  Expo,
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushTicket,
} from 'expo-server-sdk';

export interface ExpoPushSendInput {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ExpoPushSendResult {
  status: 'sent' | 'skipped' | 'failed';
  tickets: Array<{
    token: string;
    ticket: ExpoPushTicket;
  }>;
  invalidTokens: string[];
  reason?: string;
}

export interface ExpoReceiptResult {
  receipts: Array<{
    ticketId: string;
    receipt: ExpoPushReceipt;
  }>;
  deviceNotRegisteredTicketIds: string[];
}

@Injectable()
export class ExpoPushProvider {
  private readonly logger = new Logger(ExpoPushProvider.name);
  private expoPromise: Promise<Expo> | null = null;

  constructor(private readonly config: ConfigService) {}

  async send(input: ExpoPushSendInput): Promise<ExpoPushSendResult> {
    const enabled = this.config.get<boolean>('EXPO_PUSH_ENABLED', false);
    if (!enabled) {
      return {
        status: 'skipped',
        tickets: [],
        invalidTokens: [],
        reason: 'EXPO_PUSH_DISABLED',
      };
    }

    const ExpoClass = await this.getExpoClass();
    const validTokens = input.tokens.filter((token) =>
      ExpoClass.isExpoPushToken(token),
    );
    const invalidTokens = input.tokens.filter(
      (token) => !ExpoClass.isExpoPushToken(token),
    );

    if (validTokens.length === 0) {
      return {
        status: 'skipped',
        tickets: [],
        invalidTokens,
        reason: 'NO_VALID_EXPO_PUSH_TOKEN',
      };
    }

    const messages: ExpoPushMessage[] = validTokens.map((token) => ({
      to: token,
      title: input.title,
      body: input.body,
      data: input.data,
      sound: 'default',
      priority: 'high',
    }));
    const expo = await this.getExpo();
    const tickets: ExpoPushSendResult['tickets'] = [];

    try {
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        const chunkTickets = await expo.sendPushNotificationsAsync(chunk);
        chunkTickets.forEach((ticket, index) => {
          tickets.push({ token: chunk[index].to as string, ticket });
        });
      }
      return { status: 'sent', tickets, invalidTokens };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'expo_push_send_failed', reason });
      return { status: 'failed', tickets, invalidTokens, reason };
    }
  }

  async getReceipts(ticketIds: string[]): Promise<ExpoReceiptResult> {
    const enabled = this.config.get<boolean>('EXPO_PUSH_ENABLED', false);
    if (!enabled || ticketIds.length === 0) {
      return { receipts: [], deviceNotRegisteredTicketIds: [] };
    }

    const expo = await this.getExpo();
    const receipts: ExpoReceiptResult['receipts'] = [];
    const deviceNotRegisteredTicketIds: string[] = [];
    const chunks = expo.chunkPushNotificationReceiptIds(ticketIds);
    for (const chunk of chunks) {
      const receiptMap = await expo.getPushNotificationReceiptsAsync(chunk);
      for (const [ticketId, receipt] of Object.entries(receiptMap)) {
        receipts.push({ ticketId, receipt });
        if (
          receipt.status === 'error' &&
          receipt.details?.error === 'DeviceNotRegistered'
        ) {
          deviceNotRegisteredTicketIds.push(ticketId);
        }
      }
    }

    return { receipts, deviceNotRegisteredTicketIds };
  }

  private async getExpo(): Promise<Expo> {
    if (!this.expoPromise) {
      this.expoPromise = this.createExpo();
    }
    return this.expoPromise;
  }

  private async createExpo(): Promise<Expo> {
    const { Expo: ExpoClass } = await import('expo-server-sdk');
    const accessToken = this.config.get<string>('EXPO_ACCESS_TOKEN', '');
    return new ExpoClass(accessToken ? { accessToken } : undefined);
  }

  private async getExpoClass(): Promise<typeof import('expo-server-sdk').Expo> {
    const { Expo: ExpoClass } = await import('expo-server-sdk');
    return ExpoClass;
  }
}
