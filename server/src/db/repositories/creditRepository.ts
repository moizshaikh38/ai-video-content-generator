import crypto from 'node:crypto';
import { ClientSession, MongoServerError } from 'mongodb';
import { getMongoClient, getMongoDb, assertTransactionalTopology } from '../mongoClient.js';
import {
  CreditWalletRecord,
  CreditTransactionRecord,
  CreditReservationRecord,
  CreditTransactionType,
  CreditBalanceSummary,
  OutboxEventRecord,
  IdempotencyKeyRecord,
  AppError,
} from '../../types/index.js';
import { ConcurrencySlotRepository } from './concurrencySlotRepository.js';
import { logger } from '../../utils/logger.js';

export function getCurrentBillingPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getBillingResetDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * Canonical idempotency identity format: `${encode(user_id)}:${encode(operation_type)}:${encode(client_key)}`
 * Guarantees mathematical injectivity (collision-free) by escaping delimiter characters (: and %).
 * Completely backward-compatible with all standard UUID and alphanumeric identifiers.
 */
export function buildCanonicalIdempotencyKey(
  userId: string,
  operationType: string,
  clientKey: string
): string {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    throw new TypeError('userId must be a non-empty string');
  }
  if (!operationType || typeof operationType !== 'string' || operationType.trim() === '') {
    throw new TypeError('operationType must be a non-empty string');
  }
  if (!clientKey || typeof clientKey !== 'string' || clientKey.trim() === '') {
    throw new TypeError('clientKey must be a non-empty string');
  }

  // Escape ':' and '%' delimiters so no input tuple can generate ambiguous composite keys
  const safeUserId = encodeURIComponent(userId);
  const safeOpType = encodeURIComponent(operationType);
  const safeClientKey = encodeURIComponent(clientKey);

  return `${safeUserId}:${safeOpType}:${safeClientKey}`;
}

/**
 * Inverts buildCanonicalIdempotencyKey to recover the exact original tuple.
 * Strictly validates that the key was produced by buildCanonicalIdempotencyKey and
 * rejects any non-canonical representations (e.g. alternate percent escapes like %41 for A,
 * lowercase escapes, malformed escapes, or empty components).
 */
export function parseCanonicalIdempotencyKey(canonicalKey: string): {
  userId: string;
  operationType: string;
  clientKey: string;
} {
  if (!canonicalKey || typeof canonicalKey !== 'string') {
    throw new TypeError('canonicalKey must be a non-empty string');
  }

  const parts = canonicalKey.split(':');
  if (parts.length !== 3) {
    throw new TypeError(
      `Invalid canonical idempotency key format: expected exactly 3 components separated by ':', received ${parts.length} in '${canonicalKey}'`
    );
  }

  if (parts[0] === '' || parts[1] === '' || parts[2] === '') {
    throw new TypeError(
      `Invalid canonical idempotency key format: components cannot be empty in '${canonicalKey}'`
    );
  }

  let decodedUserId: string;
  let decodedOpType: string;
  let decodedClientKey: string;

  try {
    decodedUserId = decodeURIComponent(parts[0]);
    decodedOpType = decodeURIComponent(parts[1]);
    decodedClientKey = decodeURIComponent(parts[2]);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new TypeError(`Malformed percent-escape sequence in canonical idempotency key '${canonicalKey}': ${detail}`);
  }

  // Strict canonical verification: rebuild key and ensure exact binary match
  const canonicalRebuilt = buildCanonicalIdempotencyKey(decodedUserId, decodedOpType, decodedClientKey);
  if (canonicalRebuilt !== canonicalKey) {
    throw new TypeError(
      `Non-canonical idempotency key representation: '${canonicalKey}' (canonical format is '${canonicalRebuilt}')`
    );
  }

  return {
    userId: decodedUserId,
    operationType: decodedOpType,
    clientKey: decodedClientKey,
  };
}

/**
 * Recursively serializes a JavaScript value into a deterministic canonical JSON string.
 * - Sorts object keys at every nesting level (lexicographically).
 * - Preserves array element order.
 * - Formats null, booleans, strings, finite numbers, and Dates consistently.
 * - Rejects unsupported values (functions, symbols, BigInt), undefined properties/values,
 *   circular references, NaN, and Infinity.
 */
export function canonicalJsonSerialize(value: unknown, seen = new Set<object>()): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    throw new TypeError('Cannot canonically serialize undefined value');
  }

  const type = typeof value;

  if (type === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (type === 'string') {
    return JSON.stringify(value);
  }

  if (type === 'number') {
    if (!Number.isFinite(value as number)) {
      throw new TypeError(`Cannot canonically serialize non-finite number: ${value}`);
    }
    return Object.is(value, -0) ? '0' : String(value);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError('Cannot canonically serialize invalid Date');
    }
    return JSON.stringify(value.toISOString());
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError('Cannot canonically serialize circular reference in array');
    }
    seen.add(value);
    try {
      const items = value.map((item) => canonicalJsonSerialize(item, seen));
      return `[${items.join(',')}]`;
    } finally {
      seen.delete(value);
    }
  }

  if (type === 'object') {
    if (seen.has(value as object)) {
      throw new TypeError('Cannot canonically serialize circular reference in object');
    }
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError(
        `Cannot canonically serialize unsupported object type: ${Object.prototype.toString.call(value)}`
      );
    }
    seen.add(value as object);
    try {
      const keys = Object.keys(value as object).sort();
      const entries = keys.map((key) => {
        const propVal = (value as Record<string, unknown>)[key];
        if (propVal === undefined) {
          throw new TypeError(`Cannot canonically serialize undefined property '${key}'`);
        }
        return `${JSON.stringify(key)}:${canonicalJsonSerialize(propVal, seen)}`;
      });
      return `{${entries.join(',')}}`;
    } finally {
      seen.delete(value as object);
    }
  }

  throw new TypeError(`Cannot canonically serialize unsupported type: ${type}`);
}

/**
 * Computes deterministic canonical SHA-256 hash across all fields that materially affect financial reservations.
 * Uses recursive canonical JSON serialization with key sorting at every nesting depth.
 */
export function computeCanonicalPayloadHash(payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('Payload must be a non-null object');
  }
  const canonicalJson = canonicalJsonSerialize(payload);
  return crypto.createHash('sha256').update(canonicalJson).digest('hex');
}

/**
 * Phase 4B.3 Multi-Document Transaction Coordinator.
 * Strictly asserts transactional topology (Replica Set / mongos). Standalone fails closed.
 * Implements exponential backoff retry for TransientTransactionError and UnknownTransactionCommitResult.
 */
