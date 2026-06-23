import { writeFile } from 'node:fs/promises';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';

try {
  loadEnvFile();
} catch {
  // Environment may already be supplied by the caller.
}

const outputArgument = process.argv.find((value) =>
  value.startsWith('--output='),
);
const outputPath = outputArgument?.slice('--output='.length);
if (!outputPath) {
  throw new Error('Provide --output=<absolute-json-path>.');
}
const backupOutputPath = outputPath;

const connection = process.env.MONGODB_CONNECTION;
const databaseName = process.env.MONGODB_DATABASE;
if (!connection || !databaseName) {
  throw new Error('MONGODB_CONNECTION and MONGODB_DATABASE are required.');
}
const mongoConnection = connection;
const mongoDatabaseName = databaseName;

const collectionNames = [
  'patient_profiles',
  'patient_pmos',
  'daily_checkins',
  'checkin_symptoms',
  'medicine_stocks',
  'medicine_stock_logs',
] as const;

async function backup(): Promise<void> {
  const client = new MongoClient(mongoConnection);
  await client.connect();
  try {
    const database = client.db(mongoDatabaseName);
    const patientProfiles = await database
      .collection<{ user_id?: unknown }>('patient_profiles')
      .find({})
      .toArray();
    const userIds = patientProfiles
      .map((profile) => profile.user_id)
      .filter((value): value is string => typeof value === 'string');

    const collections: Record<string, unknown> = {};
    const indexes: Record<string, unknown> = {};
    for (const name of collectionNames) {
      const collection = database.collection(name);
      collections[name] = await collection.find({}).toArray();
      indexes[name] = await collection.indexes();
    }
    collections.users = await database
      .collection('users')
      .find(
        { _id: { $in: userIds.map((id) => new ObjectId(id)) } },
        {
          projection: {
            _id: 1,
            role: 1,
            treatment_status: 1,
            updated_at: 1,
          },
        },
      )
      .toArray();
    indexes.users = await database.collection('users').indexes();

    const target = resolve(backupOutputPath);
    await writeFile(
      target,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          database: mongoDatabaseName,
          collections,
          indexes,
        },
        null,
        2,
      ),
      { encoding: 'utf8', flag: 'wx' },
    );
    console.log(`Backup written to ${target}`);
  } finally {
    await client.close();
  }
}

void backup();
