import {onRenderCapacityAvailable} from './renderCapacitySignal.js';
import type {ChangeStream, Db} from 'mongodb';

/** Notifications only wake the existing lease-based drain. Polling still recovers
 * missed events. Reopen terminal streams with bounded backoff, never claim here. */
export function startRenderQueueWake(db: Db, drain: () => Promise<void>, onError: (error: unknown) => void): {request: () => void; stop: () => void} {
  let stopped = false, running = false, pending = false;
  let timer: ReturnType<typeof setImmediate> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stream: ChangeStream | undefined;
  let retryDelay = 1000;
  const request = () => {
    if (stopped) return;
    pending = true;
    if (running || timer) return;
    timer = setImmediate(() => { timer = undefined; void run(); });
  };
  const stopCapacitySignal=onRenderCapacityAvailable(request);
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      while (pending && !stopped) { pending = false; await drain(); }
    } catch (error) { onError(error); }
    finally {
      running = false;
      // A notification received during a failed drain must not be stranded.
      if (pending && !stopped) request();
    }
  };
  const close = (current: ChangeStream) => { void current.close().catch(onError); };
  const scheduleRetry = () => {
    if (stopped || retry) return;
    retry = setTimeout(() => { retry = undefined; open(true); }, retryDelay);
    retry.unref();
    retryDelay = Math.min(retryDelay * 2, 30_000);
  };
  const open = (recover: boolean) => {
    if (stopped) return;
    try {
      const current = db.collection('render_jobs').watch([
        {$match: {operationType: {$in: ['insert', 'update', 'replace']}, 'fullDocument.status': 'queued'}},
      ], {fullDocument: 'updateLookup', maxAwaitTimeMS: 1000});
      stream = current;
      const failed = (error?: unknown) => {
        if (stopped || stream !== current) return;
        stream = undefined;
        if (error) onError(error);
        // Detach ownership before close, which can emit another close event.
        close(current);
        scheduleRetry();
      };
      current.on('change', () => {
        if (stopped || stream !== current) return;
        retryDelay = 1000;
        request();
      });
      current.on('error', failed);
      current.on('close', () => failed());
      // Catch queued work from the outage as well as future notifications.
      // The periodic sweep remains necessary for events missed while reopening.
      if (recover) request();
    } catch (error) { onError(error); scheduleRetry(); }
  };
  open(false);
  return {request, stop: () => {
    stopped = true; pending = false; stopCapacitySignal();
    if (timer) clearImmediate(timer);
    if (retry) clearTimeout(retry);
    const current = stream; stream = undefined;
    if (current) close(current);
  }};
}
