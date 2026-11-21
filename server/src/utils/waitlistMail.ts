import{createHash}from'node:crypto';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { ClientSession, Db, MongoClient } from 'mongodb';

// Waitlist confirmation-mail crypto and durable delivery intents.
//
// Fail-closed secret: there is NO fallback signing secret. Any token sign or
// verify path returns/throws "unavailable" when WAITLIST_TOKEN_SECRET is unset
// or weak (< 32 chars), in every environment including production. A deployed
// server without a strong secret cannot issue or accept suppression tokens at
// all, so no known-literal forgery surface exists.
const MIN_SECRET_LEN = 32;
const TOKEN_VERSION = 1;
const TOKEN_PURPOSE = 'unsubscribe';

export function mailCryptoReady(): boolean {
  const s = process.env.WAITLIST_TOKEN_SECRET;
  return typeof s === 'string' && s.length >= MIN_SECRET_LEN;
}

function strongSecret(): string {
  const s = process.env.WAITLIST_TOKEN_SECRET;
  if (typeof s !== 'string' || s.length < MIN_SECRET_LEN) {
    throw new Error('WAITLIST_TOKEN_SECRET missing or weak; waitlist mail crypto disabled');
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Unsubscribe links deliberately carry NO expiry: a link in an old mail must
// keep working. Revocation is per-record: the token embeds the join's
// mail_token_version and verification compares it against the current record,
// so rotating mail_token_version invalidates previously mailed links.
export interface SuppressionTokenPayload {
  v: number;      // token format version
  p: string;      // purpose, must be TOKEN_PURPOSE
  email: string;
  ver: number;    // record mail_token_version at issue time
  iat: number;
}

export function signSuppressionToken(email: string, recordTokenVersion: number, now = Date.now()): string {
  const secret = strongSecret();
  const payload = b64url(Buffer.from(JSON.stringify({ v: TOKEN_VERSION, p: TOKEN_PURPOSE, email, ver: recordTokenVersion, iat: now })));
  const sig = b64url(createHmac('sha256', secret).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifySuppressionToken(token: unknown): SuppressionTokenPayload | null {
  if (!mailCryptoReady() || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac('sha256', strongSecret()).update(payload).digest();
  let got: Buffer;
  try { got = b64urlDecode(sig); } catch { return null; }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const body = JSON.parse(b64urlDecode(payload).toString('utf8'));
    if (body.v !== TOKEN_VERSION || body.p !== TOKEN_PURPOSE) return null;
    if (typeof body.email !== 'string' || typeof body.ver !== 'number') return null;
    return body as SuppressionTokenPayload;
  } catch { return null; }
}

// Durable delivery intent: one row per (email, kind), deterministic _id.
// ALWAYS written in the same transaction as the waitlist join (or canceled in
// the same transaction as suppression), so a joined address can never be
// missing its intent and a suppressed address can never keep a pending one.
//
// Lifecycle: pending -> claimed (leased, fenced by claim_token) -> authorized
// (durable dispatch-authorization boundary, transactional with suppression
// state) -> sent | failed | ambiguous. canceled/deferred are terminal side
// exits. Every status write after claiming is conditional on the claim_token
// issued at claim time, so a stale worker or a lease recovery can never
// overwrite a newer claim, a cancellation, or a final state.
export interface WaitlistMailIntent {
  _id: string; // "waitlist:<email>:<kind>"
  email: string;
  kind: 'confirm';
  status: 'pending' | 'claimed' | 'authorized' | 'ambiguous' | 'sent' | 'failed' | 'canceled' | 'deferred';
  attempts: number;
  claim_token?: string | null;
  claimed_at?: Date | null;
  claim_lease_ms?: number;
  authorized_at?: Date | null;
  authorized_token_version?:number;
  rendered_mail?: {subject:string;text:string;html:string};
  idempotency_key?: string;
  provider_message_id?: string | null;
  last_subject?: string;
  last_error?: string;
  defer_reason?: string;
  sent_via?: string;
  created_at: Date;
  updated_at: Date;
}

export const CLAIM_LEASE_MS = 60_000;
export const MAX_CLAIM_ATTEMPTS = 5;

export const MAIL_INTENT_COLLECTION = 'waitlist_mail_intents';

export async function recordConfirmIntent(db: Db, email: string, session: ClientSession): Promise<void> {
  const col = db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION);
  const now = new Date();
  await col.insertOne(
    { _id: `waitlist:${email}:confirm`, email, kind: 'confirm', status: 'pending', attempts: 0, created_at: now, updated_at: now },
    { session }
  );
}

// Suppression cancels intents that have NOT crossed the dispatch-authorization
// boundary (pending and claimed-but-not-yet-authorized). An already-authorized
// intent is in flight and may finish (documented dispatcher semantics); every
// future send for the suppressed address is prevented at authorization.
export async function cancelPendingIntents(db: Db, email: string, session: ClientSession): Promise<void> {
  const col = db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION);
  await col.updateMany(
    { email, status: { $in: ['pending', 'claimed'] } },
    { $set: { status: 'canceled', claim_token: null, updated_at: new Date() } },
    { session }
  );
}

// Sender-side guard: an intent may only be claimed while the address is still
// subscribed (record exists, consent true, not suppressed). The durable gate
// is authorizeIntentForSend below; this is a cheap pre-filter.
export async function intentStillSendable(db: Db, email: string): Promise<boolean> {
  const rec = await db.collection('waitlist').findOne({ email: { $eq: email } });
  return !!rec && rec.consent === true && !rec.unsubscribed_at;
}

// Claims carry a lease, an attempt counter and a fencing token: a crashed
// dispatcher leaves the intent claimed only until the lease lapses, then
// releaseExpiredClaims returns it to pending. After MAX_CLAIM_ATTEMPTS it goes
// to terminal 'failed' for operator inspection rather than stranding as an
// unclaimable pending row. The claim_token fences every later write.
export async function claimIntentForSend(db: Db, email: string, leaseMs = CLAIM_LEASE_MS): Promise<WaitlistMailIntent | null> {
  // Defense in depth: even a caller that skips the dispatcher gate cannot
  // claim intents while token crypto is disabled.
  if (!mailCryptoReady()) return null;
  const col = db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION);
  const now = new Date();
  const claimed = await col.findOneAndUpdate(
    { _id: `waitlist:${email}:confirm`, status: 'pending', attempts: { $lt: MAX_CLAIM_ATTEMPTS } },
    { $set: { status: 'claimed', claimed_at: now, claim_lease_ms: leaseMs, claim_token: randomUUID(), updated_at: now }, $inc: { attempts: 1 } },
    { returnDocument: 'after' }
  );
  if (!claimed) return null;
  if (!(await intentStillSendable(db, email))) {
    await col.updateOne(
      { _id: claimed._id, status: 'claimed', claim_token: claimed.claim_token ?? null },
      { $set: { status: 'canceled', claim_token: null, updated_at: new Date() } }
    );
    return null;
  }
  return claimed;
}

// Durable dispatch-authorization boundary (design agreed with audit; not
// user-approved wording). Runs in one transaction on snapshot isolation: the
// subscriber's suppression state and the intent transition serialize against
// the leave transaction, which touches the same intent document. Outcome:
//  - suppression committed BEFORE authorization  -> intent canceled, no send;
//  - authorization committed before suppression  -> the one in-flight send may
//    finish, all future sends are prevented by the suppression record;
//  - a newer claim / external state change        -> 'lost', caller does nothing.
export async function authorizeIntentForSend(
  db: Db, client: MongoClient, email: string, claimToken: string
): Promise<'authorized' | 'canceled' | 'lost'> {
  const col = db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION);
  const waitlist = db.collection('waitlist');
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const rec = await waitlist.findOne({ email: { $eq: email } }, { session });
      const version = (rec as unknown as { mail_token_version?: number } | null)?.mail_token_version;
      const sendable = !!rec && rec.consent === true && !rec.unsubscribed_at && typeof version === 'number';
      if (!sendable) {
        await col.updateOne(
          { _id: `waitlist:${email}:confirm`, status: 'claimed', claim_token: claimToken },
          { $set: { status: 'canceled', claim_token: null, updated_at: new Date() } },
          { session }
        );
        return 'canceled' as const;
      }
      // Idempotency key is stable for this intent instance (join + version):
      // retries of the same confirmation mail, including crash recovery,
      // always carry the same key so the provider can dedupe.
      const previous=await col.findOne({_id:`waitlist:${email}:confirm`,status:'claimed',claim_token:claimToken},{session});
      const r = await col.updateOne(
        { _id: `waitlist:${email}:confirm`, status: 'claimed', claim_token: claimToken },
        { $set: { status: 'authorized', authorized_at: previous?.authorized_at??new Date(), authorized_token_version:previous?.authorized_token_version??version, idempotency_key: previous?.idempotency_key??('waitlist-confirm:'+createHash('sha256').update(email+':v'+version).digest('hex')), updated_at: new Date() } },
        { session }
      );
      return r.matchedCount === 1 ? ('authorized' as const) : ('lost' as const);
    });
  } finally {
    await session.endSession();
  }
}

