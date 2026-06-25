/**
 * Seed check-in harian untuk akun patient_demo.
 * Mengisi 12 hari data dalam window 14 hari terakhir sehingga AI Assessment
 * dapat langsung di-generate saat demo (minimum 7 hari terpenuhi).
 *
 * Prasyarat:
 *   1. seed-demo-users.ts sudah dijalankan (user + patient_profile harus ada)
 *   2. Symptoms sudah di-seed (POST /checkins/symptoms/seed atau seed-symptoms.ts)
 *
 * Cara menjalankan:
 *   npx ts-node -r tsconfig-paths/register src/database/seed-demo-checkins.ts
 */

import { loadEnvFile } from 'node:process';
import { startOfDay, subDays } from 'date-fns';
import { MongoClient, ObjectId } from 'mongodb';
import { SeverityLevel } from '../common/enums/severity-level.enum';

try {
  loadEnvFile();
} catch {
  // Env mungkin sudah diset oleh caller.
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo seed dinonaktifkan di production.');
}

const connection = process.env.MONGODB_CONNECTION;
const databaseName = process.env.MONGODB_DATABASE;
if (!connection || !databaseName) {
  throw new Error('MONGODB_CONNECTION dan MONGODB_DATABASE wajib diset.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Rencana check-in — 12 hari dalam window 14 hari
// daysAgo: 1–14  (0 = hari ini, TIDAK masuk window AI period)
// Pola realistis: mayoritas minum obat, beberapa hari ada gejala
// ─────────────────────────────────────────────────────────────────────────────
type SymptomPlan = { name: string; severity: SeverityLevel; note?: string };

interface CheckinPlan {
  daysAgo: number;
  hasTakenMedicine: boolean;
  skippedReason?: string;
  hasComplaint: boolean;
  symptoms: SymptomPlan[];
  generalNote?: string;
}

const CHECKIN_PLAN: CheckinPlan[] = [
  {
    daysAgo: 13,
    hasTakenMedicine: true,
    hasComplaint: false,
    symptoms: [],
  },
  {
    daysAgo: 12,
    hasTakenMedicine: true,
    hasComplaint: true,
    symptoms: [
      { name: 'Batuk berkepanjangan', severity: SeverityLevel.MILD },
      { name: 'Kelelahan', severity: SeverityLevel.MILD },
    ],
  },
  {
    daysAgo: 11,
    hasTakenMedicine: true,
    hasComplaint: false,
    symptoms: [],
  },
  {
    daysAgo: 10,
    hasTakenMedicine: false,
    skippedReason: 'Lupa minum obat hari ini.',
    hasComplaint: false,
    symptoms: [],
  },
  {
    daysAgo: 9,
    hasTakenMedicine: true,
    hasComplaint: true,
    symptoms: [
      { name: 'Keringat malam', severity: SeverityLevel.MILD },
      { name: 'Kelelahan', severity: SeverityLevel.MILD },
    ],
  },
  {
    daysAgo: 8,
    hasTakenMedicine: true,
    hasComplaint: false,
    symptoms: [],
  },
  {
    daysAgo: 7,
    hasTakenMedicine: true,
    hasComplaint: true,
    symptoms: [
      { name: 'Batuk berkepanjangan', severity: SeverityLevel.MODERATE },
      { name: 'Demam', severity: SeverityLevel.MILD },
      { name: 'Kelelahan', severity: SeverityLevel.MODERATE },
    ],
    generalNote: 'Batuk terasa lebih berat dari biasanya.',
  },
  {
    daysAgo: 6,
    hasTakenMedicine: true,
    hasComplaint: true,
    symptoms: [
      { name: 'Batuk berkepanjangan', severity: SeverityLevel.MILD },
      { name: 'Keringat malam', severity: SeverityLevel.MILD },
    ],
  },
  {
    daysAgo: 4,
    hasTakenMedicine: true,
    hasComplaint: true,
    symptoms: [
      { name: 'Sesak napas', severity: SeverityLevel.MILD },
      { name: 'Nyeri dada', severity: SeverityLevel.MILD },
    ],
    generalNote: 'Sedikit sesak saat naik tangga.',
  },
  {
    daysAgo: 3,
    hasTakenMedicine: true,
    hasComplaint: false,
    symptoms: [],
  },
  {
    daysAgo: 2,
    hasTakenMedicine: true,
    hasComplaint: true,
    symptoms: [
      { name: 'Batuk berkepanjangan', severity: SeverityLevel.MILD },
      { name: 'Kelelahan', severity: SeverityLevel.MODERATE },
      { name: 'Nafsu makan menurun', severity: SeverityLevel.MILD },
    ],
  },
  {
    daysAgo: 1,
    hasTakenMedicine: true,
    hasComplaint: false,
    symptoms: [],
  },
];

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  [SeverityLevel.NONE]: 0,
  [SeverityLevel.MILD]: 1,
  [SeverityLevel.MODERATE]: 2,
  [SeverityLevel.SEVERE]: 3,
};

function maxSeverity(symptoms: SymptomPlan[]): SeverityLevel {
  return symptoms.reduce<SeverityLevel>(
    (max, s) => (SEVERITY_RANK[s.severity] > SEVERITY_RANK[max] ? s.severity : max),
    SeverityLevel.NONE,
  );
}

async function seed(): Promise<void> {
  const client = new MongoClient(connection!);
  await client.connect();

  try {
    const db = client.db(databaseName);

    // ── 1. Temukan user patient_demo ──────────────────────────────────────────
    const user = await db.collection('users').findOne({ username: 'patient_demo' });
    if (!user) {
      throw new Error(
        'User "patient_demo" tidak ditemukan. Jalankan seed-demo-users.ts terlebih dahulu.',
      );
    }
    const userId = user._id.toHexString();

    // ── 2. Temukan patient profile aktif ─────────────────────────────────────
    const profile = await db
      .collection('patient_profiles')
      .findOne({ user_id: userId, status: 'ACTIVE' });
    if (!profile) {
      throw new Error('Patient profile aktif untuk patient_demo tidak ditemukan.');
    }
    const profileId = profile._id.toHexString();
    const treatmentStart: Date = new Date(profile.treatment_start_date);

    // ── 3. Load symptom map: name → _id string ────────────────────────────────
    const symptomsInDb = await db.collection('symptoms').find({}).toArray();
    if (symptomsInDb.length === 0) {
      throw new Error(
        'Koleksi symptoms kosong. Seed symptoms dulu via POST /checkins/symptoms/seed.',
      );
    }
    const symptomMap = new Map<string, string>(
      symptomsInDb.map((s) => [s.name as string, s._id.toHexString()]),
    );

    // ── 4. Bersihkan data lama (idempotent) ───────────────────────────────────
    const [dc, cs] = await Promise.all([
      db.collection('daily_checkins').deleteMany({ patient_id: userId }),
      db.collection('checkin_symptoms').deleteMany({ patient_id: userId }),
    ]);
    console.log(
      `Cleared: ${dc.deletedCount} daily_checkins, ${cs.deletedCount} checkin_symptoms`,
    );

    // ── 5. Insert check-in + symptoms ─────────────────────────────────────────
    const today = startOfDay(new Date());
    const now = new Date();
    let checkinCount = 0;
    let symptomCount = 0;

    for (const plan of CHECKIN_PLAN) {
      const checkinDate = startOfDay(subDays(today, plan.daysAgo));
      const checkinId = new ObjectId();

      const treatmentDayNumber = Math.max(
        1,
        Math.round(
          (checkinDate.getTime() - startOfDay(treatmentStart).getTime()) / 86_400_000,
        ) + 1,
      );

      // Waktu minum obat: jam 07:30 (sesuai medicine_time di profile)
      const takenAt = plan.hasTakenMedicine
        ? new Date(checkinDate.getTime() + 7 * 3_600_000 + 30 * 60_000)
        : null;

      await db.collection('daily_checkins').insertOne({
        _id: checkinId,
        patient_id: userId,
        patient_profile_id: profileId,
        checkin_date: checkinDate,
        treatment_day_number: treatmentDayNumber,
        has_taken_medicine: plan.hasTakenMedicine,
        taken_at: takenAt,
        has_complaint: plan.hasComplaint,
        severity: plan.hasComplaint ? maxSeverity(plan.symptoms) : SeverityLevel.NONE,
        general_note: plan.generalNote ?? null,
        skipped_reason: plan.hasTakenMedicine ? null : (plan.skippedReason ?? null),
        created_at: now,
        updated_at: now,
      });
      checkinCount++;

      if (plan.symptoms.length > 0) {
        const symptomDocs = plan.symptoms.map((s) => {
          const symptomId = symptomMap.get(s.name);
          if (!symptomId) {
            throw new Error(
              `Symptom "${s.name}" tidak ada di database. Pastikan seed symptoms sudah dijalankan.`,
            );
          }
          return {
            _id: new ObjectId(),
            checkin_id: checkinId.toHexString(),
            patient_id: userId,
            patient_profile_id: profileId,
            symptom_id: symptomId,
            severity: s.severity,
            note: s.note ?? null,
            created_at: now,
          };
        });
        await db.collection('checkin_symptoms').insertMany(symptomDocs);
        symptomCount += symptomDocs.length;
      }
    }

    console.log(
      `\nBerhasil seed ${checkinCount} check-ins dan ${symptomCount} checkin_symptom records.`,
    );
    console.log('─'.repeat(60));
    console.log('Demo flow:');
    console.log('  1. Login sebagai patient_demo / TBuddyDemo123!');
    console.log('  2. Isi check-in hari ini (boleh ada gejala atau tidak)');
    console.log('  3. Buka fitur Assessment → Generate Assessment');
    console.log('  4. Tunggu hasil AI muncul');
    console.log('─'.repeat(60));
  } finally {
    await client.close();
  }
}

void seed();
