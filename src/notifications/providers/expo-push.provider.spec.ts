import { ConfigService } from '@nestjs/config';
import { ExpoPushProvider } from './expo-push.provider';

describe('ExpoPushProvider', () => {
  it('skips Expo push when disabled', async () => {
    const provider = new ExpoPushProvider({
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'EXPO_PUSH_ENABLED' ? false : fallback,
      ),
    } as unknown as ConfigService);

    await expect(
      provider.send({
        tokens: ['ExponentPushToken[test]'],
        title: 'Obat',
        body: 'Waktunya minum obat',
      }),
    ).resolves.toEqual({
      status: 'skipped',
      tickets: [],
      invalidTokens: [],
      reason: 'EXPO_PUSH_DISABLED',
    });
  });
});
