import { loadEnvFile } from 'node:process';
import { Collection, Document, MongoClient, ObjectId } from 'mongodb';
import { PatientProfileStatus } from '../common/enums/patient-profile-status.enum';
import { TreatmentStatus } from '../common/enums/treatment-status.enum';
import { UserRole } from '../common/enums/user-role.enum';

type ProfileRecord = {
  _id: ObjectId;
  user_id?: unknown;
  status?: PatientProfileStatus;
};

type ReferenceRecord = {
  _id: ObjectId;
  patient_id?: unknown;
  patient_profile_id?: unknown;
};

type ReferenceAudit = {
  planned: number;
  orphans: string[];
  invalidProfileReferences: string[];
  ownershipMismatches: string[];
};

const apply = process.argv.includes('--apply');
const finalizeIndexes = process.argv.includes('--finalize-indexes');

try {
  loadEnvFile();
} catch {
  // Environment may already be supplied by the caller.
}

const connection = process.env.MONGODB_CONNECTION;
const databaseName = process.env.MONGODB_DATABASE;
if (!connection || !databaseName) {
  throw new Error('MONGODB_CONNECTION and MONGODB_DATABASE are required.');
}
const mongoConnection = connection;
const mongoDatabaseName = databaseName;

const targetCollections = [
  'patient_pmos',
  'daily_checkins',
  'checkin_symptoms',
  'medicine_stocks',
  'medicine_stock_logs',
] as const;

async function dropIndexIfPresent(
  collection: Collection<Document>,
  name: string,
): Promise<void> {
  const exists = (await collection.indexes()).some(
    (index) => index.name === name,
  );
  if (exists) await collection.dropIndex(name);
}

function recordId(record: ReferenceRecord): string {
  return record._id.toHexString();
}

