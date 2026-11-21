import type { Db } from 'mongodb';
import {
  claimIntentForSend, failIntentClaim, authorizeIntentForSend, markIntentSent,
  markIntentAmbiguous, mailCryptoReady, releaseExpiredClaims,
  MAIL_INTENT_COLLECTION, WaitlistMailIntent,
} from '../utils/waitlistMail.js';
import { renderConfirmEmail, RenderedMail } from '../utils/waitlistConfirmEmail.js';
import { getMongoDb } from '../db/mongoClient.js';
import { logger } from '../utils/logger.js';

// Transactional waitlist confirmation dispatcher. Production execution is
// gated by explicit enable and verified provider configuration.
//
// Dispatch semantics (design proposed by audit; not user-approved wording):
// the durable boundary is authorizeIntentForSend, a transaction that
// serializes the intent against suppression state. A suppression committed
// BEFORE authorization prevents the send; once an intent is authorized, that
// one in-flight send may finish; every future send for the suppressed address
// is prevented at authorization time. Every send carries a stable
// idempotency key, so a crash between provider acceptance and bookkeeping is retried only inside the provider24h dedupe window with a frozen payload.
// Older unresolved authorizations are parked, not resent. An UNKNOWN send outcome parks the intent in 'ambiguous'
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

/** Real transactional transport. No provider fallback or automatic retry.
 * A connection/5xx uncertainty is parked for reconciliation, never resent. */
export class ResendTransport implements MailTransport {
  name = 'resend';
  constructor(private readonly key=process.env.RESEND_API_KEY||'',private readonly from=process.env.WAITLIST_FROM_EMAIL||''){}
  async send(mail:{to:string;subject:string;text:string;html:string},opts:{idempotencyKey:string}):Promise<{providerId:string}>{
    if(!this.key||!/^Vireo <[^<>\s@]+@updates\.vireoclip\.com>$/.test(this.from))throw new SendError('Waitlist transport configuration unavailable',false);
    let response:Response;
    try{response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+this.key,'Content-Type':'application/json','Idempotency-Key':opts.idempotencyKey},body:JSON.stringify({from:this.from,to:[mail.to],subject:mail.subject,text:mail.text,html:mail.html}),signal:AbortSignal.timeout(15000)});}
    catch{throw new SendError('Provider outcome unknown; reconcile before retry',true);}
    if(!response.ok)throw new SendError('Provider rejected waitlist send: HTTP'+response.status,response.status>=500||response.status===409);
    let data:any;try{data=await response.json();}catch{throw new SendError('Provider acceptance unreadable; reconcile before retry',true);}
    if(typeof data.id!=='string'||!data.id)throw new SendError('Provider acceptance ID missing; reconcile before retry',true);
    return{providerId:data.id};
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
    if(!authorized?.authorized_at||Date.now()-new Date(authorized.authorized_at).getTime()>23*60*60*1000){await markIntentAmbiguous(db,intent.email,claimToken,'Provider dedupe window expired; manual reconciliation required');ambiguous++;return;}
    // Freeze the complete payload once, including token timestamp/logo/baseURL.
    // Provider idempotency is only24h, and retries must use identical bytes.
    let rendered=authorized.rendered_mail;
    if(!rendered){
      if(typeof authorized.authorized_token_version!=='number'){await markIntentAmbiguous(db,intent.email,claimToken,'Legacy authorization lacks frozen token version');ambiguous++;return;}
      const candidate=renderConfirmEmail(intent.email,authorized.authorized_token_version,new Date(authorized.authorized_at).getTime());
      await intents.updateOne({_id:intent._id,status:'authorized',claim_token:claimToken,rendered_mail:{$exists:false}},{$set:{rendered_mail:candidate}});
      rendered=(await intents.findOne({_id:intent._id,status:'authorized',claim_token:claimToken}))?.rendered_mail;
      if(!rendered){canceled++;return;}
    }
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
      logger.warn('Waitlist mail dispatch failed',{ambiguous:isAmbiguous});
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
  // SAME idempotency key and frozen bytes are safe only inside the23h
  // safety window; older records are parked for provider reconciliation.
  const stranded = await intents.find({ status: 'authorized' }).sort({authorized_at:1}).limit(limit).toArray();
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
  if(!transport&&process.env.WAITLIST_MAIL_ENABLED!=='1')return{sent:0,canceled:0,failed:0,deferred:0,ambiguous:0,disabled:true};
  const db = await getMongoDb();
  return processWaitlistMailOnce(db, transport ?? new ResendTransport());
}
