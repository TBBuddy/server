import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

export interface MailSendInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailSendResult {
  status: 'sent' | 'skipped' | 'failed';
  messageId?: string;
  reason?: string;
}

@Injectable()
export class MailProvider {
  private readonly logger = new Logger(MailProvider.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  async send(input: MailSendInput): Promise<MailSendResult> {
    const state = this.configurationState();
    if (!state.enabled) {
      return { status: 'skipped', reason: state.reason };
    }

    try {
      const info = await this.getTransporter().sendMail({
        from: `"${state.fromName}" <${state.user}>`,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      });
      return {
        status: 'sent',
        messageId:
          typeof info.messageId === 'string' ? info.messageId : undefined,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn({ msg: 'mail_send_failed', reason });
      return { status: 'failed', reason };
    }
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      const user = this.config.getOrThrow<string>('MAIL_USER');
      const pass = this.config.getOrThrow<string>('MAIL_PASSWORD');
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
    }
    return this.transporter;
  }

  private configurationState(): {
    enabled: boolean;
    reason?: string;
    user?: string;
    fromName?: string;
  } {
    const enabled = this.config.get<boolean>('MAIL_ENABLED', false);
    if (!enabled) {
      return { enabled: false, reason: 'MAIL_DISABLED' };
    }

    const user = this.config.get<string>('MAIL_USER', '');
    const password = this.config.get<string>('MAIL_PASSWORD', '');
    if (!user || !password) {
      return { enabled: false, reason: 'MAIL_CONFIG_MISSING' };
    }

    return {
      enabled: true,
      user,
      fromName: this.config.get<string>('MAIL_FROM_NAME', 'TBuddy'),
    };
  }
}