async function migrate(): Promise<void> {
  const client = new MongoClient(mongoConnection);
  await client.connect();

  try {
    const database = client.db(mongoDatabaseName);
    const profiles = database.collection<ProfileRecord>('patient_profiles');
    const profileRows = await profiles.find({}).toArray();
    const profilesById = new Map(
      profileRows.map((profile) => [profile._id.toHexString(), profile]),
    );
    const grouped = new Map<string, ProfileRecord[]>();
    const invalidProfileOwners: string[] = [];

    for (const profile of profileRows) {
      if (
        typeof profile.user_id !== 'string' ||
        !ObjectId.isValid(profile.user_id)
      ) {
        invalidProfileOwners.push(profile._id.toHexString());
        continue;
      }
      const list = grouped.get(profile.user_id) ?? [];
      list.push(profile);
      grouped.set(profile.user_id, list);
    }

    const activeByUser = new Map<string, ProfileRecord>();
    const legacyProfilesToActivate: ProfileRecord[] = [];
    const multipleActiveUsers: string[] = [];
    const ambiguousLegacyUsers: string[] = [];

    for (const [userId, records] of grouped) {
      const active = records.filter(
        (record) => record.status === PatientProfileStatus.ACTIVE,
      );
      const legacy = records.filter((record) => record.status === undefined);

      if (active.length > 1) {
        multipleActiveUsers.push(userId);
        continue;
      }
      if (legacy.length > 1 || (active.length === 1 && legacy.length > 0)) {
        ambiguousLegacyUsers.push(userId);
        continue;
      }

      const selected = active[0] ?? legacy[0];
      if (!selected) continue;
      activeByUser.set(userId, selected);
      if (selected.status === undefined) {
        legacyProfilesToActivate.push(selected);
      }
    }

    const references: Record<string, ReferenceAudit> = {};
    for (const name of targetCollections) {
      const rows = await database
        .collection<ReferenceRecord>(name)
        .find(
          {},
          { projection: { _id: 1, patient_id: 1, patient_profile_id: 1 } },
        )
        .toArray();
      const audit: ReferenceAudit = {
        planned: 0,
        orphans: [],
        invalidProfileReferences: [],
        ownershipMismatches: [],
      };

      for (const row of rows) {
        const patientId =
          typeof row.patient_id === 'string' ? row.patient_id : null;
        const profileReference = row.patient_profile_id;

        if (profileReference === undefined || profileReference === null) {
          if (patientId && activeByUser.has(patientId)) {
            audit.planned += 1;
          } else {
            audit.orphans.push(recordId(row));
          }
          continue;
        }

        if (
          typeof profileReference !== 'string' ||
          !ObjectId.isValid(profileReference)
        ) {
          audit.invalidProfileReferences.push(recordId(row));
          continue;
        }

        const referencedProfile = profilesById.get(profileReference);
        if (!referencedProfile) {
          audit.invalidProfileReferences.push(recordId(row));
          continue;
        }
        if (
          !patientId ||
          typeof referencedProfile.user_id !== 'string' ||
          referencedProfile.user_id !== patientId
        ) {
          audit.ownershipMismatches.push(recordId(row));
        }
      }
      references[name] = audit;
    }

    const planned = Object.fromEntries(
      Object.entries(references).map(([name, audit]) => [name, audit.planned]),
    );
    const orphans = Object.fromEntries(
      Object.entries(references).map(([name, audit]) => [name, audit.orphans]),
    );
    const invalidProfileReferences = Object.fromEntries(
      Object.entries(references).map(([name, audit]) => [
        name,
        audit.invalidProfileReferences,
      ]),
    );
    const ownershipMismatches = Object.fromEntries(
      Object.entries(references).map(([name, audit]) => [
        name,
        audit.ownershipMismatches,
      ]),
    );
    const report = {
      mode: apply ? 'apply' : 'dry-run',
      profiles: profileRows.length,
      activeProfiles: activeByUser.size,
      legacyProfilesToActivate: legacyProfilesToActivate.length,
      conflicts: {
        multipleActiveUsers,
        ambiguousLegacyUsers,
        invalidProfileOwners,
      },
      planned,
      orphans,
      invalidProfileReferences,
      ownershipMismatches,
    };
    console.log(JSON.stringify(report, null, 2));
    if (!apply) return;

    const hasReferenceIssues = Object.values(references).some(
      (audit) =>
        audit.orphans.length > 0 ||
        audit.invalidProfileReferences.length > 0 ||
        audit.ownershipMismatches.length > 0,
    );
    if (
      multipleActiveUsers.length > 0 ||
      ambiguousLegacyUsers.length > 0 ||
      invalidProfileOwners.length > 0 ||
      hasReferenceIssues
    ) {
      throw new Error('Resolve migration conflicts before applying.');
    }

    const now = new Date();
    const applied: Record<string, number> = {
      patient_profiles: 0,
      users: 0,
      ...Object.fromEntries(targetCollections.map((name) => [name, 0])),
    };
    for (const profile of legacyProfilesToActivate) {
      const result = await profiles.updateOne(
        { _id: profile._id, status: { $exists: false } },
        {
          $set: {
            status: PatientProfileStatus.ACTIVE,
            ended_at: null,
            ended_reason: null,
            updated_at: now,
          },
        },
      );
      applied.patient_profiles += result.modifiedCount;
    }

    for (const [userId, profile] of activeByUser) {
      const profileId = profile._id.toHexString();
      for (const name of targetCollections) {
        const result = await database.collection(name).updateMany(
          {
            patient_id: userId,
            patient_profile_id: { $exists: false },
          },
          { $set: { patient_profile_id: profileId } },
        );
        applied[name] += result.modifiedCount;
      }
      const userResult = await database.collection('users').updateOne(
        {
          _id: new ObjectId(userId),
          $or: [
            { role: { $ne: UserRole.PATIENT } },
            { treatment_status: { $ne: TreatmentStatus.ON_TREATMENT } },
          ],
        },
        {
          $set: {
            role: UserRole.PATIENT,
            treatment_status: TreatmentStatus.ON_TREATMENT,
            updated_at: now,
          },
        },
      );
      applied.users += userResult.modifiedCount;
    }

    await profiles.createIndexes([
      {
        key: { user_id: 1, status: 1 },
        name: 'patient_profiles_user_status',
      },
      {
        key: { user_id: 1 },
        name: 'patient_profiles_one_active_per_user',
        unique: true,
        partialFilterExpression: { status: PatientProfileStatus.ACTIVE },
      },
    ]);
    await database.collection('daily_checkins').createIndex(
      { patient_profile_id: 1, checkin_date: 1 },
      {
        name: 'daily_checkins_profile_date',
        unique: true,
        partialFilterExpression: {
          patient_profile_id: { $type: 'string' },
        },
      },
    );
    await database.collection('medicine_stock_logs').createIndex(
      {
        patient_profile_id: 1,
        medicine_stock_id: 1,
        reason: 1,
        operation_key: 1,
      },
      {
        name: 'medicine_stock_logs_profile_idempotency',
        unique: true,
        partialFilterExpression: {
          patient_profile_id: { $type: 'string' },
          operation_key: { $type: 'string' },
        },
      },
    );

    if (finalizeIndexes) {
      const profileIndexes = await profiles.indexes();
      for (const index of profileIndexes) {
        if (
          index.unique === true &&
          index.name !== '_id_' &&
          index.partialFilterExpression === undefined &&
          JSON.stringify(index.key) === JSON.stringify({ user_id: 1 })
        ) {
          await profiles.dropIndex(index.name!);
        }
      }
      await dropIndexIfPresent(
        database.collection('daily_checkins'),
        'daily_checkins_patient_date',
      );
      await dropIndexIfPresent(
        database.collection('medicine_stocks'),
        'medicine_stocks_patient_active_created',
      );
      await dropIndexIfPresent(
        database.collection('medicine_stock_logs'),
        'medicine_stock_logs_stock_patient_created',
      );
      await dropIndexIfPresent(
        database.collection('medicine_stock_logs'),
        'medicine_stock_logs_idempotency',
      );
    }
    console.log(JSON.stringify({ applied }, null, 2));
    console.log('Patient episode migration applied successfully.');
  } finally {
    await client.close();
  }
}

void migrate();
