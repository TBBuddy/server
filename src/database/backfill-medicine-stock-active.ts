import { loadEnvFile } from 'node:process';
import { MongoClient } from 'mongodb';

const apply = process.argv.includes('--apply');

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

async function backfill(): Promise<void> {
  const client = new MongoClient(mongoConnection);
  await client.connect();

  try {
    const collection = client
      .db(mongoDatabaseName)
      .collection('medicine_stocks');
    const filter = { is_active: { $exists: false } };
    const missingIsActive = await collection.countDocuments(filter);
    const report = {
      mode: apply ? 'apply' : 'dry-run',
      collection: 'medicine_stocks',
      missingIsActive,
    };
    console.log(JSON.stringify(report, null, 2));

    if (!apply || missingIsActive === 0) return;

    const result = await collection.updateMany(filter, {
      $set: {
        is_active: true,
        updated_at: new Date(),
      },
    });
    console.log(
      JSON.stringify(
        {
          matchedCount: result.matchedCount,
          modifiedCount: result.modifiedCount,
        },
        null,
        2,
      ),
    );
    console.log('Medicine stock active status backfill applied successfully.');
  } finally {
    await client.close();
  }
}

void backfill();