export async function withFinancialTransaction<T>(
  fn: (session: ClientSession) => Promise<T>
): Promise<T> {
  const client = await getMongoClient();
  await assertTransactionalTopology(client);

  const maxAttempts = 5;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    const session = client.startSession();
    try {
      return (await session.withTransaction(async () => fn(session), {
        readPreference: 'primary',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true },
        maxCommitTimeMS: 10_000,
      })) as T;
    } catch (err: any) {
      const isTransient =
        err?.hasErrorLabel?.('TransientTransactionError') ||
        err?.hasErrorLabel?.('UnknownTransactionCommitResult') ||
        err?.code === 112; // WriteConflict

      if (isTransient && attempt < maxAttempts) {
        const backoffMs = Math.min(1000, 50 * Math.pow(2, attempt) + Math.random() * 50);
        logger.warn(`[CreditRepository] Transient transaction conflict on attempt ${attempt}. Retrying in ${Math.round(backoffMs)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw err;
    } finally {
      await session.endSession().catch(() => undefined);
    }
  }

  throw new AppError('Exhausted maximum financial transaction retries.', 500, 'TRANSACTION_RETRY_EXHAUSTED');
}

/**
 * Canonical wallet document allowed fields list (strictly bounded, 16 fields).
 */
export const WALLET_ALLOWED_FIELDS = new Set([
  '_id',
  'id',
  'user_id',
  'workspace_id',
  'available_credits',
  'reserved_credits',
  'lifetime_granted',
  'lifetime_consumed',
  'period_granted',
  'period_consumed',
  'billing_period',
  'reset_date',
  'status',
  'version',
  'created_at',
  'updated_at',
]);

/**
 * Validates that an object conforms strictly to the bounded wallet schema.
 * Rejects unexpected properties, invalid types, negative/out-of-range numbers,
 * NaN, Infinity, and oversized strings.
 */
export function validateWalletDocument(doc: unknown): { valid: boolean; error?: string } {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { valid: false, error: 'Wallet must be a non-null object' };
  }

  const record = doc as Record<string, unknown>;

  // Check for unexpected properties (additionalProperties: false)
  for (const key of Object.keys(record)) {
    if (!WALLET_ALLOWED_FIELDS.has(key)) {
      return { valid: false, error: `Unexpected property '${key}' in wallet document` };
    }
  }

  // Required fields check
  const required = [
    'id', 'user_id', 'available_credits', 'reserved_credits',
    'lifetime_granted', 'lifetime_consumed', 'period_granted', 'period_consumed',
    'billing_period', 'reset_date', 'status', 'version', 'created_at', 'updated_at'
  ];
  for (const field of required) {
    if (record[field] === undefined || record[field] === null) {
      return { valid: false, error: `Missing required field '${field}'` };
    }
  }

  // String bounds
  if (typeof record.id !== 'string' || record.id.length > 36) {
    return { valid: false, error: 'Field id must be a string of at most 36 chars' };
  }
  if (typeof record.user_id !== 'string' || record.user_id.length > 36) {
    return { valid: false, error: 'Field user_id must be a string of at most 36 chars' };
  }
  if (record.workspace_id !== null && record.workspace_id !== undefined) {
    if (typeof record.workspace_id !== 'string' || record.workspace_id.length > 36) {
      return { valid: false, error: 'Field workspace_id must be null or string of at most 36 chars' };
    }
  }
  if (typeof record.billing_period !== 'string' || record.billing_period.length > 7) {
    return { valid: false, error: 'Field billing_period must be a string of at most 7 chars' };
  }
  if (typeof record.reset_date !== 'string' || record.reset_date.length > 30) {
    return { valid: false, error: 'Field reset_date must be a string of at most 30 chars' };
  }

  // Status enum
  if (record.status !== 'active' && record.status !== 'suspended' && record.status !== 'frozen') {
    return { valid: false, error: `Invalid status '${record.status}'. Must be active, suspended, or frozen` };
  }

  // Numeric fields validation: must be safe non-negative integers
  const numericFields = [
    'available_credits', 'reserved_credits',
    'lifetime_granted', 'lifetime_consumed',
    'period_granted', 'period_consumed',
  ];
  for (const field of numericFields) {
    const val = record[field];
    if (typeof val !== 'number' || !Number.isFinite(val) || !Number.isInteger(val) || val < 0 || val > Number.MAX_SAFE_INTEGER) {
      return { valid: false, error: `Field '${field}' must be a non-negative safe integer, got ${val}` };
    }
  }

  // Version: must be safe positive integer >= 1
  const ver = record.version;
  if (typeof ver !== 'number' || !Number.isFinite(ver) || !Number.isInteger(ver) || ver < 1 || ver > Number.MAX_SAFE_INTEGER) {
    return { valid: false, error: `Field 'version' must be a safe integer >= 1, got ${ver}` };
  }

  // Dates
  if (!(record.created_at instanceof Date) || Number.isNaN((record.created_at as Date).getTime())) {
    return { valid: false, error: 'Field created_at must be a valid Date' };
  }
  if (!(record.updated_at instanceof Date) || Number.isNaN((record.updated_at as Date).getTime())) {
    return { valid: false, error: 'Field updated_at must be a valid Date' };
  }

  return { valid: true };
}

export class CreditRepository {
  /**
   * Fetches the user's unified wallet or creates one idempotently if not present.
   */
  public static async getOrCreateWallet(
    userId: string,
    workspaceId?: string | null
  ): Promise<CreditWalletRecord> {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0 || userId.length > 36) {
      throw new AppError('Invalid user_id for wallet lookup/creation.', 400, 'INVALID_USER_ID');
    }
    if (workspaceId !== undefined && workspaceId !== null) {
      if (typeof workspaceId !== 'string' || workspaceId.length > 36) {
        throw new AppError('Invalid workspace_id for wallet.', 400, 'INVALID_WORKSPACE_ID');
      }
    }

    const db = await getMongoDb();
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');

    const existing = await wallets.findOne({ user_id: userId });
    if (existing) {
      return existing;
    }

    const now = new Date();
    const initialWallet: CreditWalletRecord = {
      id: crypto.randomUUID(),
      user_id: userId,
      workspace_id: workspaceId || null,
      available_credits: 0,
      reserved_credits: 0,
      lifetime_granted: 0,
      lifetime_consumed: 0,
      period_granted: 0,
      period_consumed: 0,
      billing_period: getCurrentBillingPeriod(),
      reset_date: getBillingResetDate(),
      status: 'active',
      version: 1,
      created_at: now,
      updated_at: now,
    };

    try {
      await wallets.insertOne(initialWallet);
      return initialWallet;
    } catch (err: any) {
      if (err.code === 11000) {
        // Race condition: another worker created it
        const fetched = await wallets.findOne({ user_id: userId });
        if (fetched) return fetched;
      }
      throw err;
    }
  }

  /**
   * Grants credits to a wallet with strict idempotency and signed 5-delta ledger accounting.
   */
  public static async grantCredits(params: {
    userId: string;
    amount: number;
    type: CreditTransactionType;
    idempotencyKey: string;
    description: string;
    billingPeriod?: string;
    workspaceId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ wallet: CreditWalletRecord; alreadyProcessed: boolean }> {
    const { userId, amount, type, idempotencyKey, description, billingPeriod, workspaceId, metadata } = params;

    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      amount > Number.MAX_SAFE_INTEGER
    ) {
      throw new AppError('Credit grant amount must be a positive safe integer.', 400, 'INVALID_CREDIT_AMOUNT');
    }

    const db = await getMongoDb();
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');

    // 1. Check idempotency
    const existingTx = await transactions.findOne({ idempotency_key: idempotencyKey });
    if (existingTx) {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);
      return { wallet, alreadyProcessed: true };
    }

    return withFinancialTransaction(async (session) => {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);
      const now = new Date();
      const currentPeriod = billingPeriod || getCurrentBillingPeriod();

      const balanceBefore = wallet.available_credits;
      const balanceAfter = balanceBefore + amount;
      const reservedBefore = wallet.reserved_credits;
      const reservedAfter = reservedBefore;

      // 5-Delta Accounting Model
      const isManualAdjPos = type === 'manual_adjustment_positive' || type === 'manual_adjustment';
      const isManualAdjNeg = type === 'manual_adjustment_negative';
      const isCreditExpiry = type === 'credit_expiry' || type === 'expiration';

      const availableDelta = isManualAdjNeg || isCreditExpiry ? -amount : amount;
      const reservedDelta = 0;
      const lifetimeGrantedDelta = isManualAdjPos || isManualAdjNeg || isCreditExpiry ? 0 : amount;
      const lifetimeConsumedDelta = 0;
      const netAdjustmentsDelta = isManualAdjPos ? amount : (isManualAdjNeg ? -amount : (isCreditExpiry ? -amount : 0));

      // Update wallet
      const updateDoc: Record<string, any> = {
        $inc: {
          available_credits: availableDelta,
          period_granted: lifetimeGrantedDelta,
          lifetime_granted: lifetimeGrantedDelta,
          version: 1,
        },
        $set: {
          billing_period: currentPeriod,
          reset_date: getBillingResetDate(),
          updated_at: now,
        },
      };

      await wallets.updateOne({ id: wallet.id }, updateDoc, { session });

      // Insert signed ledger entry
      const txRecord: CreditTransactionRecord = {
        id: crypto.randomUUID(),
        wallet_id: wallet.id,
        user_id: userId,
        workspace_id: workspaceId || null,
        type,
        amount: availableDelta + reservedDelta,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reserved_before: reservedBefore,
        reserved_after: reservedAfter,
        available_delta: availableDelta,
        reserved_delta: reservedDelta,
        lifetime_granted_delta: lifetimeGrantedDelta,
        lifetime_consumed_delta: lifetimeConsumedDelta,
        net_adjustments_delta: netAdjustmentsDelta,
        idempotency_key: idempotencyKey,
        description,
        metadata: metadata || {},
        created_at: now,
      };

      await transactions.insertOne(txRecord, { session });

      const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
      return { wallet: updatedWallet || wallet, alreadyProcessed: false };
    });
  }

  /**
   * Phase 4B.3 Atomic Reservation with Distributed Concurrency Slot Linkage (Transaction 1).
   * Co-creates idempotency key, financial reservation, wallet lock, signed ledger entry, and outbox event.
   */
  public static async reserveCredits(params: {
    userId: string;
    attemptId: string;
    operationId: string;
    amount: number;
    ttlMinutes?: number;
    workerId?: string;
    workspaceId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{
    allowed: boolean;
    idempotent?: boolean;
    reservation?: CreditReservationRecord;
    wallet: CreditWalletRecord;
    errorCode?: string;
    errorMessage?: string;
  }> {
    const { userId, attemptId, operationId, amount, ttlMinutes = 15, workerId, workspaceId, metadata } = params;

    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount < 0 ||
      amount > Number.MAX_SAFE_INTEGER
    ) {
      throw new AppError('Reservation amount must be a non-negative safe integer.', 400, 'INVALID_RESERVATION_AMOUNT');
    }

    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');
    const idempotency = db.collection<IdempotencyKeyRecord>('idempotency_keys');
    const outbox = db.collection<OutboxEventRecord>('outbox_events');

    // 1. Canonical reservation key: "${user_id}:${attempt_id}"
    const canonicalResKey = `${userId}:${attemptId}`;
    const canonicalIdempKey = buildCanonicalIdempotencyKey(userId, operationId, attemptId);
    const incomingPayloadHash = computeCanonicalPayloadHash({
      amount: Number(amount),
      attemptId: String(attemptId),
      metadata: metadata ?? {},
      operationId: String(operationId),
      userId: String(userId),
      workspaceId: workspaceId ?? null,
    });

    // 2. Check Permanent Idempotency Key Record First
    const existingIdemp = await idempotency.findOne({ _id: canonicalIdempKey });
    if (existingIdemp) {
      // 2a. Payload hash mismatch -> HTTP 409
      if (existingIdemp.request_payload_sha256 !== incomingPayloadHash) {
        throw new AppError(
          `Idempotency key collision with different request payload. Key '${attemptId}' was already used for ${operationId} with a different payload.`,
          409,
          'IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD'
        );
      }

      // 2b. Uncertain outcome requiring reconciliation -> HTTP 409
      if (existingIdemp.status === 'reconciliation_required') {
        throw new AppError(
          'Financial transaction outcome is uncertain and currently undergoing automated reconciliation. Please retry shortly.',
          409,
          'RECONCILIATION_IN_PROGRESS'
        );
      }

      // 2c. Existing in_progress or committed reservation
      const existingRes = await reservations.findOne({ _id: canonicalResKey, user_id: userId });
      if (existingRes) {
        const wallet = await this.getOrCreateWallet(userId, workspaceId);
        const isAllowed = existingRes.status === 'active' || existingRes.status === 'reserved' || existingRes.status === 'settled';
        return {
          allowed: isAllowed,
          idempotent: true,
          reservation: existingRes,
          wallet,
        };
      }

      // 2d. Refunded state
      if (existingIdemp.status === 'refunded') {
        const wallet = await this.getOrCreateWallet(userId, workspaceId);
        return {
          allowed: false,
          idempotent: true,
          wallet,
          errorCode: 'RESERVATION_ALREADY_RELEASED',
          errorMessage: `Reservation ${attemptId} was already released or refunded.`,
        };
      }
    }

    // 3. Fallback check on existing reservation (scoped strictly by user_id and canonical _id)
    const existingRes = await reservations.findOne({ _id: canonicalResKey, user_id: userId });
    if (existingRes) {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);
      const isAllowed = existingRes.status === 'active' || existingRes.status === 'reserved' || existingRes.status === 'settled';
      return {
        allowed: isAllowed,
        idempotent: true,
        reservation: existingRes,
        wallet,
      };
    }

    // 0-credit operations: record settled reservation and permanent idempotency record without modifying wallet
    if (amount === 0) {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);
      const now = new Date();
      const zeroRes: CreditReservationRecord = {
        _id: canonicalResKey,
        id: crypto.randomUUID(),
        wallet_id: wallet.id,
        user_id: userId,
        workspace_id: workspaceId || null,
        attempt_id: attemptId,
        operation_id: operationId,
        amount: 0,
        settled_amount: 0,
        refunded_amount: 0,
        status: 'settled',
        expires_at: new Date(now.getTime() + ttlMinutes * 60 * 1000),
        metadata: metadata || {},
        created_at: now,
        updated_at: now,
      };
      await reservations.updateOne(
        { _id: canonicalResKey },
        { $setOnInsert: zeroRes },
        { upsert: true }
      );
      await idempotency.updateOne(
        { _id: canonicalIdempKey },
        {
          $setOnInsert: {
            _id: canonicalIdempKey,
            user_id: userId,
            operation_type: operationId,
            operation_id: operationId,
            client_key: attemptId,
            attempt_id: attemptId,
            request_payload_sha256: incomingPayloadHash,
            status: 'committed',
            created_at: now,
            updated_at: now,
          },
        },
        { upsert: true }
      );
      return { allowed: true, reservation: zeroRes, wallet };
    }

    // 3. Phase 1: Acquire Concurrency Slot (Strict 20-job per-user limit)
    const instanceId = process.env.INSTANCE_ID || `instance_${process.pid}`;
    const slotAcquisition = await ConcurrencySlotRepository.acquireSlot({
      userId,
      attemptId,
      instanceId,
      leaseMs: 15_000,
    });

    if (!slotAcquisition.acquired || !slotAcquisition.slot) {
      const wallet = await this.getOrCreateWallet(userId, workspaceId);
      return {
        allowed: false,
        wallet,
        errorCode: 'CONCURRENCY_LIMIT_EXCEEDED',
        errorMessage: slotAcquisition.error || 'Concurrent job limit reached (20/20 active). Please wait for active jobs to complete.',
      };
    }

    const acquiredSlot = slotAcquisition.slot;

    // 4. Phase 2: Financial Reservation Transaction (Transaction 1)
    try {
      const reservationResult = await withFinancialTransaction(async (session) => {
        const wallet = await this.getOrCreateWallet(userId, workspaceId);

        // Atomic conditional deduction: available_credits must be >= amount
        const updateResult = await wallets.updateOne(
          {
            id: wallet.id,
            available_credits: { $gte: amount },
          },
          {
            $inc: {
              available_credits: -amount,
              reserved_credits: amount,
              version: 1,
            },
            $set: {
              updated_at: new Date(),
            },
          },
          { session }
        );

        if (updateResult.matchedCount === 0) {
          // Insufficient balance
          return { allowed: false, wallet };
        }

        const now = new Date();
        const activeWorkerId = workerId || crypto.randomUUID();
        const leasedUntil = new Date(now.getTime() + 45_000); // 45s heartbeat lease
        const hardDeadlineAt = new Date(now.getTime() + Math.max(ttlMinutes, 15) * 60 * 1000); // 15m hard deadline

        const resRecord: CreditReservationRecord = {
          _id: canonicalResKey,
          id: crypto.randomUUID(),
          wallet_id: wallet.id,
          user_id: userId,
          workspace_id: workspaceId || null,
          attempt_id: attemptId,
          operation_id: operationId,
          amount,
          settled_amount: null,
          refunded_amount: null,
          status: 'reserved',
          worker_id: activeWorkerId,
          worker_fencing_token: 1,
          worker_leased_until: leasedUntil,
          heartbeat_at: now,
          hard_deadline_at: hardDeadlineAt,
          recovery_worker_id: null,
          recovery_fencing_token: 0,
          recovery_claimed_at: null,
          expires_at: leasedUntil,
          metadata: metadata || {},
          created_at: now,
          updated_at: now,
        };

        await reservations.insertOne(resRecord, { session });

        // Signed 5-Delta Ledger Transaction
        const balanceBefore = wallet.available_credits;
        const balanceAfter = balanceBefore - amount;
        const reservedBefore = wallet.reserved_credits;
        const reservedAfter = reservedBefore + amount;

        const txRecord: CreditTransactionRecord = {
          id: crypto.randomUUID(),
          wallet_id: wallet.id,
          user_id: userId,
          workspace_id: workspaceId || null,
          type: 'reservation',
          amount: -amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          reserved_before: reservedBefore,
          reserved_after: reservedAfter,
          available_delta: -amount,
          reserved_delta: amount,
          lifetime_granted_delta: 0,
          lifetime_consumed_delta: 0,
          net_adjustments_delta: 0,
          operation_id: operationId,
          attempt_id: attemptId,
          reservation_id: resRecord.id,
          idempotency_key: `reserve_${attemptId}`,
          description: `Reserved ${amount} credits for ${operationId}`,
          metadata: metadata || {},
          created_at: now,
        };

        await transactions.insertOne(txRecord, { session });

        // Co-create permanent idempotency key record
        const idempotencyDoc: IdempotencyKeyRecord = {
          _id: canonicalIdempKey,
          user_id: userId,
          operation_type: operationId,
          operation_id: operationId,
          client_key: attemptId,
          attempt_id: attemptId,
          request_payload_sha256: incomingPayloadHash,
          status: 'in_progress',
          transaction_id: txRecord.id,
          created_at: now,
          updated_at: now,
        };

        await idempotency.updateOne(
          { _id: canonicalIdempKey },
          { $setOnInsert: idempotencyDoc },
          { upsert: true, session }
        );

        // Co-create outbox event
        const outboxDoc: OutboxEventRecord = {
          _id: `${userId}:${attemptId}:outbox`,
          event_type: 'DISPATCH_CONTENT_PACK_JOB',
          aggregate_type: 'credit_reservation',
          aggregate_id: attemptId,
          user_id: userId,
          payload: { userId, attemptId, operationId, amount, metadata },
          status: 'pending',
          attempts: 0,
          max_attempts: 5,
          next_attempt_at: now,
          created_at: now,
          updated_at: now,
        };

        await outbox.updateOne(
          { _id: outboxDoc._id },
          { $setOnInsert: outboxDoc },
          { upsert: true, session }
        );

        const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
        return {
          allowed: true,
          reservation: resRecord,
          wallet: updatedWallet || wallet,
        };
      });

      if (!reservationResult.allowed) {
        // Insufficient funds: release concurrency slot immediately
        if (acquiredSlot.slot_token) {
          await ConcurrencySlotRepository.releaseSlot({
            slotId: acquiredSlot._id,
            slotToken: acquiredSlot.slot_token,
          });
        }
        return {
          allowed: false,
          wallet: reservationResult.wallet,
          errorCode: 'INSUFFICIENT_CREDITS',
          errorMessage: `Insufficient credits. Required ${amount} credits, but wallet has only ${reservationResult.wallet.available_credits} available.`,
        };
      }

      // Link concurrency slot to committed reservation
      if (acquiredSlot.slot_token && reservationResult.reservation) {
        await ConcurrencySlotRepository.linkReservation({
          slotId: acquiredSlot._id,
          slotToken: acquiredSlot.slot_token,
          reservationId: reservationResult.reservation.id,
          leaseMs: 45_000,
        });
      }

      return reservationResult;
    } catch (txErr: any) {
      // If code 11000 duplicate key, check if this attempt was committed concurrently by another instance
      if (txErr?.code === 11000 || txErr?.message?.includes('E11000')) {
        const recheckIdemp = await idempotency.findOne({ _id: canonicalIdempKey, user_id: userId });
        if (recheckIdemp) {
          if (recheckIdemp.request_payload_sha256 !== incomingPayloadHash) {
            if (acquiredSlot.slot_token) {
              await ConcurrencySlotRepository.releaseSlot({
                slotId: acquiredSlot._id,
                slotToken: acquiredSlot.slot_token,
              }).catch(() => undefined);
            }
            throw new AppError(
              `Idempotency key collision with different request payload. Key '${attemptId}' was already used for ${operationId} with a different payload.`,
              409,
              'IDEMPOTENCY_KEY_COLLISION_WITH_DIFFERENT_PAYLOAD'
            );
          }
          const recheck = await reservations.findOne({ _id: canonicalResKey, user_id: userId });
          if (recheck) {
            const wallet = await this.getOrCreateWallet(userId, workspaceId);
            if (acquiredSlot.slot_token) {
              await ConcurrencySlotRepository.releaseSlot({
                slotId: acquiredSlot._id,
                slotToken: acquiredSlot.slot_token,
              }).catch(() => undefined);
            }
            return {
              allowed: true,
              idempotent: true,
              reservation: recheck,
              wallet,
            };
          }
        }
      }

      // Transaction aborted: release concurrency slot
      if (acquiredSlot.slot_token) {
        await ConcurrencySlotRepository.releaseSlot({
          slotId: acquiredSlot._id,
          slotToken: acquiredSlot.slot_token,
        }).catch(() => undefined);
      }
      throw txErr;
    }
  }

  /**
   * Phase 4B.3 Dynamic Worker Heartbeat.
   * Clamps lease extension to hard deadline using valid aggregation pipeline arithmetic.
   */
  public static async pulseHeartbeat(params: {
    userId: string;
    attemptId: string;
    workerId: string;
    expectedFencingToken: number;
    slotId?: string;
    slotToken?: string;
  }): Promise<{ success: boolean }> {
    const { userId, attemptId, workerId, expectedFencingToken, slotId, slotToken } = params;
    const db = await getMongoDb();
    const canonicalKey = `${userId}:${attemptId}`;
    const now = new Date();

    const result = await db.collection<CreditReservationRecord>('credit_reservations').updateOne(
      {
        $and: [
          { $or: [{ _id: canonicalKey }, { attempt_id: attemptId }] },
          { status: { $in: ['active', 'reserved'] } },
          { $or: [{ worker_id: workerId }, { worker_id: null }] },
          { $or: [{ worker_fencing_token: expectedFencingToken }, { worker_fencing_token: { $exists: false } }] },
          { hard_deadline_at: { $gt: now } },
        ],
      },
      [
        {
          $set: {
            heartbeat_at: '$$NOW',
            worker_leased_until: {
              $min: [{ $add: ['$$NOW', 45_000] }, '$hard_deadline_at'],
            },
            expires_at: {
              $min: [{ $add: ['$$NOW', 45_000] }, '$hard_deadline_at'],
            },
            updated_at: '$$NOW',
          },
        },
      ]
    );

    if (result.matchedCount === 1 && slotId && slotToken) {
      await ConcurrencySlotRepository.renewLease({ slotId, slotToken, leaseMs: 45_000 });
      return { success: true };
    }

    return { success: result.matchedCount === 1 };
  }

  /**
   * Atomically extends an existing reservation if actual/measured usage exceeds provisional estimate.
   */
  public static async extendReservation(params: {
    attemptId: string;
    additionalAmount: number;
    reason?: string;
  }): Promise<{
    allowed: boolean;
    reservation?: CreditReservationRecord;
    wallet?: CreditWalletRecord;
    errorCode?: string;
    errorMessage?: string;
  }> {
    const { attemptId, additionalAmount, reason = 'Measured duration extension' } = params;
    if (
      typeof additionalAmount !== 'number' ||
      !Number.isFinite(additionalAmount) ||
      !Number.isInteger(additionalAmount) ||
      additionalAmount < 0 ||
      additionalAmount > Number.MAX_SAFE_INTEGER
    ) {
      throw new AppError('Extension amount must be a non-negative safe integer.', 400, 'INVALID_RESERVATION_AMOUNT');
    }
    if (additionalAmount === 0) {
      return { allowed: true };
    }

    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');

    const reservation = await reservations.findOne({ attempt_id: attemptId });
    if (!reservation) {
      return { allowed: false, errorCode: 'RESERVATION_NOT_FOUND', errorMessage: `Reservation not found for attempt ${attemptId}` };
    }

    if (reservation.status !== 'reserved' && reservation.status !== 'active') {
      return { allowed: false, errorCode: 'INVALID_RESERVATION_STATE', errorMessage: `Reservation is in ${reservation.status} state, cannot extend` };
    }

    return withFinancialTransaction(async (session) => {
      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);

      const updateResult = await wallets.updateOne(
        {
          id: wallet.id,
          available_credits: { $gte: additionalAmount },
        },
        {
          $inc: {
            available_credits: -additionalAmount,
            reserved_credits: additionalAmount,
            version: 1,
          },
          $set: {
            updated_at: new Date(),
          },
        },
        { session }
      );

      if (updateResult.matchedCount === 0) {
        return {
          allowed: false,
          wallet,
          errorCode: 'INSUFFICIENT_CREDITS',
          errorMessage: `Insufficient credits to extend reservation. Need ${additionalAmount} more credits, but only ${wallet.available_credits} available.`,
        };
      }

      const now = new Date();
      await reservations.updateOne(
        { _id: reservation._id || `${reservation.user_id}:${attemptId}` },
        {
          $inc: { amount: additionalAmount },
          $set: { updated_at: now },
        },
        { session }
      );

      const balanceBefore = wallet.available_credits;
      const balanceAfter = balanceBefore - additionalAmount;
      const reservedBefore = wallet.reserved_credits;
      const reservedAfter = reservedBefore + additionalAmount;

      const txRecord: CreditTransactionRecord = {
        id: crypto.randomUUID(),
        wallet_id: wallet.id,
        user_id: reservation.user_id,
        workspace_id: reservation.workspace_id || null,
        type: 'reservation',
        amount: 0,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reserved_before: reservedBefore,
        reserved_after: reservedAfter,
        available_delta: -additionalAmount,
        reserved_delta: additionalAmount,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: 0,
        net_adjustments_delta: 0,
        operation_id: reservation.operation_id,
        reference_id: attemptId,
        attempt_id: attemptId,
        reservation_id: reservation.id,
        idempotency_key: `reserve_extend_${attemptId}_${Date.now()}`,
        description: `Extended reservation by ${additionalAmount} credits: ${reason}`,
        metadata: { additionalAmount, reason },
        created_at: now,
      };

      await transactions.insertOne(txRecord, { session });

      const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
      const updatedReservation = await reservations.findOne({ _id: reservation._id || `${reservation.user_id}:${attemptId}` }, { session });

      return {
        allowed: true,
        reservation: updatedReservation || reservation,
        wallet: updatedWallet || wallet,
      };
    });
  }

  /**
   * Phase 4B.3 10-Step Atomic Settlement Transaction (Transaction 2).
   * Validates amounts, updates reservation, wallet, signed consumption ledger, and idempotency status atomically.
   */
  public static async settleReservation(
    attemptId: string,
    actualAmount?: number,
    metadata?: Record<string, unknown>,
    fencingParams?: { workerId?: string; expectedFencingToken?: number; slotId?: string; slotToken?: string }
  ): Promise<{
    idempotent?: boolean;
    settledAmount: number;
    reservation: CreditReservationRecord;
    wallet: CreditWalletRecord;
  }> {
    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');
    const idempotency = db.collection<IdempotencyKeyRecord>('idempotency_keys');

    const reservation = await reservations.findOne({ attempt_id: attemptId });
    if (!reservation) {
      throw new AppError(`Reservation not found for attempt ${attemptId}`, 404, 'RESERVATION_NOT_FOUND');
    }

    const canonicalIdempKey = buildCanonicalIdempotencyKey(reservation.user_id, reservation.operation_id, attemptId);

    // Strict Idempotency Record Pre-Check: Do NOT allow missing or inconsistent idempotency records
    const preCheckIdemp = await idempotency.findOne({ _id: canonicalIdempKey, user_id: reservation.user_id });
    if (!preCheckIdemp) {
      throw new AppError(`Idempotency record missing for reservation attempt ${attemptId}. Settlement aborted for financial consistency.`, 409, 'IDEMPOTENCY_RECORD_MISSING');
    }

    if (reservation.status === 'settled') {
      if (preCheckIdemp.status !== 'committed') {
        throw new AppError(`Reservation is settled but idempotency record status is '${preCheckIdemp.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
      }
      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
      return {
        idempotent: true,
        settledAmount: reservation.settled_amount ?? reservation.amount,
        reservation,
        wallet,
      };
    }

    if (reservation.status === 'released' || reservation.status === 'refunded') {
      throw new AppError(`Cannot settle reservation ${attemptId} because it was already released or refunded.`, 409, 'RESERVATION_ALREADY_RELEASED');
    }

    if (preCheckIdemp.status === 'committed') {
      throw new AppError(`Idempotency record is committed but reservation status is '${reservation.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
    }

    if (preCheckIdemp.status === 'refunded') {
      throw new AppError(`Cannot settle reservation ${attemptId} because idempotency record was already refunded.`, 409, 'RESERVATION_ALREADY_RELEASED');
    }

    if (preCheckIdemp.status === 'reconciliation_required') {
      throw new AppError(`Reservation ${attemptId} is flagged for reconciliation. Settlement rejected.`, 409, 'RECONCILIATION_IN_PROGRESS');
    }

    if (preCheckIdemp.status !== 'in_progress') {
      throw new AppError(`Invalid idempotency record status '${preCheckIdemp.status}' for settlement.`, 409, 'INVALID_IDEMPOTENCY_STATE');
    }

    // Amount validation: 0 <= settledAmount <= reservedAmount
    const rawSettled = actualAmount !== undefined ? Number(actualAmount) : reservation.amount;
    if (
      typeof rawSettled !== 'number' ||
      !Number.isFinite(rawSettled) ||
      !Number.isInteger(rawSettled) ||
      rawSettled < 0 ||
      rawSettled > Number.MAX_SAFE_INTEGER
    ) {
      throw new AppError(`Settled amount must be a non-negative safe integer: ${rawSettled}`, 400, 'INVALID_SETTLEMENT_AMOUNT');
    }

    const settledAmount = Math.min(reservation.amount, rawSettled);
    const unusedCredits = reservation.amount - settledAmount;

    const canonicalKey = reservation._id || `${reservation.user_id}:${attemptId}`;

    return withFinancialTransaction(async (session) => {
      const now = new Date();

      // 1. Strict intra-transaction idempotency validation under session lock
      const idempRecord = await idempotency.findOne({ _id: canonicalIdempKey, user_id: reservation.user_id }, { session });
      if (!idempRecord) {
        throw new AppError(`Idempotency record missing during settlement. Financial operation aborted.`, 409, 'IDEMPOTENCY_RECORD_MISSING');
      }

      if (idempRecord.status === 'committed') {
        const recheck = await reservations.findOne({ _id: canonicalKey }, { session });
        if (recheck?.status === 'settled') {
          const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
          return {
            idempotent: true,
            settledAmount: recheck.settled_amount ?? settledAmount,
            reservation: recheck,
            wallet,
          };
        }
        throw new AppError(`Idempotency record is committed but reservation status is '${recheck?.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
      }

      if (idempRecord.status === 'refunded') {
        throw new AppError(`Cannot settle reservation ${attemptId} because idempotency record was already refunded.`, 409, 'RESERVATION_ALREADY_RELEASED');
      }

      if (idempRecord.status === 'reconciliation_required') {
        throw new AppError(`Reservation ${attemptId} is flagged for reconciliation. Settlement rejected.`, 409, 'RECONCILIATION_IN_PROGRESS');
      }

      if (idempRecord.status !== 'in_progress') {
        throw new AppError(`Invalid idempotency record status '${idempRecord.status}' for settlement.`, 409, 'INVALID_IDEMPOTENCY_STATE');
      }

      // 2. Verify active status and worker fencing token inside transaction
      const updateFilter: Record<string, any> = {
        _id: canonicalKey,
        status: { $in: ['active', 'reserved'] },
      };

      if (fencingParams?.workerId) {
        updateFilter.$or = [{ worker_id: fencingParams.workerId }, { worker_id: null }];
      }
      if (fencingParams?.expectedFencingToken) {
        updateFilter.$or = [{ worker_fencing_token: fencingParams.expectedFencingToken }, { worker_fencing_token: { $exists: false } }];
      }

      const updateResResult = await reservations.updateOne(
        updateFilter,
        {
          $set: {
            status: 'settled',
            settled_amount: settledAmount,
            refunded_amount: unusedCredits,
            updated_at: now,
          },
        },
        { session }
      );

      if (updateResResult.matchedCount === 0) {
        // Lost race or superseded fence
        const recheck = await reservations.findOne({ _id: canonicalKey }, { session });
        if (recheck?.status === 'settled') {
          const recheckIdemp = await idempotency.findOne({ _id: canonicalIdempKey, user_id: reservation.user_id }, { session });
          if (recheckIdemp?.status === 'committed') {
            const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
            return {
              idempotent: true,
              settledAmount: recheck.settled_amount ?? settledAmount,
              reservation: recheck,
              wallet,
            };
          }
          throw new AppError(`Reservation is settled but idempotency record status is '${recheckIdemp?.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
        }
        if (recheck?.status === 'released' || recheck?.status === 'refunded') {
          throw new AppError(`Cannot settle reservation ${attemptId} because it was released or refunded.`, 409, 'RESERVATION_ALREADY_RELEASED');
        }
        throw new AppError('Reservation is no longer active or worker fencing token was superseded.', 409, 'STALE_WORKER_FENCE_LOST');
      }

      // 6 & 7. Mutate wallet balances & consumption metrics
      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
      await wallets.updateOne(
        { id: wallet.id, reserved_credits: { $gte: reservation.amount } },
        {
          $inc: {
            reserved_credits: -reservation.amount,
            available_credits: unusedCredits,
            period_consumed: settledAmount,
            lifetime_consumed: settledAmount,
            version: 1,
          },
          $set: {
            updated_at: now,
          },
        },
        { session }
      );

      const balanceBefore = wallet.available_credits;
      const balanceAfter = balanceBefore + unusedCredits;
      const reservedBefore = wallet.reserved_credits;
      const reservedAfter = reservedBefore - reservation.amount;

      // 8. Insert signed ledger transaction
      const txRecord: CreditTransactionRecord = {
        id: crypto.randomUUID(),
        wallet_id: wallet.id,
        user_id: reservation.user_id,
        workspace_id: reservation.workspace_id || null,
        type: 'consumption',
        amount: settledAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reserved_before: reservedBefore,
        reserved_after: reservedAfter,
        available_delta: unusedCredits,
        reserved_delta: -reservation.amount,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: settledAmount,
        net_adjustments_delta: 0,
        operation_id: reservation.operation_id,
        reference_id: attemptId,
        attempt_id: attemptId,
        reservation_id: reservation.id,
        idempotency_key: `settle_${attemptId}`,
        description: `Settled ${settledAmount} credits for ${reservation.operation_id}${unusedCredits > 0 ? ` (${unusedCredits} unused credits refunded)` : ''}`,
        metadata: { ...(metadata || {}), original_reserved: reservation.amount, refund_unused: unusedCredits, is_partial: unusedCredits > 0 },
        created_at: now,
      };

      await transactions.insertOne(txRecord, { session });

      // 9. Update idempotency state to committed: strict update, NO upsert, require matchedCount === 1
      const idempUpdate = await idempotency.updateOne(
        { _id: canonicalIdempKey, user_id: reservation.user_id, status: 'in_progress' },
        {
          $set: {
            status: 'committed',
            transaction_id: txRecord.id,
            updated_at: now,
          },
        },
        { session }
      );

      if (idempUpdate.matchedCount === 0) {
        throw new AppError('Idempotency update conflict during settlement. Aborted.', 409, 'IDEMPOTENCY_UPDATE_CONFLICT');
      }

      // Post-commit: release concurrency slot if provided
      if (fencingParams?.slotId && fencingParams?.slotToken) {
        await ConcurrencySlotRepository.releaseSlot({
          slotId: fencingParams.slotId,
          slotToken: fencingParams.slotToken,
        }).catch(() => undefined);
      }

      const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
      const updatedReservation = await reservations.findOne({ _id: canonicalKey }, { session });

      return {
        settledAmount,
        reservation: updatedReservation || reservation,
        wallet: updatedWallet || wallet,
      };
    });
  }

  /**
   * Phase 4B.3 Atomic Recovery Refund Protocol.
   * Restores exact numeric credits, sets status to refunded/released, and logs signed refund ledger entry.
   */
  public static async releaseReservation(
    attemptId: string,
    reason: string,
    fencingParams?: { recoveryWorkerId?: string; recoveryToken?: number; slotId?: string; slotToken?: string }
  ): Promise<{
    idempotent?: boolean;
    releasedAmount: number;
    reservation: CreditReservationRecord;
    wallet: CreditWalletRecord;
  }> {
    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');
    const wallets = db.collection<CreditWalletRecord>('credit_wallets');
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');
    const idempotency = db.collection<IdempotencyKeyRecord>('idempotency_keys');

    const reservation = await reservations.findOne({ attempt_id: attemptId });
    if (!reservation) {
      throw new AppError(`Reservation not found for attempt ${attemptId}`, 404, 'RESERVATION_NOT_FOUND');
    }

    const canonicalIdempKey = buildCanonicalIdempotencyKey(reservation.user_id, reservation.operation_id, attemptId);

    // Strict Idempotency Record Pre-Check: Do NOT allow missing or inconsistent idempotency records
    const preCheckIdemp = await idempotency.findOne({ _id: canonicalIdempKey, user_id: reservation.user_id });
    if (!preCheckIdemp) {
      throw new AppError(`Idempotency record missing for reservation attempt ${attemptId}. Refund aborted for financial consistency.`, 409, 'IDEMPOTENCY_RECORD_MISSING');
    }

    if (reservation.status === 'released' || reservation.status === 'refunded') {
      if (preCheckIdemp.status !== 'refunded') {
        throw new AppError(`Reservation is released/refunded but idempotency record status is '${preCheckIdemp.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
      }
      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
      return {
        idempotent: true,
        releasedAmount: reservation.amount,
        reservation,
        wallet,
      };
    }

    if (reservation.status === 'settled') {
      throw new AppError(`Cannot release reservation ${attemptId} because it has already been settled.`, 409, 'RESERVATION_ALREADY_SETTLED');
    }

    if (preCheckIdemp.status === 'refunded') {
      throw new AppError(`Idempotency record is refunded but reservation status is '${reservation.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
    }

    if (preCheckIdemp.status === 'committed') {
      throw new AppError(`Idempotency record is committed but reservation status is '${reservation.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
    }

    if (preCheckIdemp.status === 'reconciliation_required') {
      throw new AppError(`Reservation ${attemptId} is flagged for reconciliation. Refund rejected.`, 409, 'RECONCILIATION_IN_PROGRESS');
    }

    if (preCheckIdemp.status !== 'in_progress') {
      throw new AppError(`Invalid idempotency record status '${preCheckIdemp.status}' for refund.`, 409, 'INVALID_IDEMPOTENCY_STATE');
    }

    const canonicalKey = reservation._id || `${reservation.user_id}:${attemptId}`;

    return withFinancialTransaction(async (session) => {
      const now = new Date();

      // 1. Strict intra-transaction idempotency validation under session lock
      const idempRecord = await idempotency.findOne({ _id: canonicalIdempKey, user_id: reservation.user_id }, { session });
      if (!idempRecord) {
        throw new AppError(`Idempotency record missing during refund. Financial operation aborted.`, 409, 'IDEMPOTENCY_RECORD_MISSING');
      }

      if (idempRecord.status === 'refunded') {
        const recheck = await reservations.findOne({ _id: canonicalKey }, { session });
        if (recheck?.status === 'released' || recheck?.status === 'refunded') {
          const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
          return {
            idempotent: true,
            releasedAmount: recheck.refunded_amount ?? recheck.amount ?? reservation.amount,
            reservation: recheck,
            wallet,
          };
        }
        throw new AppError(`Idempotency record is refunded but reservation status is '${recheck?.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
      }

      if (idempRecord.status === 'committed') {
        const recheck = await reservations.findOne({ _id: canonicalKey }, { session });
        if (recheck?.status === 'settled') {
          throw new AppError(`Cannot release reservation ${attemptId} because it has already been settled.`, 409, 'RESERVATION_ALREADY_SETTLED');
        }
        throw new AppError(`Idempotency record is committed but reservation status is '${recheck?.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
      }

      if (idempRecord.status === 'reconciliation_required') {
        throw new AppError(`Reservation ${attemptId} is flagged for reconciliation. Refund rejected.`, 409, 'RECONCILIATION_IN_PROGRESS');
      }

      if (idempRecord.status !== 'in_progress') {
        throw new AppError(`Invalid idempotency record status '${idempRecord.status}' for refund.`, 409, 'INVALID_IDEMPOTENCY_STATE');
      }

      // Atomically update reservation status to refunded/released
      const updateFilter: Record<string, any> = {
        _id: canonicalKey,
        status: { $in: ['active', 'reserved', 'recovering'] },
      };

      if (fencingParams?.recoveryWorkerId) {
        updateFilter.$or = [{ recovery_worker_id: fencingParams.recoveryWorkerId }, { recovery_worker_id: null }];
      }

      const updateResResult = await reservations.updateOne(
        updateFilter,
        {
          $set: {
            status: 'released',
            refunded_amount: reservation.amount,
            settled_amount: 0,
            updated_at: now,
          },
        },
        { session }
      );

      if (updateResResult.matchedCount === 0) {
        const recheck = await reservations.findOne({ _id: canonicalKey }, { session });
        if (recheck?.status === 'released' || recheck?.status === 'refunded') {
          const recheckIdemp = await idempotency.findOne({ _id: canonicalIdempKey, user_id: reservation.user_id }, { session });
          if (recheckIdemp?.status === 'refunded') {
            const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);
            return {
              idempotent: true,
              releasedAmount: recheck?.refunded_amount ?? recheck?.amount ?? reservation.amount,
              reservation: recheck,
              wallet,
            };
          }
          throw new AppError(`Reservation is released/refunded but idempotency record status is '${recheckIdemp?.status}'. Reconciliation required.`, 409, 'STATE_MISMATCH_RECONCILIATION_REQUIRED');
        }
        if (recheck?.status === 'settled') {
          throw new AppError(`Cannot release reservation ${attemptId} because it was settled concurrently.`, 409, 'RESERVATION_ALREADY_SETTLED');
        }
        throw new AppError('Reservation is no longer recoverable or worker fencing was lost.', 409, 'STALE_RECOVERY_FENCE_LOST');
      }

      const wallet = await this.getOrCreateWallet(reservation.user_id, reservation.workspace_id);

      // Refund reserved credits back to available balance
      await wallets.updateOne(
        { id: wallet.id, reserved_credits: { $gte: reservation.amount } },
        {
          $inc: {
            reserved_credits: -reservation.amount,
            available_credits: reservation.amount,
            version: 1,
          },
          $set: {
            updated_at: now,
          },
        },
        { session }
      );

      const balanceBefore = wallet.available_credits;
      const balanceAfter = balanceBefore + reservation.amount;
      const reservedBefore = wallet.reserved_credits;
      const reservedAfter = reservedBefore - reservation.amount;

      // Signed 5-Delta Refund Ledger Transaction
      const txRecord: CreditTransactionRecord = {
        id: crypto.randomUUID(),
        wallet_id: wallet.id,
        user_id: reservation.user_id,
        workspace_id: reservation.workspace_id || null,
        type: 'reservation_release',
        amount: reservation.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        reserved_before: reservedBefore,
        reserved_after: reservedAfter,
        available_delta: reservation.amount,
        reserved_delta: -reservation.amount,
        lifetime_granted_delta: 0,
        lifetime_consumed_delta: 0,
        net_adjustments_delta: 0,
        operation_id: reservation.operation_id,
        reference_id: attemptId,
        attempt_id: attemptId,
        reservation_id: reservation.id,
        idempotency_key: `refund_${attemptId}`,
        description: `Refunded ${reservation.amount} reserved credits: ${reason}`,
        metadata: { reason },
        created_at: now,
      };

      await transactions.insertOne(txRecord, { session });

      // Update idempotency state to refunded: strict update, NO upsert, require matchedCount === 1
      const idempUpdate = await idempotency.updateOne(
        { _id: canonicalIdempKey, user_id: reservation.user_id, status: 'in_progress' },
        {
          $set: {
            status: 'refunded',
            transaction_id: txRecord.id,
            updated_at: now,
          },
        },
        { session }
      );

      if (idempUpdate.matchedCount === 0) {
        throw new AppError('Idempotency update conflict during refund. Aborted.', 409, 'IDEMPOTENCY_UPDATE_CONFLICT');
      }

      // Post-commit: release concurrency slot if provided
      if (fencingParams?.slotId && fencingParams?.slotToken) {
        await ConcurrencySlotRepository.releaseSlot({
          slotId: fencingParams.slotId,
          slotToken: fencingParams.slotToken,
        }).catch(() => undefined);
      }

      const updatedWallet = await wallets.findOne({ id: wallet.id }, { session });
      const updatedReservation = await reservations.findOne({ _id: canonicalKey }, { session });

      return {
        releasedAmount: reservation.amount,
        reservation: updatedReservation || reservation,
        wallet: updatedWallet || wallet,
      };
    });
  }

  /**
   * Scans and recovers expired reservations orphaned by worker crashes or timeouts.
   * If associated job is actively running, extends lease; otherwise executes recovery refund.
   */
  public static async recoverExpiredReservations(): Promise<number> {
    const db = await getMongoDb();
    const reservations = db.collection<CreditReservationRecord>('credit_reservations');
    const idempotency = db.collection<IdempotencyKeyRecord>('idempotency_keys');
    const now = new Date();

    const expiredList = await reservations
      .find({
        status: { $in: ['active', 'reserved', 'recovering'] },
        $or: [
          { worker_leased_until: { $lt: now } },
          { expires_at: { $lt: now } },
          { hard_deadline_at: { $lte: now } },
        ],
      })
      .limit(50)
      .toArray();

    let recovered = 0;
    const sweeperId = `sweeper_${process.pid}`;

    for (const item of expiredList) {
      try {
        // If hard deadline reached, must refund unconditionally
        const isPastHardDeadline = item.hard_deadline_at && item.hard_deadline_at <= now;
        if (isPastHardDeadline) {
          await this.releaseReservation(item.attempt_id, 'Hard deadline exceeded (15m ceiling)', {
            recoveryWorkerId: sweeperId,
          });
          recovered++;
          continue;
        }

        // Check if associated job/project is actively running; if so, extend lease instead of releasing
        let isJobActive = false;
        const activeProjectStatuses = ['uploaded', 'processing', 'transcribing', 'analyzing', 'rendering'];
        const staleProjectCutoff = new Date(now.getTime() - 60 * 60 * 1000);

        if (item.metadata?.projectId && typeof item.metadata.projectId === 'string') {
          const project = await db.collection('projects').findOne({
            id: item.metadata.projectId,
            video_status: { $in: activeProjectStatuses },
          });
          if (project) {
            const lastUpdated = project.updated_at
              ? new Date(project.updated_at)
              : (project.created_at ? new Date(project.created_at) : null);
            if (lastUpdated && lastUpdated >= staleProjectCutoff) {
              isJobActive = true;
            }
          }
        }

        if (isJobActive) {
          logger.info(`[CreditRepository] Reservation ${item.attempt_id} expired but associated job is still active; extending expiration by 30 minutes.`);
          await reservations.updateOne(
            { _id: item._id || `${item.user_id}:${item.attempt_id}` },
            { $set: { expires_at: new Date(now.getTime() + 30 * 60 * 1000), updated_at: now } }
          );
          continue;
        }

        // Claim recovery status atomically
        const claimResult = await reservations.updateOne(
          {
            _id: item._id || `${item.user_id}:${item.attempt_id}`,
            status: { $in: ['active', 'reserved'] },
          },
          {
            $set: {
              status: 'recovering',
              recovery_worker_id: sweeperId,
              recovery_claimed_at: now,
              updated_at: now,
            },
            $inc: { recovery_fencing_token: 1 },
          }
        );

        if (claimResult.matchedCount === 1) {
          await this.releaseReservation(item.attempt_id, 'Automatic recovery of expired worker lease', {
            recoveryWorkerId: sweeperId,
          });
          recovered++;
        }
      } catch (err: any) {
        logger.error(`[CreditRepository] Error recovering reservation ${item.attempt_id}: ${err.message}`);
        const code = err?.code || err?.errorCode;

        // If the reservation was already settled or released concurrently, this is a clean terminal state, NOT an inconsistency!
        if (
          code === 'RESERVATION_ALREADY_SETTLED' ||
          code === 'RESERVATION_ALREADY_RELEASED' ||
          code === 'STALE_RECOVERY_FENCE_LOST'
        ) {
          logger.info(`[CreditRepository] Reservation ${item.attempt_id} reached terminal state (${code}) during recovery; skipping reconciliation.`);
          continue;
        }

        // Only genuine consistency failures (missing idempotency record or state mismatch) are flagged for reconciliation.
        // Protected by a financial transaction and conditional filter to ensure terminal states are NEVER overwritten.
        if (
          code === 'IDEMPOTENCY_RECORD_MISSING' ||
          code === 'STATE_MISMATCH_RECONCILIATION_REQUIRED' ||
          code === 'RECONCILIATION_IN_PROGRESS'
        ) {
          await withFinancialTransaction(async (session) => {
            const canonicalResKey = item._id || `${item.user_id}:${item.attempt_id}`;
            const currentRes = await reservations.findOne({ _id: canonicalResKey }, { session });

            // Invariant guard: Never overwrite a terminal state (settled, released, refunded)
            if (
              !currentRes ||
              currentRes.status === 'settled' ||
              currentRes.status === 'released' ||
              currentRes.status === 'refunded'
            ) {
              return;
            }

            // Strictly conditional: only update if still in active/reserved/recovering state
            const updateRes = await reservations.updateOne(
              {
                _id: canonicalResKey,
                status: { $in: ['active', 'reserved', 'recovering'] },
              },
              {
                $set: {
                  status: 'reconciliation_required',
                  reconciliation_reason: err.message,
                  updated_at: new Date(),
                },
              },
              { session }
            );

            // Conditionally flag idempotency record if present and non-terminal
            if (updateRes.matchedCount === 1) {
              const canonicalIdempKey = buildCanonicalIdempotencyKey(item.user_id, item.operation_id, item.attempt_id);
              const idempUpdateRes = await idempotency.updateOne(
                {
                  _id: canonicalIdempKey,
                  user_id: item.user_id,
                  status: 'in_progress',
                },
                {
                  $set: {
                    status: 'reconciliation_required',
                    updated_at: new Date(),
                  },
                },
                { session }
              );

              // matchedCount === 0 is EXPECTED and correct in all three reconciliation trigger cases:
              //
              // 1. IDEMPOTENCY_RECORD_MISSING:  The record literally does not exist.
              //    The filter { _id: ..., status: 'in_progress' } correctly matches 0.
              //    This is WHY we are flagging for reconciliation — the reservation IS the critical
              //    safety action. Aborting would leave the reservation stuck in 'recovering' forever.
              //
              // 2. STATE_MISMATCH_RECONCILIATION_REQUIRED:  The record exists but has a terminal
              //    status ('committed' or 'refunded'). The filter status: 'in_progress' correctly
              //    matches 0.  We intentionally do NOT overwrite a terminal idempotency status.
              //
              // 3. RECONCILIATION_IN_PROGRESS:  The record is already 'reconciliation_required'.
              //    The filter status: 'in_progress' correctly matches 0.  Already flagged.
              //
              // In ALL cases: the reservation update to 'reconciliation_required' is the primary
              // safety action. The idempotency update is best-effort within the same transaction.
              // We log the outcome for observability but do NOT abort the transaction.
              if (idempUpdateRes.matchedCount === 0) {
                // Distinguish missing vs terminal for operational observability
                const existingIdemp = await idempotency.findOne(
                  { _id: canonicalIdempKey, user_id: item.user_id },
                  { session, projection: { status: 1 } }
                );
                if (!existingIdemp) {
                  logger.warn(
                    `[CreditRepository] Reconciliation: idempotency record missing for reservation ${item.attempt_id}. ` +
                    `Reservation flagged as reconciliation_required. Idempotency record was not created (expected for IDEMPOTENCY_RECORD_MISSING trigger).`
                  );
                } else {
                  logger.warn(
                    `[CreditRepository] Reconciliation: idempotency record for reservation ${item.attempt_id} ` +
                    `has status '${existingIdemp.status}' (not 'in_progress'). ` +
                    `Reservation flagged as reconciliation_required. Idempotency record preserved in current state.`
                  );
                }
              } else {
                logger.info(
                  `[CreditRepository] Reconciliation: both reservation and idempotency record for ${item.attempt_id} ` +
                  `flagged as reconciliation_required.`
                );
              }
            }
          }).catch((recErr: any) => {
            logger.error(`[CreditRepository] Failed to flag reservation ${item.attempt_id} for reconciliation: ${recErr.message}`);
          });
        }
      }
    }

    return recovered;
  }

  /**
   * Retrieves full balance summary for a user.
   */
  public static async getBalanceSummary(
    userId: string,
    isUnlimited = false
  ): Promise<CreditBalanceSummary> {
    const wallet = await this.getOrCreateWallet(userId);

    return {
      wallet_id: wallet.id,
      user_id: wallet.user_id,
      workspace_id: wallet.workspace_id,
      available_credits: wallet.available_credits,
      reserved_credits: wallet.reserved_credits,
      total_balance: wallet.available_credits + wallet.reserved_credits,
      period_granted: wallet.period_granted,
      period_consumed: wallet.period_consumed,
      billing_period: wallet.billing_period,
      reset_date: wallet.reset_date,
      status: wallet.status,
      is_unlimited: isUnlimited,
    };
  }

  /**
   * Fetches paginated ledger transaction history for auditability.
   */
  public static async getTransactionHistory(
    userId: string,
    limit = 50
  ): Promise<CreditTransactionRecord[]> {
    const db = await getMongoDb();
    const transactions = db.collection<CreditTransactionRecord>('credit_transactions');

    return transactions
      .find({ user_id: userId })
      .sort({ created_at: -1 })
      .limit(Math.min(limit, 100))
      .toArray();
  }
}
