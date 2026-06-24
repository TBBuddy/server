import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DB, Database } from 'mongoloquent';
import { ObjectId } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import request from 'supertest';
import { UserRole } from '../src/common/enums/user-role.enum';
import { FacilitiesService } from '../src/facilities/facilities.service';

describe('TBuddy F00/F01 API (e2e)', () => {
  let app: INestApplication;
  let replSet: MongoMemoryReplSet;
  let mongoUri: string;
  let patientAuthorization: string;
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

  function dateOnlyAfter(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

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
    // process.env.JWT_EXPIRES_IN = '3600';
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
    expect(response.body.paths['/api/v1/facilities']).toBeDefined();
    expect(response.body.paths['/api/v1/facilities/nearby']).toBeDefined();
    expect(response.body.paths['/api/v1/facilities/{id}']).toBeDefined();
    expect(response.body.paths['/api/v1/travel-plans']).toBeDefined();
    expect(response.body.paths['/api/v1/travel-plans/{id}']).toBeDefined();
    expect(
      response.body.paths['/api/v1/travel-plans/{id}/cancel'],
    ).toBeDefined();
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
        treatmentStatus: 'NOT_PATIENT',
        isOnboardingCompleted: false,
        hasActivePatientProfile: false,
        hasPatientHistory: false,
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
    patientAuthorization = authorization;

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

  it('rolls back writes when a MongoDB transaction fails', async () => {
    const collection = Database.getDb(mongoUri, databaseName).collection(
      'transaction_rollback_probe',
    );
    const probeId = new ObjectId();

    await expect(
      DB.connection(mongoUri)
        .database(databaseName)
        .transaction(async (session) => {
          await collection.insertOne({ _id: probeId }, { session });
          throw new Error('rollback-probe');
        }),
    ).rejects.toThrow('rollback-probe');

    await expect(collection.countDocuments({ _id: probeId })).resolves.toBe(0);
  });

  it('supports concurrent onboarding, close, history ownership, and a new episode', async () => {
    const episodeUser = {
      email: `episode.${suffix}@example.com`,
      username: `episode_${suffix.slice(-8)}`,
      password: 'Aman12345',
      fullName: 'Episode Test',
      role: UserRole.SUPPORTER,
    };
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(episodeUser)
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        identifier: episodeUser.username,
        password: episodeUser.password,
      })
      .expect(200);
    const authorization = `Bearer ${login.body.data.accessToken as string}`;
    const onboarding = {
      diagnosisDate: '2026-06-01',
      treatmentStartDate: '2026-06-02',
      medicineTime: '07:30',
      pmo: {
        name: 'PMO Episode',
        email: `pmo.${suffix}@example.com`,
      },
    };

    const onboardingResponses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/patients/me/onboarding')
        .set('Authorization', authorization)
        .send(onboarding),
      request(app.getHttpServer())
        .post('/api/v1/patients/me/onboarding')
        .set('Authorization', authorization)
        .send(onboarding),
    ]);
    expect(
      onboardingResponses.map((response) => response.status).sort(),
    ).toEqual([201, 409]);

    await request(app.getHttpServer())
      .post('/api/v1/medicine-stocks')
      .set('Authorization', authorization)
      .send({
        medicineName: 'OAT Episode',
        medicineType: 'OAT',
        quantity: 18,
        dailyDose: 1,
        thresholdQuantity: 7,
      })
      .expect(201);

    const activeSession = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', authorization)
      .expect(200);
    expect(activeSession.body.data).toEqual(
      expect.objectContaining({
        role: UserRole.PATIENT,
        treatmentStatus: 'ON_TREATMENT',
        hasActivePatientProfile: true,
        hasPatientHistory: true,
      }),
    );

    const firstDashboard = await request(app.getHttpServer())
      .get('/api/v1/patients/me/dashboard')
      .set('Authorization', authorization)
      .expect(200);
    expect(firstDashboard.body.data).toEqual(
      expect.objectContaining({
        treatmentStartDate: expect.any(String),
        stockDoses: 18,
        hasCheckedInToday: false,
      }),
    );

    await request(app.getHttpServer())
      .post('/api/v1/patients/me/profile/close')
      .set('Authorization', authorization)
      .send({ outcome: 'RECOVERED', reason: 'E2E selesai.' })
      .expect(201);

    const closedSession = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', authorization)
      .expect(200);
    expect(closedSession.body.data).toEqual(
      expect.objectContaining({
        role: UserRole.SUPPORTER,
        treatmentStatus: 'RECOVERED',
        hasActivePatientProfile: false,
        hasPatientHistory: true,
      }),
    );

    const firstHistory = await request(app.getHttpServer())
      .get('/api/v1/patients/me/history')
      .set('Authorization', authorization)
      .expect(200);
    expect(firstHistory.body.data).toHaveLength(1);
    const closedProfileId = firstHistory.body.data[0].id as string;

    const otherUser = {
      email: `history-owner.${suffix}@example.com`,
      username: `owner_${suffix.slice(-8)}`,
      password: 'Aman12345',
      fullName: 'History Owner Test',
      role: UserRole.SUPPORTER,
    };
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(otherUser)
      .expect(201);
    const otherLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: otherUser.username, password: otherUser.password })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/patients/me/history/${closedProfileId}`)
      .set(
        'Authorization',
        `Bearer ${otherLogin.body.data.accessToken as string}`,
      )
      .expect(404);

    await request(app.getHttpServer())
      .post('/api/v1/patients/me/onboarding')
      .set('Authorization', authorization)
      .send({
        diagnosisDate: '2026-06-10',
        treatmentStartDate: '2026-06-11',
        medicineTime: '08:00',
      })
      .expect(201);

    const secondDashboard = await request(app.getHttpServer())
      .get('/api/v1/patients/me/dashboard')
      .set('Authorization', authorization)
      .expect(200);
    expect(secondDashboard.body.data).toEqual(
      expect.objectContaining({
        stockDoses: 0,
        hasCheckedInToday: false,
      }),
    );

    const secondHistory = await request(app.getHttpServer())
      .get('/api/v1/patients/me/history')
      .set('Authorization', authorization)
      .expect(200);
    expect(secondHistory.body.data).toHaveLength(2);
    expect(
      secondHistory.body.data.map(
        (profile: { status: string }) => profile.status,
      ),
    ).toEqual(expect.arrayContaining(['ACTIVE', 'RECOVERED']));
  });

  describe('F08 travel mode CRUD lite', () => {
    let authorization: string;
    let planId: string;

    beforeAll(async () => {
      const travelUser = {
        email: `travel.${suffix}@example.com`,
        username: `travel_${suffix.slice(-8)}`,
        password: 'Aman12345',
        fullName: 'Travel Test',
        role: UserRole.SUPPORTER,
      };

      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(travelUser)
        .expect(201);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          identifier: travelUser.username,
          password: travelUser.password,
        })
        .expect(200);
      authorization = `Bearer ${login.body.data.accessToken as string}`;

      await request(app.getHttpServer())
        .post('/api/v1/patients/me/onboarding')
        .set('Authorization', authorization)
        .send({
          diagnosisDate: dateOnlyAfter(-30),
          treatmentStartDate: dateOnlyAfter(-29),
          medicineTime: '07:30',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/medicine-stocks')
        .set('Authorization', authorization)
        .send({
          medicineName: 'OAT Travel',
          medicineType: 'OAT',
          quantity: 3,
          dailyDose: 1,
          thresholdQuantity: 1,
        })
        .expect(201);
    });

    it('rejects longlat fields through the global validation whitelist', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/travel-plans')
        .set('Authorization', authorization)
        .send({
          destination: 'Bandung, Jawa Barat',
          departureDate: dateOnlyAfter(10),
          returnDate: dateOnlyAfter(14),
          lat: -6.9,
          lng: 107.6,
        })
        .expect(400);

      expect(response.body.code).toBe('VALIDATION_ERROR');
      expect(
        response.body.errors.map((error: { field: string }) => error.field),
      ).toEqual(expect.arrayContaining(['lat', 'lng']));
    });

    it('creates a plan without persisted location or stock snapshots', async () => {
      const create = await request(app.getHttpServer())
        .post('/api/v1/travel-plans')
        .set('Authorization', authorization)
        .send({
          destination: 'Bandung, Jawa Barat',
          departureDate: dateOnlyAfter(10),
          returnDate: dateOnlyAfter(14),
        })
        .expect(201);
      expect(create.body).toEqual({
        message: 'Rencana perjalanan berhasil dibuat.',
      });

      const storedPlan = await Database.getDb(mongoUri, databaseName)
        .collection('travel_plans')
        .findOne({ destination: 'Bandung, Jawa Barat' });
      expect(storedPlan).toEqual(
        expect.objectContaining({
          destination: 'Bandung, Jawa Barat',
          cancelled_at: null,
        }),
      );
      expect(storedPlan?.lat).toBeUndefined();
      expect(storedPlan?.lng).toBeUndefined();
      expect(storedPlan?.latitude).toBeUndefined();
      expect(storedPlan?.longitude).toBeUndefined();
      expect(storedPlan?.location).toBeUndefined();
      expect(storedPlan?.stockReadiness).toBeUndefined();
      expect(storedPlan?.stock_readiness).toBeUndefined();
      planId = storedPlan?._id.toString() ?? '';

      const list = await request(app.getHttpServer())
        .get('/api/v1/travel-plans')
        .set('Authorization', authorization)
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toEqual(
        expect.objectContaining({
          id: planId,
          destination: 'Bandung, Jawa Barat',
          durationDays: 5,
          status: 'PLANNED',
          isEditable: true,
          stockReadiness: expect.objectContaining({
            isAllStockEnough: false,
            totalNeeded: 5,
            totalAvailable: 3,
          }),
        }),
      );
      expect(list.body.data[0].stockReadiness.stocks[0]).toEqual(
        expect.objectContaining({
          medicineName: 'OAT Travel',
          neededQuantity: 5,
          availableQuantity: 3,
          shortageQuantity: 2,
        }),
      );
    });

    it('rejects invalid travel dates', async () => {
      const pastDeparture = await request(app.getHttpServer())
        .post('/api/v1/travel-plans')
        .set('Authorization', authorization)
        .send({
          destination: 'Tanggal lampau',
          departureDate: dateOnlyAfter(-1),
          returnDate: dateOnlyAfter(2),
        })
        .expect(400);
      expect(pastDeparture.body.code).toBe('BUSINESS_RULE_VIOLATION');

      const invalidReturn = await request(app.getHttpServer())
        .post('/api/v1/travel-plans')
        .set('Authorization', authorization)
        .send({
          destination: 'Tanggal kembali salah',
          departureDate: dateOnlyAfter(10),
          returnDate: dateOnlyAfter(9),
        })
        .expect(400);
      expect(invalidReturn.body.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('keeps travel plan detail private to the owner', async () => {
      const otherUser = {
        email: `travel-owner.${suffix}@example.com`,
        username: `travel_owner_${suffix.slice(-8)}`,
        password: 'Aman12345',
        fullName: 'Travel Owner Test',
        role: UserRole.SUPPORTER,
      };
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(otherUser)
        .expect(201);
      const otherLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: otherUser.username, password: otherUser.password })
        .expect(200);
      const otherAuthorization = `Bearer ${
        otherLogin.body.data.accessToken as string
      }`;
      await request(app.getHttpServer())
        .post('/api/v1/patients/me/onboarding')
        .set('Authorization', otherAuthorization)
        .send({
          diagnosisDate: dateOnlyAfter(-10),
          treatmentStartDate: dateOnlyAfter(-9),
          medicineTime: '08:00',
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/travel-plans/${planId}`)
        .set('Authorization', otherAuthorization)
        .expect(404);
    });

    it('updates and cancels only editable plans', async () => {
      const update = await request(app.getHttpServer())
        .patch(`/api/v1/travel-plans/${planId}`)
        .set('Authorization', authorization)
        .send({
          destination: 'Bandung Barat, Jawa Barat',
          returnDate: dateOnlyAfter(15),
        })
        .expect(200);
      expect(update.body).toEqual({
        message: 'Rencana perjalanan berhasil diperbarui.',
      });

      const cancel = await request(app.getHttpServer())
        .post(`/api/v1/travel-plans/${planId}/cancel`)
        .set('Authorization', authorization)
        .expect(200);
      expect(cancel.body).toEqual({
        message: 'Rencana perjalanan berhasil dibatalkan.',
      });

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/travel-plans/${planId}`)
        .set('Authorization', authorization)
        .expect(200);
      expect(detail.body.data).toEqual(
        expect.objectContaining({
          destination: 'Bandung Barat, Jawa Barat',
          status: 'CANCELLED',
          isEditable: false,
          cancelledAt: expect.any(String),
        }),
      );

      const secondUpdate = await request(app.getHttpServer())
        .patch(`/api/v1/travel-plans/${planId}`)
        .set('Authorization', authorization)
        .send({ destination: 'Tidak boleh berubah' })
        .expect(409);
      expect(secondUpdate.body.code).toBe('TRAVEL_PLAN_NOT_EDITABLE');
    });

    it('lists only the active episode and keeps old episode plans read-only', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/travel-plans')
        .set('Authorization', authorization)
        .send({
          destination: 'Surabaya, Jawa Timur',
          departureDate: dateOnlyAfter(20),
          returnDate: dateOnlyAfter(22),
        })
        .expect(201);
      const oldPlan = await Database.getDb(mongoUri, databaseName)
        .collection('travel_plans')
        .findOne({ destination: 'Surabaya, Jawa Timur' });
      const oldPlanId = oldPlan?._id.toString() ?? '';

      await request(app.getHttpServer())
        .post('/api/v1/patients/me/profile/close')
        .set('Authorization', authorization)
        .send({ outcome: 'RECOVERED', reason: 'E2E episode selesai.' })
        .expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/patients/me/onboarding')
        .set('Authorization', authorization)
        .send({
          diagnosisDate: dateOnlyAfter(-2),
          treatmentStartDate: dateOnlyAfter(-1),
          medicineTime: '09:00',
        })
        .expect(201);

      const list = await request(app.getHttpServer())
        .get('/api/v1/travel-plans')
        .set('Authorization', authorization)
        .expect(200);
      expect(list.body.data).toHaveLength(0);

      const oldDetail = await request(app.getHttpServer())
        .get(`/api/v1/travel-plans/${oldPlanId}`)
        .set('Authorization', authorization)
        .expect(200);
      expect(oldDetail.body.data).toEqual(
        expect.objectContaining({
          id: oldPlanId,
          destination: 'Surabaya, Jawa Timur',
          isEditable: false,
        }),
      );

      const updateOld = await request(app.getHttpServer())
        .patch(`/api/v1/travel-plans/${oldPlanId}`)
        .set('Authorization', authorization)
        .send({ destination: 'Tidak boleh update episode lama' })
        .expect(409);
      expect(updateOld.body.code).toBe('TRAVEL_PLAN_NOT_EDITABLE');
    });
  });

  describe('F07 health facilities and maps', () => {
    const nearbyId = new ObjectId();
    const tbId = new ObjectId();
    const farId = new ObjectId();

    beforeAll(async () => {
      if (!patientAuthorization) {
        const login = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ identifier: patient.email, password: patient.password })
          .expect(200);
        patientAuthorization = `Bearer ${login.body.data.accessToken as string}`;
      }

      const collection = Database.getDb(mongoUri, databaseName).collection(
        'health_facilities',
      );
      await collection.deleteMany({});
      const now = new Date();
      await collection.insertMany([
        {
          _id: nearbyId,
          name: 'Klinik Terdekat',
          facility_type: 'Klinik Umum',
          address: 'Jl. Dekat No. 1',
          city: 'Jakarta',
          province: 'DKI Jakarta',
          phone_number: null,
          latitude: -6.2088,
          longitude: 106.8456,
          location: {
            type: 'Point',
            coordinates: [106.8456, -6.2088],
          },
          operating_hours: null,
          source: 'e2e',
          is_tb_service_available: false,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          _id: tbId,
          name: 'Puskesmas TB',
          facility_type: 'Puskesmas',
          address: 'Jl. TB No. 2',
          city: 'Jakarta',
          province: 'DKI Jakarta',
          phone_number: '(021) 123456',
          latitude: -6.2178,
          longitude: 106.8456,
          location: {
            type: 'Point',
            coordinates: [106.8456, -6.2178],
          },
          operating_hours: 'Senin-Jumat 08:00-16:00',
          source: 'e2e',
          is_tb_service_available: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
        {
          _id: farId,
          name: 'Rumah Sakit Jauh',
          facility_type: 'Rumah Sakit',
          address: 'Jl. Jauh No. 3',
          city: 'Bogor',
          province: 'Jawa Barat',
          phone_number: '(0251) 123456',
          latitude: -6.4088,
          longitude: 106.8456,
          location: {
            type: 'Point',
            coordinates: [106.8456, -6.4088],
          },
          operating_hours: '24 jam',
          source: 'e2e',
          is_tb_service_available: true,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ]);
    });

    it('protects facility endpoints', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/facilities')
        .expect(401);

      expect(response.body.code).toBe('UNAUTHORIZED');
    });

    it('lists paginated camelCase summaries and prioritizes TB services', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/facilities?page=1&limit=2')
        .set('Authorization', patientAuthorization)
        .expect(200);

      expect(response.body.meta).toEqual({
        page: 1,
        limit: 2,
        totalItems: 3,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      expect(response.body.data).toHaveLength(2);
      expect(
        response.body.data.every(
          (facility: { isTbServiceAvailable: boolean }) =>
            facility.isTbServiceAvailable,
        ),
      ).toBe(true);
      expect(response.body.data[0]).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          facilityType: expect.any(String),
          isTbServiceAvailable: true,
        }),
      );
      expect(response.body.data[0]._id).toBeUndefined();
      expect(response.body.data[0].facility_type).toBeUndefined();
    });

    it('filters the facility list by city, type, and TB service', async () => {
      const response = await request(app.getHttpServer())
        .get(
          '/api/v1/facilities?city=jakarta&facilityType=Puskesmas&isTbServiceAvailable=true',
        )
        .set('Authorization', patientAuthorization)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(tbId.toHexString());
    });

    it('orders nearby facilities by distance and respects radius and filters', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/facilities/nearby?lat=-6.2088&lng=106.8456&radius=5000')
        .set('Authorization', patientAuthorization)
        .expect(200);

      expect(
        response.body.data.map((facility: { id: string }) => facility.id),
      ).toEqual([nearbyId.toHexString(), tbId.toHexString()]);
      expect(response.body.data[0].distanceKm).toBeLessThanOrEqual(
        response.body.data[1].distanceKm,
      );

      const tbOnly = await request(app.getHttpServer())
        .get(
          '/api/v1/facilities/nearby?lat=-6.2088&lng=106.8456&radius=5000&isTbServiceAvailable=true&limit=1',
        )
        .set('Authorization', patientAuthorization)
        .expect(200);
      expect(tbOnly.body.data).toHaveLength(1);
      expect(tbOnly.body.data[0].id).toBe(tbId.toHexString());

      const empty = await request(app.getHttpServer())
        .get('/api/v1/facilities/nearby?lat=-7.2088&lng=106.8456&radius=100')
        .set('Authorization', patientAuthorization)
        .expect(200);
      expect(empty.body).toEqual({ data: [] });
    });

    it('returns the feature error code for invalid coordinates', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/facilities/nearby?lat=91&lng=106.8456')
        .set('Authorization', patientAuthorization)
        .expect(400);

      expect(response.body.code).toBe('INVALID_COORDINATES');
    });

    it('returns detail data without leaking database field names', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/facilities/${tbId.toHexString()}`)
        .set('Authorization', patientAuthorization)
        .expect(200);

      expect(response.body.data).toEqual(
        expect.objectContaining({
          id: tbId.toHexString(),
          name: 'Puskesmas TB',
          operatingHours: 'Senin-Jumat 08:00-16:00',
          source: 'e2e',
        }),
      );
      expect(response.body.data._id).toBeUndefined();
      expect(response.body.data.operating_hours).toBeUndefined();
    });

    it('seeds facilities idempotently without duplicates', async () => {
      const service = app.get(FacilitiesService);
      const first = await service.seedFacilities();
      const countAfterFirst = await Database.getDb(mongoUri, databaseName)
        .collection('health_facilities')
        .countDocuments();
      const second = await service.seedFacilities();
      const countAfterSecond = await Database.getDb(mongoUri, databaseName)
        .collection('health_facilities')
        .countDocuments();

      expect(first.insertedCount).toBeGreaterThan(0);
      expect(second.insertedCount).toBe(0);
      expect(second.existingCount).toBeGreaterThan(0);
      expect(countAfterSecond).toBe(countAfterFirst);
    });
  });
});
