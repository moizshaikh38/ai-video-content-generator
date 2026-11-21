import { Db, MongoClient } from 'mongodb';
import dns from 'node:dns';
import { config } from '../config/index.js';
import { AppError } from '../types/index.js';

// Ensure reliable SRV resolution on hosts where the local resolver drops SRV queries
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore if permissions or sandbox disallow custom dns servers
}

let client: MongoClient | null = null;
let connecting: Promise<Db> | null = null;
let pendingClient:MongoClient|null=null;
let connectionGeneration=0;

export const isMongoConfigured = Boolean(config.mongodbUri && config.mongodbDbName);

/** One lazy connection pool for the process. A failed attempt may be retried. */
export async function getMongoDb(): Promise<Db> {
  if (!isMongoConfigured) {
    throw new AppError('Database is not configured.', 503, 'DATABASE_UNAVAILABLE');
  }
  if (client) return client.db(config.mongodbDbName);
  if (!connecting) {
    const candidate = new MongoClient(config.mongodbUri, {
      appName: 'vireo-api',
      maxPoolSize: 20,
      connectTimeoutMS: 30_000,
      serverSelectionTimeoutMS: 30_000,
    });
    const generation=connectionGeneration;
    pendingClient=candidate;
    const assertCurrent=()=>{
      if(generation!==connectionGeneration)throw new AppError('Database connection was closed before becoming ready.',503,'DATABASE_UNAVAILABLE');
    };
    connecting = candidate.connect()
      .then(async () => {
        assertCurrent();
        const db = candidate.db(config.mongodbDbName);
        await db.command({ ping: 1 });
        assertCurrent();
        client = candidate;
        pendingClient=null;
        return db;
      })
      .catch(async (err: unknown) => {
        await candidate.close().catch(() => undefined);
        // A stale attempt cannot clear the newer generation's shared promise.
        if(generation===connectionGeneration){connecting = null;pendingClient=null;}
        const detail = err instanceof Error ? err.message : String(err);
        throw new AppError(`Database is unavailable: ${detail}`, 503, 'DATABASE_UNAVAILABLE');
      });
  }
  return connecting;
}

export async function getMongoClient(): Promise<MongoClient> {
  await getMongoDb();
  if (!client) throw new AppError('Database is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  return client;
}

/**
 * Asserts that the connected MongoDB cluster supports multi-document transactions
 * (Replica Set or mongos sharded cluster). Standalone MongoDB fails closed.
 */
export async function assertTransactionalTopology(candidateClient?: MongoClient): Promise<void> {
  const mongoClient = candidateClient ?? (await getMongoClient());
  await assertDatabaseTransactionalTopology(mongoClient.db('admin'));
}

/** Necessary topology prerequisite only, not proof of transaction permissions or commit health. */
export async function assertDatabaseTransactionalTopology(database: Db): Promise<void> {
  let hello;
  try { hello=await database.command({hello:1},{timeoutMS:2_000}); }
  catch(error:any) {
    // Only older servers lacking hello get the legacy handshake. Permission,
    // timeout and network failures must not be retried as another command.
    if(error?.code!==59&&error?.codeName!=='CommandNotFound')throw error;
    hello=await database.command({isMaster:1},{timeoutMS:2_000});
  }
  const isReplSet = Boolean(hello.setName);
  const isMongos = hello.msg === 'isdbgrid';
  if (!isReplSet && !isMongos) {
    throw new AppError(
      'Financial operations require a transactional MongoDB topology (Replica Set or mongos). Standalone MongoDB is not supported for financial credit transactions.',
      503,
      'TRANSACTIONAL_TOPOLOGY_REQUIRED'
    );
  }
}

export async function closeMongo(force = true): Promise<void> {
  const current = client, pending=pendingClient;
  connectionGeneration++;
  client = null;
  pendingClient=null;
  connecting = null;
  // Close pending handshakes too; their late continuations cannot republish.
  await Promise.all([...new Set([current,pending].filter((value):value is MongoClient=>value!==null))].map(value=>value.close(force)));
}

export async function isMongoHealthy(): Promise<boolean> {
  if (!isMongoConfigured) return false;
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1, maxTimeMS: 2_000 });
    return true;
  } catch {
    return false;
  }
}
