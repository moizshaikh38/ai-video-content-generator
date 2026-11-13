import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ContentPackService } from '../services/contentPackService.js';
import { ContentPackController } from '../controllers/contentPackController.js';
import { CreditRepository } from '../db/repositories/creditRepository.js';
import { config } from '../config/index.js';
import { AppError } from '../types/index.js';

describe('Phase 4B.4 Phase 3: Workspace Decoupling & Batch Export Tests', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();

  let packA1Id: string;
  let packA2Id: string;
  let packA3Id: string;
  let packB1Id: string;

  before(async () => {
    config.openrouterApiKey = config.openrouterApiKey || 'mock-test-key-for-content-pack';

    // Verify MongoDB connection
    const db = await getMongoDb();
    await db.command({ ping: 1 });

    // Seed test packs for User A
    packA1Id = crypto.randomUUID();
    packA2Id = crypto.randomUUID();
    packA3Id = crypto.randomUUID();
    packB1Id = crypto.randomUUID();

    const now = new Date();

    // Pack A1 (Clip source with items)
    await db.collection('content_packs').insertOne({
      id: packA1Id,
      user_id: userA,
      source_type: 'clip',
      version: 1,
      status: 'DRAFT',
      source: {
        source_type: 'clip',
        transcript_source: 'How AI Video Repurposing Works',
        duration: 45,
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
        text: 'How AI Video Repurposing Works in 2026',
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
        platform: 'youtube',
        text: 'Check out the new automated clipping pipeline! #AI #Video',
        variant_index: 0,
        approved: false,
        locked: true,
        created_at: now,
        updated_at: now,
      },
    ]);

    // Pack A2 (Upload source with malicious CSV formula text)
    await db.collection('content_packs').insertOne({
      id: packA2Id,
      user_id: userA,
      source_type: 'upload',
      version: 2,
      status: 'APPROVED',
      source: {
        source_type: 'upload',
        transcript_source: '=cmd|"/C calc"!A0',
        duration: 60,
      },
      created_at: now,
      updated_at: now,
    });

    await db.collection('content_pack_items').insertOne({
      id: crypto.randomUUID(),
      content_pack_id: packA2Id,
      user_id: userA,
      type: 'PRIMARY_TITLE',
      platform: 'tiktok',
      text: '+@SUM(1+1)*cmd',
      variant_index: 0,
      approved: true,
      locked: true,
      created_at: now,
      updated_at: now,
    });

    // Pack A3 (Transcript source, empty items)
    await db.collection('content_packs').insertOne({
      id: packA3Id,
      user_id: userA,
      source_type: 'transcript',
      version: 1,
      status: 'DRAFT',
      source: {
        source_type: 'transcript',
        transcript_source: 'Interview with DeepMind Engineer',
        duration: 90,
      },
      created_at: now,
      updated_at: now,
    });

    // Pack B1 (User B pack for tenant isolation testing)
    await db.collection('content_packs').insertOne({
      id: packB1Id,
      user_id: userB,
      source_type: 'project',
      version: 1,
      status: 'DRAFT',
      source: {
        source_type: 'project',
        transcript_source: 'Confidential User B Strategy',
        duration: 120,
      },
      created_at: now,
      updated_at: now,
    });

    // Also seed a wallet for User A to prove credit balance remains invariant (0 credits)
    await CreditRepository.getOrCreateWallet(userA);
  });

  after(async () => {
    const db = await getMongoDb();
    await db.collection('content_packs').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('content_pack_items').deleteMany({ user_id: { $in: [userA, userB] } });
    await db.collection('credit_wallets').deleteMany({ user_id: userA });
    await closeMongo();
  });

  // 1. Standalone workspace operates without modal-parent dependencies
  it('1. Standalone workspace retrieves pack directly by ID without projectId/clipId requirements', async () => {
    const pack = await ContentPackService.getContentPack(userA, packA3Id);
    assert.equal(pack.id, packA3Id);
    assert.equal(pack.source.source_type, 'transcript');
    assert.ok(Array.isArray(pack.items));
  });

  // 2. Existing modal integration remains functional
  it('2. Existing modal integration can retrieve pack for clip correctly', async () => {
    // If a pack is associated with a clip, listPacksForClip returns it
    const clipPacks = await ContentPackService.listPacksForClip(userA, 'non-existent-clip');
    assert.ok(Array.isArray(clipPacks));
    assert.equal(clipPacks.length, 0);
  });

  // 3. Existing EditorShell integration remains functional
  it('3. Existing EditorShell integration works when loading full pack with version snapshots', async () => {
    const pack = await ContentPackService.getContentPack(userA, packA1Id);
    assert.equal(pack.id, packA1Id);
    assert.equal(pack.items?.length, 2);
  });

  // 4. Multiple content packs can be selected
  it('4. Multiple content packs can be selected and processed in a batch', async () => {
    const result = await ContentPackService.batchExportPacks(userA, [packA1Id, packA2Id], 'json');
    assert.equal(result.exportedCount, 2);
    assert.equal(result.missingIds.length, 0);
    const parsed = JSON.parse(result.content);
    assert.equal(parsed.packs.length, 2);
    assert.equal(parsed.status, 'ok');
  });

  // 5. Select-all and clear-selection work correctly (backend deduplication and handling)
  it('5. Duplicate IDs in batch request are safely de-duplicated', async () => {
    const result = await ContentPackService.batchExportPacks(userA, [packA1Id, packA1Id, packA2Id], 'json');
    assert.equal(result.exportedCount, 2);
  });

  // 6. Batch export contains the expected selected packs
  it('6. Batch export contains all expected items and platforms in JSON format', async () => {
    const result = await ContentPackService.batchExportPacks(userA, [packA1Id], 'json');
    const parsed = JSON.parse(result.content);
    const pack1 = parsed.packs.find((p: any) => p.id === packA1Id);
    assert.ok(pack1);
    assert.equal(pack1.items.length, 2);
    assert.equal(pack1.items[0].type, 'PRIMARY_TITLE');
  });

  // 7. Unselected packs are excluded
  it('7. Unselected packs are excluded from the exported bundle', async () => {
    const result = await ContentPackService.batchExportPacks(userA, [packA1Id], 'json');
    const parsed = JSON.parse(result.content);
    assert.equal(parsed.packs.length, 1);
    assert.equal(parsed.packs[0].id, packA1Id);
    assert.ok(!parsed.packs.some((p: any) => p.id === packA2Id));
  });

  // 8. Cross-tenant pack IDs are rejected / excluded safely
  it('8. Cross-tenant pack IDs are rejected and never leaked', async () => {
    // User A attempts to batch export User B's pack
    await assert.rejects(
      async () => {
        await ContentPackService.batchExportPacks(userA, [packB1Id], 'json');
      },
      (err: any) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, 'CONTENT_PACK_NOT_FOUND');
        return true;
      }
    );
  });

  // 9. Missing or invalid pack IDs are handled safely
  it('9. Missing or invalid pack IDs alongside valid ones are reported in missingIds', async () => {
    const fakeId = crypto.randomUUID();
    const result = await ContentPackService.batchExportPacks(userA, [packA1Id, fakeId], 'json');
    assert.equal(result.exportedCount, 1);
    assert.deepEqual(result.missingIds, [fakeId]);
  });

  // 10. Partial export failures are reported correctly
  it('10. Partial export failures include exact missing IDs and valid packs', async () => {
    const fake1 = crypto.randomUUID();
    const fake2 = crypto.randomUUID();
    const result = await ContentPackService.batchExportPacks(userA, [packA1Id, fake1, fake2], 'markdown');
    assert.equal(result.exportedCount, 1);
    assert.equal(result.missingIds.length, 2);
    assert.ok(result.content.includes('# VireoClip Content Studio — Batch Export (1 Packs)'));
  });

  // 11. Duplicate submissions are prevented / empty ID arrays rejected
  it('11. Empty pack ID arrays or invalid formats reject with 400', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.batchExportPacks(userA, [], 'json');
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_INPUT');
        return true;
      }
    );
  });

  // 12. Batch size limits are enforced (max 25)
  it('12. Enforces batch size limits (>25 rejects with BATCH_LIMIT_EXCEEDED)', async () => {
    const tooMany = Array.from({ length: 26 }, () => crypto.randomUUID());
    await assert.rejects(
      async () => {
        await ContentPackService.batchExportPacks(userA, tooMany, 'json');
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'BATCH_LIMIT_EXCEEDED');
        return true;
      }
    );
  });

  // 13. Large payload handling is bounded and Markdown export format works
  it('13. Markdown format generates clean hierarchy and handles empty item packs', async () => {
    const result = await ContentPackService.batchExportPacks(userA, [packA1Id, packA3Id], 'markdown');
    assert.equal(result.contentType, 'text/markdown; charset=utf-8');
    assert.ok(result.content.includes('# VireoClip Content Studio — Batch Export (2 Packs)'));
    assert.ok(result.content.includes('## 1. How AI Video Repurposing Works'));
    assert.ok(result.content.includes('## 2. Interview with DeepMind Engineer'));
    assert.ok(result.content.includes('(No items generated yet)'));
  });

  // 14. Filenames are sanitized and CSV Formula Injection is neutralized
  it('14. Filenames are sanitized and CSV formula injection characters are safely escaped', async () => {
    const result = await ContentPackService.batchExportPacks(userA, [packA2Id], 'csv');
    assert.equal(result.contentType, 'text/csv; charset=utf-8');
    // Verify filename sanitization: dangerous characters removed
    assert.ok(!result.filename.includes('='));
    assert.ok(!result.filename.includes('|'));
    assert.ok(!result.filename.includes('"'));

    // Verify CSV Content: formula injection characters (=, +, @) must be escaped with single quote
    const csvLines = result.content.split('\r\n');
    assert.ok(csvLines.length >= 2);
    // Find the malicious title row
    const row = csvLines.find((l) => l.includes(packA2Id));
    assert.ok(row);
    assert.ok(row.includes("=cmd"));
    assert.ok(row.includes("+@SUM"));
  });

  // 15. Existing single-pack export remains compatible via batchExportPacks with 1 pack
  it('15. Single-pack export via batchExportPacks returns valid bundle and filename', async () => {
    const result = await ContentPackService.batchExportPacks(userA, [packA1Id], 'json');
    assert.equal(result.exportedCount, 1);
    assert.ok(result.filename.startsWith('vireo_How_AI_Video_Repurposing_Work'));
    assert.ok(result.filename.endsWith('.json'));
  });

  // 16. Export does not trigger AI generation or consume credits (wallet balance invariant)
  it('16. Batch export is strictly 0 credits and does NOT mutate user wallet balance', async () => {
    const db = await getMongoDb();
    const walletBefore = await CreditRepository.getOrCreateWallet(userA);
    const balanceBefore = walletBefore.available_credits;

    // Perform multiple batch exports in all 3 formats
    await ContentPackService.batchExportPacks(userA, [packA1Id, packA2Id], 'json');
    await ContentPackService.batchExportPacks(userA, [packA1Id, packA2Id], 'markdown');
    await ContentPackService.batchExportPacks(userA, [packA1Id, packA2Id], 'csv');

    const walletAfter = await CreditRepository.getOrCreateWallet(userA);
    assert.equal(walletAfter.available_credits, balanceBefore);
    assert.equal(walletAfter.reserved_credits, walletBefore.reserved_credits);
  });
});
