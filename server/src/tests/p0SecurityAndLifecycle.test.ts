import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAuthClient } from '../utils/supabase.js';
import { MediaImportService } from '../services/mediaImportService.js';
import { isUserUnlimited } from '../services/usageService.js';
import { config } from '../config/index.js';
import { WorkLifecycle, createShutdown, createTrackedPoller } from '../services/queue/workLifecycle.js';
import {
  getDatabaseBootstrapState,
  isDatabaseBootstrapReady,
  setDatabaseBootstrapState,
} from '../services/databaseBootstrapState.js';

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    setHeader(k: string, v: string) { this.headers[k] = v; },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  return res;
}

test('P0-A: requireAuth validates Bearer token via Supabase on every request without stale cache', async () => {
  const origGetUser = supabaseAuthClient.auth.getUser;
  let calls = 0;
  let revoked = false;
  (supabaseAuthClient.auth as any).getUser = async (token: string) => {
    calls++;
    assert.equal(token, 'tok-123');
    if (revoked) return { data: { user: null }, error: { message: 'Token revoked' } };
    return { data: { user: { id: 'user-1', email: 'u@example.com' } }, error: null };
  };
  try {
    let nextCalls = 0;
    const req1: any = { headers: { authorization: 'Bearer tok-123' }, ip: '127.0.0.1' };
    const res1 = mockRes();
    await requireAuth(req1, res1, () => { nextCalls++; });
    assert.equal(nextCalls, 1);
    assert.equal(req1.user.id, 'user-1');

    // Revoke token; second request with same token must NOT hit a stale cache
    revoked = true;
    const req2: any = { headers: { authorization: 'Bearer tok-123' }, ip: '127.0.0.1' };
    const res2 = mockRes();
    await requireAuth(req2, res2, () => { nextCalls++; });
    assert.equal(calls, 2);
    assert.equal(nextCalls, 1);
    assert.equal(res2.statusCode, 401);
    assert.equal(res2.body.code, 'AUTH_INVALID');
  } finally {
    (supabaseAuthClient.auth as any).getUser = origGetUser;
  }
});

test('P0-B: MediaImportService.importRemoteMedia blocks SSRF targets, redirects to private IPs, and non-HTTP protocols', async () => {
  for (const url of [
    'file:///etc/passwd',
    'ftp://example.com/video.mp4',
    'http://127.0.0.1/video.mp4',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/video.mp4',
    'http://10.0.0.5/video.mp4',
  ]) {
    await assert.rejects(
      () => MediaImportService.importRemoteMedia('user-1', { url }),
      (err: any) => ['INVALID_PROTOCOL', 'SSRF_BLOCKED'].includes(err?.code)
    );
  }

  // Redirect to file:// must be blocked before calling fetchImpl
  await assert.rejects(
    () =>
      MediaImportService.importRemoteMedia(
        'user-1',
        { url: 'https://public.example.com/start.mp4' },
        async () => new Response(null, { status: 302, headers: { location: 'file:///etc/passwd' } })
      ),
    (err: any) => err?.code === 'INVALID_PROTOCOL'
  );

  // Redirect to private IP must hit pinnedPublicMediaFetch and be blocked with SSRF_BLOCKED
  let hops = 0;
  await assert.rejects(
    () =>
      MediaImportService.importRemoteMedia(
        'user-1',
        { url: 'https://public.example.com/start.mp4' },
        async (target, signal) => {
          hops++;
          if (hops === 1) {
            return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/internal.mp4' } });
          }
          const { pinnedPublicMediaFetch } = await import('../utils/pinnedHttpsAssetFetch.js');
          return pinnedPublicMediaFetch(target, signal);
        }
      ),
    (err: any) => err?.code === 'SSRF_BLOCKED'
  );
});

test('P0-C: isUserUnlimited never grants unlimited access in production', () => {
  const origProd = config.isProduction;
  const origEmails = config.devUnlimitedUserEmail;
  try {
    (config as any).isProduction = true;
    (config as any).devUnlimitedUserEmail = 'vertexdigitals07@gmail.com,moizsh786786@gmail.com';
    assert.equal(isUserUnlimited('vertexdigitals07@gmail.com'), false);
    assert.equal(isUserUnlimited('moizsh786786@gmail.com'), false);
    assert.equal(isUserUnlimited('other@example.com'), false);

    (config as any).isProduction = false;
    assert.equal(isUserUnlimited('vertexdigitals07@gmail.com'), true);
    assert.equal(isUserUnlimited('other@example.com'), false);
  } finally {
    (config as any).isProduction = origProd;
    (config as any).devUnlimitedUserEmail = origEmails;
  }
});

