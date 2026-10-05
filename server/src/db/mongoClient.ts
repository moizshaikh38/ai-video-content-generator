import { Db, MongoClient } from 'mongodb';
import { config } from '../config/index.js';
import { AppError } from '../types/index.js';
import { logger } from '../utils/logger.js';

let client: MongoClient | null = null;
let connecting: Promise<Db> | null = null;

export const isMongoConfigured = Boolean(config.mongodbUri && config.mongodbDbName);

export type MongoFailureCategory =
  | 'NETWORK'
  | 'IP_ALLOWLIST'
  | 'AUTH'
  | 'DNS'
  | 'TLS'
  | 'SERVER_SELECTION'
  | 'UNKNOWN';

export interface SafeMongoDiagnostic {
  category: MongoFailureCategory;
  name: string;
  code?: string;
  codeName?: string;
  safeMessage: string;
}

export function diagnoseMongoError(err: unknown): SafeMongoDiagnostic {
  const e = err as any;
  const name = String(e?.name || (e instanceof Error ? e.constructor.name : 'UnknownError'));
  const code = e?.code !== undefined ? String(e.code) : undefined;
  const codeName = e?.codeName !== undefined ? String(e.codeName) : undefined;
  const message = String(e?.message || '');
  const causeMessage = String(e?.cause?.message || '');
  const combined = `${message} ${causeMessage}`.toLowerCase();

  let category: MongoFailureCategory = 'UNKNOWN';

  if (
    combined.includes('tlsv1 alert internal error') ||
    combined.includes('ssl alert number 80') ||
    combined.includes('alert number 80')
  ) {
    category = 'IP_ALLOWLIST';
  } else if (
    combined.includes('ssl routines') ||
    combined.includes('tlsv1') ||
    combined.includes('certificate') ||
    combined.includes('handshake')
  ) {
    category = 'TLS';
  } else if (
    combined.includes('authentication failed') ||
    combined.includes('auth failed') ||
    code === '18' ||
    codeName === 'AuthenticationFailed'
  ) {
    category = 'AUTH';
  } else if (
    combined.includes('enotfound') ||
    combined.includes('querysrv') ||
    combined.includes('servfail') ||
    combined.includes('getaddrinfo')
  ) {
    category = 'DNS';
  } else if (
    name === 'MongoServerSelectionError' ||
    combined.includes('serverselectiontimeout')
  ) {
    category = 'SERVER_SELECTION';
  } else if (
    name === 'MongoNetworkError' ||
    combined.includes('econnrefused') ||
    combined.includes('etimedout') ||
    combined.includes('connect timeout')
  ) {
    category = 'NETWORK';
  }

  let safeMessage = 'Database connection could not be established.';
  if (category === 'IP_ALLOWLIST') {
    safeMessage =
      'Connection was rejected by MongoDB Atlas TLS gateway (SSL alert 80). Common cause: The connecting client / Render IP address is not included in the Atlas Network Access IP allowlist.';
  } else if (category === 'TLS') {
    safeMessage = 'TLS / SSL handshake error during connection negotiation.';
  } else if (category === 'AUTH') {
    safeMessage = 'Authentication failed with the provided MongoDB credentials.';
  } else if (category === 'DNS') {
    safeMessage = 'DNS or SRV record lookup failed for the database host.';
  } else if (category === 'SERVER_SELECTION') {
    safeMessage = 'Server selection timed out while attempting to find an available cluster node.';
  } else if (category === 'NETWORK') {
    safeMessage = 'Network connection timed out or was actively refused.';
  }

  return {
    category,
    name,
    code,
    codeName,
    safeMessage,
  };
}

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
      connectTimeoutMS: 8_000,
      serverSelectionTimeoutMS: 8_000,
    });
    connecting = candidate.connect()
      .then(async () => {
        const db = candidate.db(config.mongodbDbName);
        await db.command({ ping: 1 });
        client = candidate;
        return db;
      })
      .catch(async (err: unknown) => {
        await candidate.close().catch(() => undefined);
        connecting = null;
        const diag = diagnoseMongoError(err);
        logger.error('Database connection failed', {
          errorName: diag.name,
          errorCode: diag.code,
          errorCodeName: diag.codeName,
          category: diag.category,
          diagnostic: diag.safeMessage,
        });
        throw new AppError('Database is unavailable.', 503, 'DATABASE_UNAVAILABLE');
      });
  }
  return connecting;
}

export async function getMongoClient(): Promise<MongoClient> {
  await getMongoDb();
  if (!client) throw new AppError('Database is unavailable.', 503, 'DATABASE_UNAVAILABLE');
  return client;
}

export async function closeMongo(): Promise<void> {
  const current = client;
  client = null;
  connecting = null;
  await current?.close();
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