// Final state writes, all fenced by claim_token. A stale token matches
// nothing, so a crashed/replaced worker can never resurrect a canceled intent
// or overwrite a newer claim.
export async function markIntentSent(
  db: Db, email: string, claimToken: string, via: string, subject: string, providerId?: string
): Promise<boolean> {
  const col = db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION);
  const r = await col.updateOne(
    { _id: `waitlist:${email}:confirm`, status: 'authorized', claim_token: claimToken },
    { $set: { status: 'sent', sent_via: via, last_subject: subject, provider_message_id: providerId ?? null, claim_token: null, updated_at: new Date() } }
  );
  return r.matchedCount === 1;
}

// Send failed definitively (provider rejected BEFORE accepting, or local
// failure): back to pending for another attempt, or terminal 'failed' once
// attempts are exhausted - never stranded as an unclaimable pending row.
export async function failIntentClaim(db: Db, email: string, claimToken: string, message: string): Promise<boolean> {
  const col = db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION);
  const cur = await col.findOne({ _id: `waitlist:${email}:confirm` });
  if (!cur || cur.claim_token !== claimToken || (cur.status !== 'claimed' && cur.status !== 'authorized')) return false;
  const terminal = (cur.attempts ?? 0) >= MAX_CLAIM_ATTEMPTS;
  const r = await col.updateOne(
    { _id: cur._id, status: { $in: ['claimed', 'authorized'] }, claim_token: claimToken },
    { $set: { status: terminal ? 'failed' : 'pending', claim_token: null, claimed_at: null, last_error: message.slice(0, 300), updated_at: new Date() } }
  );
  return r.matchedCount === 1;
}

