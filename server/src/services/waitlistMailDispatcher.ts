import type { Db } from 'mongodb';
import {
  claimIntentForSend, failIntentClaim, authorizeIntentForSend, markIntentSent,
  markIntentAmbiguous, mailCryptoReady, releaseExpiredClaims,
  MAIL_INTENT_COLLECTION, WaitlistMailIntent,
} from '../utils/waitlistMail.js';
import { renderConfirmEmail, RenderedMail } from '../utils/waitlistConfirmEmail.js';
import { getMongoDb } from '../db/mongoClient.js';
import { logger } from '../utils/logger.js';

// Waitlist confirmation-mail dispatcher. LOCAL PREPARATION ONLY: the default
// transport is a mock that records payloads; no provider transport is wired
// and no email leaves this process.
//
// Dispatch semantics (design proposed by audit; not user-approved wording):
// the durable boundary is authorizeIntentForSend, a transaction that
// serializes the intent against suppression state. A suppression committed
// BEFORE authorization prevents the send; once an intent is authorized, that
// one in-flight send may finish; every future send for the suppressed address
// is prevented at authorization time. Every send carries a stable
// idempotency key, so a crash between provider acceptance and bookkeeping can
// never produce a second delivery: recovery resends the same key, which the
// provider dedupes. An UNKNOWN send outcome parks the intent in 'ambiguous'
// for provider reconciliation - it is never blindly resent.

// ambiguous=true means the provider may have accepted the send (timeout /
// connection drop after the request left); ambiguous=false is a definitive
// pre-acceptance failure that is safe to retry.
export class SendError extends Error {
  constructor(message: string, readonly ambiguous: boolean) {
    super(message);
  }
}

export interface MailTransport {
  name: string;
  send(mail: { to: string; subject: string; text: string; html: string }, opts: { idempotencyKey: string }): Promise<{ providerId?: string }>;
}

// Mock transport with provider-style idempotency: one delivery per
// idempotency key, repeats of a key return the original acceptance. `inject`
// lets tests fail sends deterministically; `seedAccepted` records a delivery
// as if the provider accepted it in a previous (crashed) process.
export class MockTransport implements MailTransport {
  name = 'mock';
  sent: { to: string; subject: string; text: string; html: string }[] = [];
  calls = 0;
  private readonly deliveredKeys = new Set<string>();
  constructor(private readonly inject?: (mail: { to: string } & RenderedMail, idempotencyKey: string) => void | Promise<void>) {}
  seedAccepted(mail: { to: string; subject: string; text: string; html: string }, idempotencyKey: string): void {
    if (this.deliveredKeys.has(idempotencyKey)) return;
    this.deliveredKeys.add(idempotencyKey);
    this.sent.push(mail);
  }
  async send(mail: { to: string; subject: string; text: string; html: string }, opts: { idempotencyKey: string }): Promise<{ providerId: string }> {
    this.calls++;
    await this.inject?.(mail, opts.idempotencyKey);
    this.seedAccepted(mail, opts.idempotencyKey);
    return { providerId: `mock:${opts.idempotencyKey}` };
  }
}

// Resend transport placeholder: deliberately inert without explicit config;
// creating keys/env and any real dispatch is a separate authority grant. The
// provider contract this dispatcher expects when a transport IS wired: honor
// the idempotency key (one delivery per key), and classify errors so that
// post-acceptance uncertainty surfaces as SendError(ambiguous=true).
export class ResendTransport implements MailTransport {
  name = 'resend';
  async send(): Promise<{ providerId?: string }> {
    throw new Error('ResendTransport not configured: provider sends are not authorized in this build');
  }
}

export interface DispatchTickResult {
  sent: number;
  canceled: number;
  failed: number;
  deferred: number;
  ambiguous: number;
  disabled: boolean;
}

