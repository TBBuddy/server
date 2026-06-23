import { loadEnvFile } from 'node:process';
import * as bcrypt from 'bcrypt';
import { addDays, addMonths, startOfDay, subDays } from 'date-fns';
import { MongoClient, ObjectId } from 'mongodb';
import { PatientProfileStatus } from '../common/enums/patient-profile-status.enum';
import { TreatmentStatus } from '../common/enums/treatment-status.enum';
import { UserRole } from '../common/enums/user-role.enum';

const DEMO_PASSWORD = 'TBuddyDemo123!';

try {
  loadEnvFile();
} catch {
  // Environment may already be supplied by the caller.
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo seed is disabled in production.');
}

const connection = process.env.MONGODB_CONNECTION;
const databaseName = process.env.MONGODB_DATABASE;
const bcryptRounds = Number(process.env.BCRYPT_ROUNDS ?? 12);
if (!connection || !databaseName) {
  throw new Error('MONGODB_CONNECTION and MONGODB_DATABASE are required.');
}
const mongoConnection = connection;
const mongoDatabaseName = databaseName;

const personas = [
  {
    username: 'supporter_demo',
    email: 'supporter.demo@tbuddy.local',
    fullName: 'Supporter Demo',
    role: UserRole.SUPPORTER,
    treatmentStatus: TreatmentStatus.NOT_PATIENT,
    profileStatus: null,
  },
  {
    username: 'patient_demo',
    email: 'patient.demo@tbuddy.local',
    fullName: 'Patient Demo',
    role: UserRole.PATIENT,
    treatmentStatus: TreatmentStatus.ON_TREATMENT,
    profileStatus: PatientProfileStatus.ACTIVE,
  },
  {
    username: 'recovered_demo',
    email: 'recovered.demo@tbuddy.local',
    fullName: 'Recovered Demo',
    role: UserRole.SUPPORTER,
    treatmentStatus: TreatmentStatus.RECOVERED,
    profileStatus: PatientProfileStatus.RECOVERED,
  },
  {
    username: 'dropped_demo',
    email: 'dropped.demo@tbuddy.local',
    fullName: 'Dropped Demo',
    role: UserRole.SUPPORTER,
    treatmentStatus: TreatmentStatus.DROPPED,
    profileStatus: PatientProfileStatus.DROPPED,
  },
] as const;

async function seed(): Promise<void> {
  const client = new MongoClient(mongoConnection);
  await client.connect();

  try {
    const database = client.db(mongoDatabaseName);
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, bcryptRounds);
    const now = new Date();

    for (const persona of personas) {
      await database.collection('users').updateOne(
        { username: persona.username },
        {
          $set: {
            email: persona.email,
            password_hash: passwordHash,
            full_name: persona.fullName,
            role: persona.role,
            treatment_status: persona.treatmentStatus,
            is_verified: true,
            is_active: true,
            updated_at: now,
          },
          $setOnInsert: {
            _id: new ObjectId(),
            avatar_url: null,
            phone_number: null,
            push_notification_tokens: [],
            last_login_at: null,
            created_at: now,
          },
        },
        { upsert: true },
      );
      const user = await database
        .collection('users')
        .findOne({ username: persona.username });
      if (!user) continue;
      const userId = user._id.toHexString();
      await Promise.all([
        database.collection('patient_pmos').deleteMany({ patient_id: userId }),
        database
          .collection('daily_checkins')
          .deleteMany({ patient_id: userId }),
        database
          .collection('checkin_symptoms')
          .deleteMany({ patient_id: userId }),
        database
          .collection('medicine_stocks')
          .deleteMany({ patient_id: userId }),
        database
          .collection('medicine_stock_logs')
          .deleteMany({ patient_id: userId }),
        database.collection('patient_profiles').deleteMany({ user_id: userId }),
      ]);
      if (persona.profileStatus === null) continue;

      const active = persona.profileStatus === PatientProfileStatus.ACTIVE;
      const treatmentStart = active
        ? startOfDay(subDays(now, 47))
        : startOfDay(subDays(now, 240));
      const estimatedEnd = addMonths(treatmentStart, active ? 6 : 8);
      const endedAt = active ? null : addDays(treatmentStart, 180);

      await database.collection('patient_profiles').insertOne({
        _id: new ObjectId(),
        user_id: userId,
        status: persona.profileStatus,
        diagnosis_date: subDays(treatmentStart, 7),
        medicine_time: '07:30',
        treatment_start_date: treatmentStart,
        estimated_treatment_end_date: estimatedEnd,
        treatment_day_count: active ? 48 : 180,
        treatment_duration_months: active ? 6 : 8,
        has_dropped_before:
          persona.profileStatus === PatientProfileStatus.DROPPED,
        previous_treatment_note:
          persona.profileStatus === PatientProfileStatus.DROPPED
            ? 'Demo episode berhenti sebelum selesai.'
            : null,
        current_streak: active ? 12 : 0,
        longest_streak: active ? 24 : 35,
        total_checkins: active ? 42 : 150,
        total_missed_days: active ? 6 : 30,
        ended_at: endedAt,
        ended_reason:
          persona.profileStatus === PatientProfileStatus.RECOVERED
            ? 'Pengobatan selesai.'
            : persona.profileStatus === PatientProfileStatus.DROPPED
              ? 'Pengobatan terhenti.'
              : null,
        created_at: treatmentStart,
        updated_at: now,
      });
      const profile = await database.collection('patient_profiles').findOne({
        user_id: userId,
        status: persona.profileStatus,
      });
      if (!profile) continue;

      const profileId = profile._id.toHexString();
      await database.collection('patient_pmos').updateOne(
        { patient_profile_id: profileId, email: 'pmo.demo@tbuddy.local' },
        {
          $set: {
            patient_id: userId,
            name: 'PMO Demo',
            relationship: 'Keluarga',
            phone_number: '+6281234567890',
            whatsapp_number: '+6281234567890',
            is_primary: active,
            is_active: active,
            updated_at: now,
          },
          $setOnInsert: {
            _id: new ObjectId(),
            patient_profile_id: profileId,
            email: 'pmo.demo@tbuddy.local',
            created_at: treatmentStart,
          },
        },
        { upsert: true },
      );

      if (active) {
        await database.collection('medicine_stocks').updateOne(
          { patient_profile_id: profileId, medicine_name: 'OAT Demo' },
          {
            $set: {
              patient_id: userId,
              medicine_type: 'OAT',
              quantity: 18,
              unit: 'tablet',
              daily_dose: 1,
              threshold_quantity: 7,
              source_facility_id: null,
              last_restock_at: treatmentStart,
              next_estimated_empty_date: addDays(startOfDay(now), 18),
              is_active: true,
              updated_at: now,
            },
            $setOnInsert: {
              _id: new ObjectId(),
              patient_profile_id: profileId,
              created_at: treatmentStart,
            },
          },
          { upsert: true },
        );
      }
    }

    console.log(`Seeded demo users. Shared password: ${DEMO_PASSWORD}`);
  } finally {
    await client.close();
  }
}

void seed();
