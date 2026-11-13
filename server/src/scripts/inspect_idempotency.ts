import { getMongoDb, closeMongo } from '../db/mongoClient.js';

async function run() {
  const db = await getMongoDb();
  const collection = db.collection('idempotency_keys');

  // Check uniqueness of compound key across all documents
  const duplicates = await collection.aggregate([
    {
      $group: {
        _id: {
          user_id: '$user_id',
          operation_type: '$operation_type',
          client_key: '$client_key',
        },
        count: { $sum: 1 },
      },
    },
    {
      $match: {
        count: { $gt: 1 },
      },
    },
  ]).toArray();

  console.log('Duplicates for { user_id, operation_type, client_key }:', duplicates);
  console.log('Uniqueness verified:', duplicates.length === 0);

  // Check if any document lacks operation_id or attempt_id
  const missingAliases = await collection.countDocuments({
    $or: [
      { operation_id: { $exists: false } },
      { attempt_id: { $exists: false } },
    ],
  });
  console.log('Documents missing operation_id or attempt_id alias:', missingAliases);

  await closeMongo(true);
}

run().catch(console.error);