export async function processWaitlistMailOnce(db: Db, transport: MailTransport, limit = 25): Promise<DispatchTickResult> {
  const intents = db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION);
  const waitlist = db.collection('waitlist');
  // Missing/weak crypto hard-disables the WHOLE pipeline (claim, render, send),
  // not just the leave route: tokens cannot be signed, so no mail may go out.
  if (!mailCryptoReady()) return { sent: 0, canceled: 0, failed: 0, deferred: 0, ambiguous: 0, disabled: true };
  // Recover intents orphaned by a crashed dispatcher before claiming anew.
  await releaseExpiredClaims(db);
  const client = db.client;
  let sent = 0, canceled = 0, failed = 0, deferred = 0, ambiguous = 0;

  const finish = async (intent: WaitlistMailIntent, claimToken: string, alreadyAuthorized = false): Promise<void> => {
    const record = await waitlist.findOne({ email: { $eq: intent.email } });
    const version = (record as unknown as { mail_token_version?: number } | null)?.mail_token_version;
    if (version === undefined && !alreadyAuthorized) {
      // Explicit legacy policy: pre-version rows are NEVER auto-messaged. The
      // intent defers until an explicit migration assigns mail_token_version.
      await intents.updateOne(
        { _id: intent._id, status: 'claimed', claim_token: claimToken },
        { $set: { status: 'deferred', defer_reason: 'legacy-no-token-version', claim_token: null, updated_at: new Date() } }
      );
      deferred++;
      return;
    }
    // A resumed intent already crossed the authorization boundary before the
    // crash; re-authorizing would (correctly) match nothing and lose it.
    if (!alreadyAuthorized) {
      // Durable dispatch-authorization boundary (transactional; see helper).
      const auth = await authorizeIntentForSend(db, client, intent.email, claimToken);
      if (auth !== 'authorized') {
        if (auth === 'canceled') canceled++;
        else failed++;
        return;
      }
    }
    if (version === undefined) {
      // Authorized earlier, but the record no longer carries a token version:
      // cannot render a valid leave link. Definitive local failure.
      await failIntentClaim(db, intent.email, claimToken, 'record lost mail_token_version before resume');
      failed++;
      return;
    }
    const authorized = await intents.findOne({ _id: intent._id });
    const idempotencyKey = authorized?.idempotency_key ?? intent.idempotency_key ?? `${intent._id}:v${version}`;
    const rendered = renderConfirmEmail(intent.email, version);
    try {
      const res = await transport.send({ to: intent.email, ...rendered }, { idempotencyKey });
      // The provider accepted. If this mark matches nothing, the intent was
      // externally canceled or re-claimed while the send was in flight - the
      // one in-flight delivery may stand, but we must NOT resurrect the row.
      const marked = await markIntentSent(db, intent.email, claimToken, transport.name, rendered.subject, res.providerId);
      if (marked) sent++;
      else canceled++;
    } catch (err) {
      const isAmbiguous = err instanceof SendError && err.ambiguous;
      const message = err instanceof Error ? err.message : String(err);
      logger.warn(`waitlist mail dispatch failed for ${intent.email}: ${message}`);
      if (isAmbiguous) {
        await markIntentAmbiguous(db, intent.email, claimToken, message);
        ambiguous++;
      } else {
        await failIntentClaim(db, intent.email, claimToken, message);
        failed++;
      }
    }
  };

  // Resume intents whose send was accepted but whose bookkeeping never landed
  // (crash between provider acceptance and markIntentSent). Resending with the
  // SAME idempotency key is delivery-safe: the provider dedupes, so the
  // address still receives exactly one copy.
  const stranded = await intents.find({ status: 'authorized' }).toArray();
  for (const intent of stranded) {
    if (!intent.claim_token) continue;
    await finish(intent, intent.claim_token, true);
  }

  const pending = await intents.find({ status: 'pending' }).sort({ created_at: 1 }).limit(limit).toArray();
  for (const intent of pending) {
    const claimed = await claimIntentForSend(db, intent.email);
    if (!claimed) { canceled++; continue; }
    await finish(claimed, claimed.claim_token as string);
  }
  return { sent, canceled, failed, deferred, ambiguous, disabled: false };
}

export async function runWaitlistMailTick(transport?: MailTransport): Promise<DispatchTickResult> {
  const db = await getMongoDb();
  return processWaitlistMailOnce(db, transport ?? new MockTransport());
}
