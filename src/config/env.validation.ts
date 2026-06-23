import Joi from 'joi';

const schema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),
  WEB_ORIGIN: Joi.string().allow('').default('http://localhost:3001'),
  DEFAULT_TIMEZONE: Joi.string().default('Asia/Jakarta'),
  MONGODB_CONNECTION: Joi.string().required(),
  MONGODB_DATABASE: Joi.string().required(),
  REDIS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  REDIS_HOST: Joi.string().default('127.0.0.1'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_USERNAME: Joi.string().allow('').optional(),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_PREFIX: Joi.string().valid('tbbudy').default('tbbudy'),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN: Joi.number().integer().positive().default(3600),
  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(14).default(12),
  ADMIN_EMAIL: Joi.string().email().allow('').optional(),
  ADMIN_USERNAME: Joi.string().allow('').optional(),
  ADMIN_PASSWORD: Joi.string().allow('').optional(),
  ADMIN_FULL_NAME: Joi.string().allow('').default('TBuddy Administrator'),
  MAIL_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  MAIL_USER: Joi.string().allow('').optional(),
  MAIL_PASSWORD: Joi.string().allow('').optional(),
  MAIL_FROM_NAME: Joi.string().allow('').default('TBuddy'),
  EXPO_PUSH_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),
  EXPO_ACCESS_TOKEN: Joi.string().allow('').optional(),
});

export function validateEnvironment(config: Record<string, unknown>) {
  const result = schema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
  }) as Joi.ValidationResult<Record<string, unknown>>;

  if (result.error) {
    throw new Error(`Environment validation failed: ${result.error.message}`);
  }

  return result.value;
}
