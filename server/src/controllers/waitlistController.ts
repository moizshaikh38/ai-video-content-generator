import {ensureWaitlistReady,waitlistTransportReady} from '../services/waitlistMailWorker.js';
import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { getMongoDb } from '../db/mongoClient.js';
import { AppError } from '../types/index.js';
import { getMongoClient } from '../db/mongoClient.js';
import { recordConfirmIntent, cancelPendingIntents, verifySuppressionToken, mailCryptoReady, MAIL_INTENT_COLLECTION, WaitlistMailIntent } from '../utils/waitlistMail.js';
import { leaveConfirmPage, leaveResultPage } from '../utils/waitlistConfirmEmail.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readEmail(req: Request): string {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new AppError('Enter a valid email address.', 400, 'WAITLIST_EMAIL_INVALID');
  }
  return email;
}

/**
 * Public landing waitlist capture. Stores the email with its consent scope;
 * records a durable confirmation intent. A separate enabled worker delivers
 * mail, so the join response never claims it has already arrived.
 */
export const joinWaitlist = async (req: Request, res: Response): Promise<void> => {
  if(process.env.NODE_ENV!=='test'&&!waitlistTransportReady())throw new AppError('Waitlist is temporarily unavailable.',503,'WAITLIST_UNAVAILABLE');
  await ensureWaitlistReady();
  const email = readEmail(req);
  if (req.body?.consent !== true) {
    throw new AppError('Consent is required to join the waitlist.', 400, 'WAITLIST_CONSENT_REQUIRED');
  }
  const source = typeof req.body?.source === 'string' ? req.body.source.slice(0, 64) : 'landing';
  const db = await getMongoDb();
  const waitlist = db.collection('waitlist');
  // ensureWaitlistReady completes the required unique indexes before writes.
  // Atomic join + confirmation-mail intent: both writes commit in one
  // transaction, so a crash or retry can never leave a joined address without
  // its durable intent. A duplicate key aborts the whole transaction; the
  // outward response stays identical to a fresh join (non-enumerating), and a
  // suppressed (unsubscribed) record is NOT reactivated by an unverified
  // email-only join; reactivation needs possession proof (signed link).
  const client = await getMongoClient();
  const joinTx = async () => {
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await waitlist.insertOne(
          { id: crypto.randomUUID(), email, consent: true, source, created_at: new Date(), mail_token_version: 1 },
          { session }
        );
        await recordConfirmIntent(db, email, session);
      });
    } finally {
      await session.endSession();
    }
  };
  try {
    await joinTx();
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    // 11000 can come from the waitlist email index (ordinary duplicate: the row
    // exists, opaque 201 below) OR from the intent's deterministic _id while the
    // waitlist insert rolled back (orphan intent from a prior partial attempt).
    // Distinguish by record state; never return a signup that stored nothing.
    const existing = await waitlist.findOne({ email: { $eq: email } });
    if (!existing) {
      // Orphan intent from a prior partial attempt blocked the join. Reconcile
      // in ONE transaction: delete ONLY an untouched pending orphan, then write
      // subscriber + fresh intent; all three writes commit or none do. If the
      // orphan changed concurrently (e.g. a dispatcher claimed it), the
      // conditional delete matches nothing, the transaction aborts and the
      // request fails closed with a retryable 503 - never a 201 without a
      // stored subscriber, and never a deleted valid intent.
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const del = await db.collection<WaitlistMailIntent>(MAIL_INTENT_COLLECTION).deleteOne(
            { _id: `waitlist:${email}:confirm`, status: 'pending', attempts: 0 },
            { session }
          );
          if (del.deletedCount !== 1) {
            throw new AppError('Waitlist is temporarily unavailable. Please try again.', 503, 'WAITLIST_UNAVAILABLE');
          }
          await waitlist.insertOne(
            { id: crypto.randomUUID(), email, consent: true, source, created_at: new Date(), mail_token_version: 1 },
            { session }
          );
          await recordConfirmIntent(db, email, session);
        });
      } finally {
        await session.endSession();
      }
    }
  }
  res.status(201).json({ status: 'joined' });
};

