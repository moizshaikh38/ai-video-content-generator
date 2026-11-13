import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express, { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ContentPackService } from '../services/contentPackService.js';
import { ContentPackController } from '../controllers/contentPackController.js';
import { supabaseAuthClient } from '../utils/supabase.js';
import { errorHandler } from '../middleware/errorHandler.js';
import contentPackRouter from '../routes/contentPackRoutes.js';
import { config } from '../config/index.js';
import { AuthenticatedRequest } from '../types/index.js';

describe('Phase 4B.4 Phase 4: Standalone Routing & Pre-Production Hardening Tests', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();

  let packA1Id: string;
  let packA2Id: string;
  let packB1Id: string;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    config.openrouterApiKey = config.openrouterApiKey || 'mock-test-key-for-content-pack';

    const db = await getMongoDb();
    await db.command({ ping: 1 });

    packA1Id = crypto.randomUUID();
    packA2Id = crypto.randomUUID();
    packB1Id = crypto.randomUUID();

    const now = new Date();

    // Pack A1
    await db.collection('content_packs').insertOne({
      id: packA1Id,
      user_id: userA,
      source_type: 'clip',
      version: 1,
      status: 'APPROVED',
      source: {
        source_type: 'clip',
        transcript_source: 'Production Routing Highlights',
        duration: 35,
      },
      created_at: now,
      updated_at: now,
    });

    await db.collection('content_pack_items').insertMany([
      {
        id: crypto.randomUUID(),
        content_pack_id: packA1Id,
        user_id: userA,
        type: 'PRIMARY_TITLE',
        platform: 'all',
        text: 'Production Routing Highlights for Content Studio',
        variant_index: 0,
        approved: true,
        locked: false,
        created_at: now,
        updated_at: now,
      },
      {
        id: crypto.randomUUID(),
        content_pack_id: packA1Id,
        user_id: userA,
        type: 'SHORT_CAPTION',
        platform: 'shorts',
        text: 'Routing made simple with standalone URLs! #VireoClip #SaaS',
        variant_index: 0,
        approved: true,
        locked: true,
        created_at: now,
        updated_at: now,
      },
    ]);

    // Pack A2
    await db.collection('content_packs').insertOne({
      id: packA2Id,
      user_id: userA,
      source_type: 'upload',
      version: 1,
      status: 'DRAFT',
      source: {
        source_type: 'upload',
        transcript_source: 'Raw Footage Handoff',
        duration: 120,
      },
      created_at: now,
      updated_at: now,
    });

    // Pack B1 (User B for cross-tenant testing)
    await db.collection('content_packs').insertOne({
      id: packB1Id,
      user_id: userB,
      source_type: 'project',
      version: 1,
      status: 'DRAFT',
      source: {
        source_type: 'project',
        transcript_source: 'User B Secret Campaign',
        duration: 80,
      },
      created_at: now,
      updated_at: now,
    });

    // Setup an Express testing app mounting contentPackRouter with simulated auth headers
    const app = express();
    app.use(express.json());

    // Mock supabaseAuthClient.auth.getUser to recognize test tokens safely
    const originalGetUser = supabaseAuthClient.auth.getUser.bind(supabaseAuthClient.auth);
    (supabaseAuthClient.auth as any).getUser = async (token: string) => {
      if (token === 'test-user-a-token') {
        return { data: { user: { id: userA, email: 'userA@vireoclip.test' } }, error: null };
      }
      if (token === 'test-user-b-token') {
        return { data: { user: { id: userB, email: 'userB@vireoclip.test' } }, error: null };
      }
      return { data: { user: null }, error: { message: 'invalid JWT: mock unauthorized' } };
    };

    app.use('/api/content-packs', contentPackRouter);
    app.use(errorHandler);

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    baseUrl = `http://127.0.0.1:${port}/api/content-packs`;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const db = await getMongoDb();
    await db.collection('content_packs').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('content_pack_items').deleteMany({ user_id: { $in: [userA, userB] } });
    await closeMongo();
  });

  // 1. /studio route opens correctly and lists user's recent packs
  it('1. GET /recent endpoint opens correctly and lists authenticated user packs', async () => {
    const res = await fetch(`${baseUrl}/recent?limit=10`, {
      headers: { Authorization: `Bearer test-user-a-token` },
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.status, 'ok');
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.some((p: any) => p.id === packA1Id));
    assert.ok(body.data.some((p: any) => p.id === packA2Id));
    // User B's pack must be excluded
    assert.ok(!body.data.some((p: any) => p.id === packB1Id));
  });

  // 2. /studio/:id loads an existing pack
  it('2. GET /:id loads an existing pack directly with all items', async () => {
    const res = await fetch(`${baseUrl}/${packA1Id}`, {
      headers: { Authorization: `Bearer test-user-a-token` },
    });
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.data.id, packA1Id);
    assert.equal(body.data.items.length, 2);
  });

  // 3. Invalid pack ID shows a safe error state
  it('3. GET /:id with an invalid or non-existent ID returns safe 404', async () => {
    const fakeId = crypto.randomUUID();
    const res = await fetch(`${baseUrl}/${fakeId}`, {
      headers: { Authorization: `Bearer test-user-a-token` },
    });
    assert.equal(res.status, 404);
    const body: any = await res.json();
    assert.equal(body.status, 'error');
    assert.equal(body.code, 'CONTENT_PACK_NOT_FOUND');
  });

  // 4. Unauthenticated access is blocked (HTTP Route)
  it('4. Unauthenticated access to /batch-export or /:id is rejected with 401', async () => {
    const res1 = await fetch(`${baseUrl}/batch-export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack_ids: [packA1Id] }),
    });
    assert.equal(res1.status, 401);

    const res2 = await fetch(`${baseUrl}/${packA1Id}`);
    assert.equal(res2.status, 401);
  });

  // 5. Cross-tenant access is blocked (HTTP Route)
  it('5. User B cannot access User A pack or batch-export User A data via HTTP route', async () => {
    // Single pack route
    const resSingle = await fetch(`${baseUrl}/${packA1Id}`, {
      headers: { Authorization: `Bearer test-user-b-token` },
    });
    assert.equal(resSingle.status, 404);

    // Batch export route
    const resBatch = await fetch(`${baseUrl}/batch-export`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer test-user-b-token`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pack_ids: [packA1Id] }),
    });
    assert.equal(resBatch.status, 404);
  });

  // 6. JSON, Markdown, and CSV HTTP responses work
  it('6. POST /batch-export returns valid JSON, Markdown, and CSV payloads via HTTP route', async () => {
    // JSON
    const resJson = await fetch(`${baseUrl}/batch-export`, {
      method: 'POST',
      headers: { Authorization: `Bearer test-user-a-token`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack_ids: [packA1Id], format: 'json' }),
    });
    assert.equal(resJson.status, 200);
    const jsonBody: any = await resJson.json();
    assert.equal(jsonBody.data.content_type, 'application/json; charset=utf-8');
    assert.ok(jsonBody.data.content.includes(packA1Id));

    // Markdown
    const resMd = await fetch(`${baseUrl}/batch-export`, {
      method: 'POST',
      headers: { Authorization: `Bearer test-user-a-token`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack_ids: [packA1Id], format: 'markdown' }),
    });
    assert.equal(resMd.status, 200);
    const mdBody: any = await resMd.json();
    assert.equal(mdBody.data.content_type, 'text/markdown; charset=utf-8');
    assert.ok(mdBody.data.content.includes('# VireoClip Content Studio — Batch Export'));

    // CSV
    const resCsv = await fetch(`${baseUrl}/batch-export`, {
      method: 'POST',
      headers: { Authorization: `Bearer test-user-a-token`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack_ids: [packA1Id], format: 'csv' }),
    });
    assert.equal(resCsv.status, 200);
    const csvBody: any = await resCsv.json();
    assert.equal(csvBody.data.content_type, 'text/csv; charset=utf-8');
    assert.ok(csvBody.data.content.includes('Pack ID,Pack Title'));
  });

  // 7. Direct attachment download mode works (?download=true)
  it('7. POST /batch-export?download=true streams attachment directly with Content-Disposition', async () => {
    const res = await fetch(`${baseUrl}/batch-export?download=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer test-user-a-token`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pack_ids: [packA1Id], format: 'csv' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.match(res.headers.get('content-disposition') || '', /attachment; filename="vireo_/);
    const text = await res.text();
    assert.ok(text.includes('Pack ID,Pack Title'));
  });

  // 8. Batch export defensive item query limit (1000 items) is enforced
  it('8. Hard defensive query limit rejects batch export when items exceed 1000', async () => {
    const db = await getMongoDb();
    const overflowPackId = crypto.randomUUID();
    const now = new Date();

    await db.collection('content_packs').insertOne({
      id: overflowPackId,
      user_id: userA,
      source_type: 'clip',
      version: 1,
      status: 'APPROVED',
      source: { transcript_source: 'Large Item Overflow Pack' },
      created_at: now,
      updated_at: now,
    });

    // Seed 1,005 dummy items for this pack
    const dummyItems = Array.from({ length: 1005 }, (_, i) => ({
      id: crypto.randomUUID(),
      content_pack_id: overflowPackId,
      user_id: userA,
      type: 'PRIMARY_TITLE',
      platform: 'all',
      text: `Variant title #${i}`,
      variant_index: i,
      approved: false,
      locked: false,
      created_at: now,
      updated_at: now,
    }));
    await db.collection('content_pack_items').insertMany(dummyItems);

    try {
      const res = await fetch(`${baseUrl}/batch-export`, {
        method: 'POST',
        headers: { Authorization: `Bearer test-user-a-token`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_ids: [overflowPackId] }),
      });
      assert.equal(res.status, 400);
      const body: any = await res.json();
      assert.equal(body.code, 'BATCH_ITEM_LIMIT_EXCEEDED');
      assert.ok(body.message.includes('1000'));
    } finally {
      await db.collection('content_packs').deleteOne({ id: overflowPackId });
      await db.collection('content_pack_items').deleteMany({ content_pack_id: overflowPackId });
    }
  });

  // 9. Dashboard navigation item correctly links to /studio
  it('9. Verify navSections in DashboardLayout registers /studio', async () => {
    // Static code contract verification
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const filePath = path.resolve(process.cwd(), '../src/layouts/DashboardLayout.tsx');
    const layoutCode = await fs.readFile(filePath, 'utf-8');
    assert.ok(layoutCode.includes("{ to: '/studio', label: 'Content Studio', icon: Sparkles }"));
    assert.ok(!layoutCode.includes("{ to: '/dashboard#studio'"));
  });

  // 10. App routing registers /studio and /studio/:id under ProtectedRoute
  it('10. Verify App.tsx registers /studio and /studio/:id under ProtectedRoute', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const filePath = path.resolve(process.cwd(), '../src/App.tsx');
    const appCode = await fs.readFile(filePath, 'utf-8');
    assert.ok(appCode.includes('<Route path="/studio" element={<ContentStudioPage />} />'));
    assert.ok(appCode.includes('<Route path="/studio/:id" element={<ContentStudioPage />} />'));
  });
});