test('P0-D: tracked poller prevents overlap and createShutdown drains in-flight work before closing DB', async () => {
  const lifecycle = new WorkLifecycle();
  let releaseWork!: () => void;
  let runs = 0;
  let dbClosed = false;
  let pollersStopped = false;

  const timer = createTrackedPoller(
    'test-poller',
    () => {
      runs++;
      return new Promise<void>((resolve) => {
        releaseWork = resolve;
      });
    },
    10,
    lifecycle
  );
  // Allow a couple ticks while work is in-flight
  await new Promise((r) => setTimeout(r, 35));
  assert.equal(runs, 1, 'overlap guard must prevent concurrent poller runs');

  const shutdown = createShutdown({
    lifecycle,
    stopPollers: () => {
      pollersStopped = true;
      clearInterval(timer);
    },
    closeHttp: async () => {},
    closeDatabase: async () => {
      assert.equal(lifecycle.snapshot().active.length, 0);
      dbClosed = true;
    },
    timeoutMs: 2000,
  });

  // Repeated shutdown calls share the same drain promise
  const p1 = shutdown();
  const p2 = shutdown();
  assert.equal(pollersStopped, true);
  assert.equal(dbClosed, false, 'DB must not close while tracked poller is still in flight');

  releaseWork();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1, true);
  assert.equal(r2, true);
  assert.equal(dbClosed, true);
});

test('P0-E: databaseBootstrapState distinguishes unconfigured/failed/pending from ready and supports recovery', () => {
  const prev = getDatabaseBootstrapState();
  try {
    setDatabaseBootstrapState('unconfigured');
    assert.equal(getDatabaseBootstrapState(), 'unconfigured');
    assert.equal(isDatabaseBootstrapReady(), false);

    setDatabaseBootstrapState('failed');
    assert.equal(getDatabaseBootstrapState(), 'failed');
    assert.equal(isDatabaseBootstrapReady(), false);

    setDatabaseBootstrapState('ready');
    assert.equal(getDatabaseBootstrapState(), 'ready');
    assert.equal(isDatabaseBootstrapReady(), true);
  } finally {
    setDatabaseBootstrapState(prev);
  }
});

test('P0-G: bootstrapMongo registers public_id_index collection and unique lookup indexes', () => {
  const src = fs.readFileSync(new URL('../db/bootstrapMongo.ts', import.meta.url), 'utf8');
  assert.match(src, /'public_id_index'/);
  assert.match(src, /collection\('public_id_index'\)\.createIndex\(\{\s*public_id:\s*1\s*\},\s*\{\s*unique:\s*true\s*\}\)/);
  assert.match(src, /collection\('public_id_index'\)\.createIndex\(\{\s*internal_id:\s*1\s*\},\s*\{\s*unique:\s*true\s*\}\)/);
});

test('P0-E: shared DatabaseBootstrapAttempt prevents overlapping bootstrapMongo writers across recovery timeouts while allowing retry after real rejection', async () => {
  const { DatabaseBootstrapAttempt } = await import('../services/databaseBootstrapAttempt.js');
  let calls = 0;
  let releaseFirst!: () => void;
  let shouldReject = false;

  const shared = new DatabaseBootstrapAttempt(() => {
    calls++;
    if (calls === 1) {
      return new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
    }
    if (shouldReject) return Promise.reject(new Error('transient fail'));
    return Promise.resolve();
  });

  // Pass 1 times out while bootstrapMongo is still running
  await assert.rejects(() => shared.wait(20), /timeout/);
  assert.equal(calls, 1);

  // Recovery pass 2 reuses the in-flight attempt instead of starting a second writer
  const wait2 = shared.wait(500);
  assert.equal(calls, 1);
  releaseFirst();
  await wait2;
  assert.equal(calls, 1);

  // Real rejection clears attempt so a subsequent retry can run
  shouldReject = true;
  const sharedReject = new DatabaseBootstrapAttempt(() => {
    calls++;
    return shouldReject ? Promise.reject(new Error('transient fail')) : Promise.resolve();
  });
  await assert.rejects(() => sharedReject.wait(500), /transient fail/);
  assert.equal(calls, 2);
  shouldReject = false;
  await sharedReject.wait(500);
  assert.equal(calls, 3);
});