/**
 * Token-gated suppression. The signed token is purpose-bound and carries the
 * record's mail_token_version; links never expire, but rotating the record's
 * version revokes previously mailed links. Unknown email with a structurally
 * valid token gets the same 200 as a real suppression (non-enumerating).
 * Invalid tokens (bad signature, wrong purpose, stale version, or mail crypto
 * disabled because no strong secret is configured) fail closed: 400 for bad
 * tokens, 503 when the server cannot verify tokens at all.
 */
export const leaveWaitlist = async (req: Request, res: Response): Promise<void> => {
  // The mailed landing page submits a plain HTML form (urlencoded); API
  // clients send JSON. Same suppression path, different response body.
  const isForm = req.is('application/x-www-form-urlencoded') !== false;
  const email = readEmail(req);
  if (!mailCryptoReady()) {
    // Fail closed with the same explicit contract as the bootstrap admission
    // gate: token routes stay unavailable until a strong secret is configured.
    if (isForm) { res.status(503).type('html').send(leaveResultPage(false)); return; }
    res.status(503).json({ status: 'error', code: 'SERVICE_UNAVAILABLE', message: 'Waitlist is temporarily unavailable.' });
    return;
  }
  const parsed = verifySuppressionToken(req.body?.token);
  if (!parsed || parsed.email.toLowerCase() !== email) {
    if (isForm) { res.status(400).type('html').send(leaveResultPage(false)); return; }
    throw new AppError('Invalid unsubscribe link.', 400, 'WAITLIST_INVALID_TOKEN');
  }
  const db = await getMongoDb();
  const waitlist = db.collection('waitlist');
  // Version check AND suppression run inside ONE transaction on snapshot
  // isolation: a concurrent mail_token_version rotation conflicts and aborts,
  // withTransaction retries against fresh state, and the stale token then
  // reads the rotated version and fails 400. A revoked token can never win
  // the rotation race.
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    await session.withTransaction(async () => {
      const record = await waitlist.findOne({ email: { $eq: email } }, { session });
      if (!record) return; // unknown address: same opaque 200 below
      if (record.mail_token_version !== parsed.ver) {
        throw new AppError('Invalid unsubscribe link.', 400, 'WAITLIST_INVALID_TOKEN');
      }
      await waitlist.updateOne(
        { email: { $eq: email }, mail_token_version: parsed.ver, unsubscribed_at: { $exists: false } },
        { $set: { consent: false, unsubscribed_at: new Date() } },
        { session }
      );
      await cancelPendingIntents(db, email, session);
    });
  } finally {
    await session.endSession();
  }
  if (isForm) { res.status(200).type('html').send(leaveResultPage(true)); return; }
  res.status(200).json({ status: 'ok' });
};

/**
 * Scanner-safe landing for the mailed leave link. GET has NO side effects: it
 * only renders a confirm page whose form POSTs the token (email prefetchers
 * and link scanners issue GETs; a prefetch must never unsubscribe anyone).
 * The token is verified before the page is served, and a stale/invalid token
 * gets the same generic failure page - no record enumeration.
 */
export const leaveWaitlistPage = async (req: Request, res: Response): Promise<void> => {
  res.type('html');
  const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!mailCryptoReady()) { res.status(503).send(leaveResultPage(false)); return; }
  const parsed = verifySuppressionToken(token);
  if (!parsed || parsed.email.toLowerCase() !== email || !EMAIL_RE.test(email)) {
    res.status(400).send(leaveResultPage(false));
    return;
  }
  const db = await getMongoDb();
  const record = await db.collection('waitlist').findOne({ email: { $eq: email } });
  if (!record || record.mail_token_version !== parsed.ver) {
    res.status(400).send(leaveResultPage(false));
    return;
  }
  if (record.unsubscribed_at) { res.status(200).send(leaveResultPage(true)); return; }
  res.status(200).send(leaveConfirmPage(email, token));
};
