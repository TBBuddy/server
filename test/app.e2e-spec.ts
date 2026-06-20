import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Database } from 'mongoloquent';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { UserRole } from '../src/common/enums/user-role.enum';

describe('TBuddy F00/F01 API (e2e)', () => {
  let app: INestApplication;
  let replSet: MongoMemoryReplSet;
  let mongoUri: string;
  const databaseName = 'tbuddy_e2e';
  const suffix = Date.now().toString();
  const patient = {
    email: `patient.${suffix}@example.com`,
    username: `patient_${suffix.slice(-8)}`,
    password: 'Aman12345',
    fullName: 'Patient Test',
    role: UserRole.PATIENT,
  };
  const supporter = {
    email: `supporter.${suffix}@example.com`,
    username: `support_${suffix.slice(-8)}`,
    password: 'Aman12345',
    fullName: 'Supporter Test',
    role: UserRole.SUPPORTER,
  };

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    mongoUri = replSet.getUri();
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_CONNECTION = mongoUri;
    process.env.MONGODB_DATABASE = databaseName;
    process.env.REDIS_ENABLED = 'false';
    process.env.JWT_SECRET =
      'tbuddy-e2e-jwt-secret-with-at-least-32-characters';
    process.env.JWT_EXPIRES_IN = '3600';
    process.env.BCRYPT_ROUNDS = '10';
    process.env.API_PREFIX = 'api/v1';

    const { Test } =
      require('@nestjs/testing') as typeof import('@nestjs/testing');
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');
    const { configureApplication } =
      require('../src/bootstrap') as typeof import('../src/bootstrap');
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApplication(app);
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (mongoUri) {
      await Database.getClient(mongoUri).close();
    }
    await replSet?.stop();
  });

  it('reports API, MongoDB, and Redis dependency status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body).toEqual({
      data: {
        status: 'degraded',
        api: { status: 'up' },
        mongodb: { status: 'up' },
        redis: { status: 'disabled' },
      },
    });
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('publishes Swagger JSON', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/docs-json')
      .expect(200);

    expect(response.body.paths['/api/v1/auth/register']).toBeDefined();
    expect(response.body.paths['/api/v1/users/me']).toBeDefined();
  });

  it('normalizes validation errors and rejects unknown fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: 'invalid',
        username: 'ab',
        password: 'short',
        role: 'ADMIN',
        unexpected: true,
      })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Data yang dikirim tidak valid.',
        path: '/api/v1/auth/register',
        method: 'POST',
        requestId: response.headers['x-request-id'],
      }),
    );
    expect(Array.isArray(response.body.errors)).toBe(true);
    expect(
      response.body.errors.some(
        (error: { field: string }) => error.field === 'unexpected',
      ),
    ).toBe(true);
  });

  it('registers patient and supporter with message-only responses', async () => {
    const patientResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(patient)
      .expect(201);
    expect(patientResponse.body).toEqual({ message: 'Registrasi berhasil.' });

    const supporterResponse = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(supporter)
      .expect(201);
    expect(supporterResponse.body).toEqual({
      message: 'Registrasi berhasil.',
    });
  });

  it('returns feature-specific duplicate identity errors', async () => {
    const duplicateEmail = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...patient, username: `other_${suffix.slice(-8)}` })
      .expect(409);
    expect(duplicateEmail.body.code).toBe('EMAIL_ALREADY_REGISTERED');

    const duplicateUsername = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...patient, email: `other.${suffix}@example.com` })
      .expect(409);
    expect(duplicateUsername.body.code).toBe('USERNAME_ALREADY_TAKEN');
  });

  it('keeps concurrent unique registration as one success and one conflict', async () => {
    const concurrent = {
      ...supporter,
      email: `concurrent.${suffix}@example.com`,
      username: `concurrent_${suffix.slice(-8)}`,
    };
    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(concurrent),
      request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(concurrent),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const conflict = responses.find((response) => response.status === 409);
    expect(['EMAIL_ALREADY_REGISTERED', 'USERNAME_ALREADY_TAKEN']).toContain(
      conflict?.body.code,
    );
  });

  it('logs in with email and username and never exposes password hash', async () => {
    const emailLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: patient.email, password: patient.password })
      .expect(200);

    expect(emailLogin.body.data.accessToken).toEqual(expect.any(String));
    expect(emailLogin.body.data.expiresIn).toBe(3600);
    expect(emailLogin.body.data.user).toEqual(
      expect.objectContaining({
        username: patient.username,
        role: UserRole.PATIENT,
        treatmentStatus: 'ON_TREATMENT',
        isOnboardingCompleted: false,
      }),
    );
    expect(emailLogin.body.data.user.password_hash).toBeUndefined();

    const usernameLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: patient.username, password: patient.password })
      .expect(200);
    expect(usernameLogin.body.data.accessToken).toEqual(expect.any(String));
  });

  it('protects endpoints and distinguishes invalid from expired JWT', async () => {
    const missing = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .expect(401);
    expect(missing.body.code).toBe('UNAUTHORIZED');

    const invalid = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
    expect(invalid.body.code).toBe('UNAUTHORIZED');

    const patientRecord = await Database.getDb(mongoUri, databaseName)
      .collection('users')
      .findOne({ email: patient.email });
    const expiredToken = app.get(JwtService).sign(
      {
        sub: patientRecord?._id.toString(),
        username: patient.username,
        role: UserRole.PATIENT,
      },
      { expiresIn: -1 },
    );
    const expired = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
    expect(expired.body.code).toBe('TOKEN_EXPIRED');
  });

  it('returns current user and performs profile/token/logout mutations', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: patient.email, password: patient.password })
      .expect(200);
    const token = login.body.data.accessToken as string;
    const authorization = `Bearer ${token}`;

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', authorization)
      .expect(200);
    expect(me.body.data.email).toBe(patient.email);

    const update = await request(app.getHttpServer())
      .patch('/api/v1/users/me')
      .set('Authorization', authorization)
      .send({ fullName: 'Patient Updated', phoneNumber: '+6281234567890' })
      .expect(200);
    expect(update.body).toEqual({ message: 'Profil berhasil diperbarui.' });

    const pushToken = 'ExponentPushToken[e2e-device-token]';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const add = await request(app.getHttpServer())
        .post('/api/v1/users/me/push-tokens')
        .set('Authorization', authorization)
        .send({ token: pushToken })
        .expect(201);
      expect(add.body).toEqual({
        message: 'Token notifikasi berhasil disimpan.',
      });
    }

    const storedUser = await Database.getDb(mongoUri, databaseName)
      .collection('users')
      .findOne({ email: patient.email });
    expect(storedUser?.push_notification_tokens).toEqual([pushToken]);

    const remove = await request(app.getHttpServer())
      .delete('/api/v1/users/me/push-tokens')
      .set('Authorization', authorization)
      .send({ token: pushToken })
      .expect(200);
    expect(remove.body).toEqual({
      message: 'Token notifikasi berhasil dihapus.',
    });

    const logout = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', authorization)
      .send({})
      .expect(200);
    expect(logout.body).toEqual({ message: 'Logout berhasil.' });
  });

  it('rejects wrong password and inactive users with the same login error', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: supporter.email, password: 'Wrong12345' })
      .expect(401);
    expect(wrongPassword.body.code).toBe('INVALID_CREDENTIALS');

    await Database.getDb(mongoUri, databaseName)
      .collection('users')
      .updateOne({ email: supporter.email }, { $set: { is_active: false } });

    const inactive = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: supporter.email, password: supporter.password })
      .expect(401);
    expect(inactive.body.code).toBe('INVALID_CREDENTIALS');
  });
});
