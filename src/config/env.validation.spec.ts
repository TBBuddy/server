import { validateEnvironment } from './env.validation';

describe('validateEnvironment', () => {
  it('applies safe defaults to valid configuration', () => {
    const result = validateEnvironment({
      MONGODB_CONNECTION: 'mongodb://127.0.0.1:27017',
      MONGODB_DATABASE: 'tbuddy_test',
      JWT_SECRET: 'a-secret-with-at-least-32-characters',
    });

    expect(result.PORT).toBe(3000);
    expect(result.API_PREFIX).toBe('api/v1');
    // expect(result.JWT_EXPIRES_IN).toBe(3600);
    expect(result.REDIS_ENABLED).toBe(false);
    expect(result.REDIS_PREFIX).toBe('tbbudy');
  });

  it('rejects a Redis prefix outside the allowed ACL namespace', () => {
    expect(() =>
      validateEnvironment({
        MONGODB_CONNECTION: 'mongodb://127.0.0.1:27017',
        MONGODB_DATABASE: 'tbuddy_test',
        JWT_SECRET: 'a-secret-with-at-least-32-characters',
        REDIS_PREFIX: 'bull',
      }),
    ).toThrow('Environment validation failed');
  });

  it('fails fast when required secrets are missing', () => {
    expect(() => validateEnvironment({})).toThrow(
      'Environment validation failed',
    );
  });
});