// Send outcome UNKNOWN (e.g. timeout after possible provider acceptance): the
// intent parks in 'ambiguous' with its idempotency key. The dispatcher never
// auto-retries ambiguous intents; resolving one requires reconciling against
// the provider with that key (a blind resend could duplicate the delivery).
export async function markIntentAmbiguous(db: Db, email: string, claimToken: string, message: string): Promise<boolean> {
  const col = db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION);
  const r = await col.updateOne(
    { _id: `waitlist:${email}:confirm`, status: 'authorized', claim_token: claimToken },
    { $set: { status: 'ambiguous', last_error: message.slice(0, 300), updated_at: new Date() } }
  );
  return r.matchedCount === 1;
}

export async function releaseExpiredClaims(db: Db, now = new Date()): Promise<number> {
  const col = db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION);
  const claimed = await col.find({ status: 'claimed' }).toArray();
  let released = 0;
  for (const c of claimed) {
    const lease = c.claim_lease_ms ?? CLAIM_LEASE_MS;
    const at = c.claimed_at ? new Date(c.claimed_at).getTime() : 0;
    if (at + lease <= now.getTime()) {
      const next = (c.attempts ?? 0) >= MAX_CLAIM_ATTEMPTS ? 'failed' : 'pending';
      await col.updateOne(
        { _id: c._id, status: 'claimed', claim_token: c.claim_token ?? null },
        { $set: { status: next, claim_token: null, claimed_at: null, updated_at: now } }
      );
      released++;
    }
  }
  return released;
}
