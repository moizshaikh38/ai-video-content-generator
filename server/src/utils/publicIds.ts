import crypto from 'node:crypto';

/**
 * Opaque public IDs (security hardening).
 *
 * Internal primary keys stay as UUIDs (Mongo compatibility, FK integrity, existing
 * tests). Public URLs and API paths use short, URL-safe, case-sensitive IDs that
 * carry no information about the internal key. The server resolves them
 * transparently in middleware; the browser never sees a UUID.
 *
 * Format: 12 characters from [a-zA-Z0-9] — 62^12 ≈ 3.2 × 10^21 possibilities
 * (same keyspace as a 71-bit key; brute-force enumeration is infeasible).
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_LENGTH = 12;

function randomInt(maxExclusive: number): number {
  // Rejection sampling for uniform distribution
  const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const buf = crypto.randomBytes(4);
  const value = buf.readUInt32BE(0);
  if (value < limit) return value % maxExclusive;
  // Ultra-rare rejection — retry with a recursive call (bounded depth)
  return randomInt(maxExclusive);
}

/** Generates a short, URL-safe, opaque public ID. */
export function generatePublicId(length = DEFAULT_LENGTH): string {
  const chars: string[] = [];
  for (let i = 0; i < length; i++) {
    chars.push(ALPHABET[randomInt(ALPHABET.length)]);
  }
  return chars.join('');
}

/** True when the input looks like a public ID (12 alphanumeric chars, not a UUID). */
export function isPublicId(value: string): boolean {
  return typeof value === 'string' && /^[a-zA-Z0-9]{12}$/.test(value) && !value.includes('-');
}

/** True when the input is a standard UUID (internal key format). */
export function isUuid(value: string): boolean {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Resolves a route parameter to an internal UUID:
 * - UUID input → returned as-is (internal/bypass path)
 * - Public ID input → looked up in the `public_id_index` collection
 * Returns null when unresolvable.
 */
export async function resolveToUuid(
  identifier: string,
  collection: 'projects' | 'clips',
  getDb: () => Promise<import('mongodb').Db>
): Promise<string | null> {
  if (!identifier) return null;

  // UUID passthrough (internal tools, tests, existing clients)
  if (isUuid(identifier)) return identifier;

  if (!isPublicId(identifier)) return null;

  const db = await getDb();
  const doc = await db.collection('public_id_index').findOne(
    { public_id: identifier, entity_type: collection },
    { projection: { internal_id: 1 } }
  );
  return doc?.internal_id ?? null;
}
