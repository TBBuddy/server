import { ConfigService } from '@nestjs/config';
import { MailProvider } from './mail.provider';

describe('MailProvider', () => {
  it('skips Gmail when mail is disabled', async () => {
    const provider = new MailProvider({
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'MAIL_ENABLED' ? false : fallback,
      ),
    } as unknown as ConfigService);

    await expect(
      provider.send({
        to: 'pmo@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      }),
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'MAIL_DISABLED',
    });
  });

  it('skips Gmail when credentials are missing', async () => {
    const provider = new MailProvider({
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'MAIL_ENABLED') return true;
        if (key === 'MAIL_USER' || key === 'MAIL_PASSWORD') return '';
        return fallback;
      }),
    } as unknown as ConfigService);

    await expect(
      provider.send({
        to: 'pmo@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      }),
    ).resolves.toEqual({
      status: 'skipped',
      reason: 'MAIL_CONFIG_MISSING',
    });
  });
});
