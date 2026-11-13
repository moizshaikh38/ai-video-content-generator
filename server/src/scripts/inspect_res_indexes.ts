import { getMongoDb, closeMongo } from '../db/mongoClient.js';

async function run() {
  const db = await getMongoDb();
  const indexes = await db.collection('credit_reservations').indexes();
  console.log('credit_reservations indexes:', JSON.stringify(indexes, null, 2));
  await closeMongo(true);
}

run().catch(console.error);