test('P0-B: real local HTTP server tests redirect body cleanup, loopback/protocol blocking, and oversized stream cancellation', async () => {
  const http = await import('node:http');
  const { pinnedPublicMediaFetch } = await import('../utils/pinnedHttpsAssetFetch.js');

  const server = http.createServer((req, res) => {
    if (req.url === '/redir-file') {
      res.writeHead(302, { Location: 'file:///etc/passwd' });
      res.end('redirecting to file');
      return;
    }
    if (req.url === '/redir-loopback') {
      res.writeHead(302, { Location: `http://127.0.0.1:${(server.address() as any).port}/secret.mp4` });
      res.end('redirecting to loopback');
      return;
    }
    if (req.url === '/oversized') {
      res.on('error', () => {});
      req.socket?.on('error', () => {});
      let closed = false;
      req.on('close', () => { closed = true; });
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      const chunk = Buffer.alloc(1024 * 1024, 0x41);
      let sent = 0;
      const pump = () => {
        if (closed || res.destroyed || res.writableEnded || res.closed) return;
        try {
          while (sent < 102 && !closed && !res.destroyed && !res.writableEnded && !res.closed) {
            sent++;
            if (!res.write(chunk)) {
              res.once('drain', () => setImmediate(pump));
              return;
            }
          }
          if (!closed && !res.destroyed && !res.writableEnded) res.end();
        } catch {
          // Stream destroyed by client cancellation
        }
      };
      pump();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    res.end('ok');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  try {
    // 1. Real HTTP 302 -> file:// exercises real socket response body cancel + INVALID_PROTOCOL
    await assert.rejects(
      () =>
        MediaImportService.importRemoteMedia(
          'user-1',
          { url: `http://127.0.0.1:${port}/redir-file` },
          (url, signal) => pinnedPublicMediaFetch(url, signal, { allowDevelopmentLoopback: true })
        ),
      (err: any) => err?.code === 'INVALID_PROTOCOL'
    );

    // 2. Real HTTP 302 -> 127.0.0.1 exercises real redirect followed by default pinnedPublicMediaFetch SSRF block
    let hop = 0;
    await assert.rejects(
      () =>
        MediaImportService.importRemoteMedia(
          'user-1',
          { url: `http://127.0.0.1:${port}/redir-loopback` },
          (url, signal) => {
            hop++;
            return hop === 1
              ? pinnedPublicMediaFetch(url, signal, { allowDevelopmentLoopback: true })
              : pinnedPublicMediaFetch(url, signal);
          }
        ),
      (err: any) => err?.code === 'SSRF_BLOCKED'
    );

    // 3. Real HTTP >100MB stream triggers FILE_TOO_LARGE and cancels reader
    await assert.rejects(
      () =>
        MediaImportService.importRemoteMedia(
          'user-1',
          { url: `http://127.0.0.1:${port}/oversized` },
          (url, signal) => pinnedPublicMediaFetch(url, signal, { allowDevelopmentLoopback: true })
        ),
      (err: any) => err?.code === 'FILE_TOO_LARGE'
    );
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('P0-D: createShutdown timeout leaves DB open under hanging tracked work and returns false on repeated calls', async () => {
  const lifecycle = new WorkLifecycle();
  let releaseHang!: () => void;
  let dbClosed = false;
  let timeoutActive: string[] = [];

  const timer = createTrackedPoller(
    'hanging-poller',
    () =>
      new Promise<void>((resolve) => {
        releaseHang = resolve;
      }),
    1000,
    lifecycle
  );

  const shutdown = createShutdown({
    lifecycle,
    stopPollers: () => clearInterval(timer),
    closeHttp: async () => {},
    closeDatabase: async () => {
      dbClosed = true;
    },
    timeoutMs: 25,
    onTimeout: (active) => {
      timeoutActive = active;
    },
  });

  const [r1, r2] = await Promise.all([shutdown(), shutdown()]);
  assert.equal(r1, false);
  assert.equal(r2, false);
  assert.equal(dbClosed, false, 'DB must NOT close when shutdown deadline expires with active work');
  assert.deepEqual(timeoutActive, ['hanging-poller']);
  assert.equal(lifecycle.isDraining(), true);

  // Release hanging work so process exits cleanly
  releaseHang();
  await lifecycle.waitForIdle();
});
