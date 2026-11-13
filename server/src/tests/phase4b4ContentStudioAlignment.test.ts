import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ContentPackService } from '../services/contentPackService.js';
import { ContentPackController } from '../controllers/contentPackController.js';
import { defaultAiProvider } from '../services/aiProviderClient.js';
import { VideoIntelligenceRecord } from '../types/videoIntelligence.js';
import { config } from '../config/index.js';
import { AppError } from '../types/index.js';

describe('Phase 4B.4 — Phase 1: Backend Version History & Source Alignment', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  let projectId: string;
  let clipId: string;
  let videoIntelligenceId: string;
  let packAId: string;

  // Mock AI Provider
  const originalGenerateJsonCompletion = defaultAiProvider.generateJsonCompletion;

  before(async () => {
    config.openrouterApiKey = config.openrouterApiKey || 'mock-test-key-for-content-pack';

    // Ping MongoDB
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    projectId = crypto.randomUUID();
    clipId = crypto.randomUUID();
    videoIntelligenceId = crypto.randomUUID();

    // Mock AI completion returning valid grounded output
    defaultAiProvider.generateJsonCompletion = async () => {
      return {
        primary_title: 'High-Performance Video Repurposing on Intel Arc',
        alt_titles: [
          { text: 'How We Achieve 60fps Video Repurposing', category: 'BENEFIT' },
          { text: 'The Secret to Real-Time Video Clipping', category: 'CURIOSITY' },
        ],
        hooks: [
          'Want real-time 60fps video throughput?',
          'Here is how we built our GPU pipeline.',
        ],
        short_caption: 'Deep dive into high-performance video repurposing with Intel Arc GPU acceleration.',
        long_caption: 'Detailed architectural breakdown of real-time 60fps video repurposing.',
        short_description: 'An overview of high-speed video clipping and repurposing architecture.',
        long_description: 'Key takeaways from the video repurposing engineering pipeline.',
        cta_variants: ['Drop your questions below', 'Follow for more engineering insights'],
        hashtags: ['#VideoEngineering', '#IntelArc', '#VideoProcessing'],
        keywords: ['video repurposing', 'Intel Arc', '60fps'],
        thumbnail_direction: 'Creator working on a laptop at a desk with benchmark graphs',
        thumbnail_texts: ['60 FPS Live', 'GPU Power', 'Real-Time Clip'],
        alt_text: 'Creator working at a desk on a laptop with video editing timeline',
        pinned_comment: 'What GPU do you use for video encoding?',
        platform_packs: {
          youtube: {
            title: 'High-Performance Video Repurposing on Intel Arc',
            description: 'Full technical breakdown of 60fps throughput.',
          },
          linkedin: {
            post: 'Engineering lessons learned building a 60fps video pipeline.',
          },
        },
      } as any;
    };

    // Seed test Project, Clip, and Transcript inside ownerContext for userA
    await ownerContext.run(userA, async () => {
      await dataRepository.from('projects').insert({
        id: projectId,
        user_id: userA,
        title: 'Architectural Deep Dive into High-Performance Video Repurposing',
        source_type: 'upload',
        source_storage_path: `uploads/${userA}/test-video.mp4`,
        duration_seconds: 120,
        video_status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await dataRepository.from('clips').insert({
        id: clipId,
        user_id: userA,
        project_id: projectId,
        title: 'High-Performance Video Repurposing Architecture',
        start_seconds: 10,
        end_seconds: 40,
        duration: 30,
        status: 'ready',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await dataRepository.from('transcripts').insert({
        id: crypto.randomUUID(),
        user_id: userA,
        project_id: projectId,
        transcript_text:
          'Welcome to VireoClip engineering. Today we discuss high-performance video repurposing using Intel Arc GPU acceleration. We achieve real-time 60fps throughput.',
        language: 'en',
        segments: [
          {
            start: 10,
            end: 25,
            text: 'Welcome to VireoClip engineering. Today we discuss high-performance video repurposing.',
          },
          {
            start: 25,
            end: 40,
            text: 'Using Intel Arc GPU acceleration, we achieve real-time 60fps throughput.',
          },
        ],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });

    // Seed VideoIntelligenceRecord for upload source testing
    const db = await getMongoDb();
    const mockViRecord: VideoIntelligenceRecord = {
      id: videoIntelligenceId,
      user_id: userA,
      source_hash: crypto.randomUUID(),
      engine_version: '1.7.0',
      source_identity: {
        sourceHash: crypto.randomUUID(),
        rawContentHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        verificationLevel: 'FULL_CONTENT_SHA256',
        strategy: 'full_stream',
        fileSizeBytes: 1024 * 1024 * 25,
        containerSignature: {
          durationSeconds: 120,
          width: 1920,
          height: 1080,
          aspectRatio: '16:9',
          fps: 60,
          hasAudio: true,
        },
        engineVersion: '1.7.0',
        verifiedAt: new Date(),
      },
      status: 'completed',
      attempt_count: 1,
      max_attempts: 3,
      metadata: {
        durationSeconds: 120,
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        fps: 60,
        hasAudio: true,
      },
      audio_intelligence: {
        transcriptText:
          'Welcome to VireoClip engineering. Today we discuss high-performance video repurposing using Intel Arc GPU acceleration. We achieve real-time 60fps throughput.',
        language: 'en',
        segments: [],
        words: [],
        silenceIntervals: [],
        meanVolumeDb: -18,
        speakingPaceWpm: 140,
      },
      visual_intelligence: {
        ocr: [{ text: 'Throughput: 60 FPS', confidence: 0.98, timestamp: 24 }],
        objects: [{ label: 'laptop', category: 'device', confidence: 0.92, timestamp: 15 }],
        shots: [],
        scenes: [],
        faces: [],
        cameraMotion: [],
      },
      multimodal_reasoning: {
        summary: 'Deep dive into Intel Arc GPU performance benchmarks and video repurposing pipelines.',
        topics: ['Intel Arc', 'Video Repurposing', 'GPU Benchmarks'],
        groundedProvenance: {
          spokenFacts: [],
          visualObservations: [],
          ocrConfirmedText: [],
          inferences: [],
          contradictions: [],
        },
      },
      created_at: new Date(),
      updated_at: new Date(),
    };
    await db.collection('video_intelligence').insertOne(mockViRecord);

    // Initial pack generation for version history tests
    const initialPack = await ContentPackService.generateContentPack({
      userId: userA,
      sourceType: 'clip',
      projectId,
      clipId,
      mode: 'BALANCED',
      template: 'Creator',
    });
    packAId = initialPack.id;

    // Regenerate once to create version 2
    await ContentPackService.regeneratePack(userA, packAId, 'Punchier headlines');
  });

  after(async () => {
    defaultAiProvider.generateJsonCompletion = originalGenerateJsonCompletion;
    await closeMongo();
  });

  it('1. Authenticated user can retrieve their own version history', async () => {
    const history = await ContentPackService.getVersionHistory(userA, packAId);

    assert.ok(history, 'History response should be defined');
    assert.strictEqual(history.total, 2, 'Should have exactly 2 versions');
    assert.strictEqual(history.versions.length, 2, 'Should return 2 versions in page');
    assert.strictEqual(history.versions[0].version, 2, 'Newest version should be v2');
    assert.strictEqual(history.versions[1].version, 1, 'Initial version should be v1');
    assert.strictEqual(history.versions[0].user_id, userA, 'Version user_id must match owner');
    assert.strictEqual(history.versions[0].content_pack_id, packAId, 'Version content_pack_id must match');
    assert.ok(history.versions[0].snapshot, 'Version snapshot must be preserved');
    assert.ok(history.versions[0].change_summary, 'Change summary must be preserved');
  });

  it('2. User A cannot retrieve User B\'s pack history (Strict Tenant Isolation)', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.getVersionHistory(userB, packAId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError, 'Should throw AppError');
        assert.strictEqual(err.statusCode, 404, 'Must return 404 for unauthorized pack lookup');
        assert.strictEqual(err.code, 'CONTENT_PACK_NOT_FOUND');
        return true;
      }
    );
  });

  it('3. Non-existent pack returns the correct not-found response', async () => {
    const nonExistentId = crypto.randomUUID();
    await assert.rejects(
      async () => {
        await ContentPackService.getVersionHistory(userA, nonExistentId);
      },
      (err: any) => {
        assert.ok(err instanceof AppError, 'Should throw AppError');
        assert.strictEqual(err.statusCode, 404, 'Must return 404 for non-existent pack');
        assert.strictEqual(err.code, 'CONTENT_PACK_NOT_FOUND');
        return true;
      }
    );
  });

  it('4. Version history returns correct ordering (Descending vs Ascending)', async () => {
    // Default: descending
    const desc = await ContentPackService.getVersionHistory(userA, packAId, { order: 'desc' });
    assert.strictEqual(desc.versions[0].version, 2);
    assert.strictEqual(desc.versions[1].version, 1);

    // Ascending
    const asc = await ContentPackService.getVersionHistory(userA, packAId, { order: 'asc' });
    assert.strictEqual(asc.versions[0].version, 1);
    assert.strictEqual(asc.versions[1].version, 2);
  });

  it('5. Pagination and result limits work correctly', async () => {
    // Create third version to test pagination offsets
    await ContentPackService.regeneratePack(userA, packAId, 'Third iteration');

    const page1 = await ContentPackService.getVersionHistory(userA, packAId, { limit: 1, offset: 0 });
    assert.strictEqual(page1.total, 3, 'Total should be 3 versions');
    assert.strictEqual(page1.versions.length, 1, 'Page 1 should have 1 version');
    assert.strictEqual(page1.versions[0].version, 3, 'First page element should be v3');

    const page2 = await ContentPackService.getVersionHistory(userA, packAId, { limit: 1, offset: 1 });
    assert.strictEqual(page2.total, 3);
    assert.strictEqual(page2.versions.length, 1);
    assert.strictEqual(page2.versions[0].version, 2, 'Second page element should be v2');

    const page3 = await ContentPackService.getVersionHistory(userA, packAId, { limit: 1, offset: 2 });
    assert.strictEqual(page3.total, 3);
    assert.strictEqual(page3.versions.length, 1);
    assert.strictEqual(page3.versions[0].version, 1, 'Third page element should be v1');

    // Safe bound clamp: requested limit 100 clamped to 50
    const clamped = await ContentPackService.getVersionHistory(userA, packAId, { limit: 100 });
    assert.strictEqual(clamped.limit, 50, 'Limit must be clamped to safe max of 50');
  });

  it('6. Clip source payload remains compatible (omitting sourceType)', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId: userA,
      projectId,
      clipId,
      mode: 'BALANCED',
    });

    assert.ok(pack.id);
    assert.strictEqual(pack.source.source_type, 'clip');
    assert.strictEqual(pack.version, 1);
    assert.ok(pack.items && pack.items.length > 0);
  });

  it('7. Project source payload works (without clipId)', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId: userA,
      sourceType: 'project',
      projectId,
      mode: 'QUICK',
    });

    assert.ok(pack.id);
    assert.strictEqual(pack.source.source_type, 'project');
    assert.strictEqual(pack.project_id, projectId);
    assert.strictEqual(pack.clip_id, undefined);
  });

  it('8. Upload source payload works (using videoIntelligenceId)', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId: userA,
      sourceType: 'upload',
      videoIntelligenceId,
      sourceTitle: 'Uploaded Hardware Demo',
      mode: 'BALANCED',
    });

    assert.ok(pack.id);
    assert.strictEqual(pack.source.source_type, 'upload');
    assert.ok(pack.items && pack.items.length > 0);
  });

  it('9. Transcript source payload works (standalone raw transcript)', async () => {
    const rawTranscript =
      'Welcome to VireoClip engineering. Today we discuss high-performance video repurposing using Intel Arc GPU acceleration. We achieve real-time 60fps throughput.';

    const pack = await ContentPackService.generateContentPack({
      userId: userA,
      sourceType: 'transcript',
      transcriptText: rawTranscript,
      sourceTitle: 'Live Architecture Session',
      mode: 'QUICK',
    });

    assert.ok(pack.id);
    assert.strictEqual(pack.source.source_type, 'transcript');
    assert.strictEqual(pack.project_id, undefined);
    assert.strictEqual(pack.clip_id, undefined);
  });

  it('10. Recent Content Packs API service works and enforces user isolation', async () => {
    const recentA = await ContentPackService.listRecentPacks(userA, 10);
    assert.ok(Array.isArray(recentA));
    assert.ok(recentA.length >= 4, 'User A should have at least 4 generated packs');
    assert.ok(recentA.every((p) => p.user_id === userA), 'All returned packs must belong strictly to User A');

    // User B must have no packs returned
    const recentB = await ContentPackService.listRecentPacks(userB, 10);
    assert.ok(Array.isArray(recentB));
    assert.strictEqual(recentB.length, 0, 'User B should see 0 packs from User A');
  });

  it('11. HTTP Controller integration: getVersionHistory endpoint structure', async () => {
    let statusCode: number | null = null;
    let jsonPayload: any = null;

    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: any) {
        jsonPayload = payload;
        return this;
      },
    } as any;

    const mockReq = {
      user: { id: userA },
      params: { id: packAId },
      query: { limit: '2', offset: '0', order: 'desc' },
    } as any;

    await ContentPackController.getVersionHistory(mockReq, mockRes);

    assert.ok(jsonPayload, 'Response JSON must be delivered');
    assert.strictEqual(jsonPayload.status, 'ok');
    assert.ok(Array.isArray(jsonPayload.data), 'data must be an array of versions');
    assert.strictEqual(jsonPayload.data.length, 2);
    assert.ok(jsonPayload.pagination, 'pagination metadata must be present');
    assert.strictEqual(jsonPayload.pagination.limit, 2);
    assert.strictEqual(jsonPayload.pagination.offset, 0);
    assert.strictEqual(jsonPayload.pagination.total, 3);

    // Unauthenticated request rejects with 401
    const unauthReq = { user: undefined, params: { id: packAId }, query: {} } as any;
    await assert.rejects(
      async () => {
        await ContentPackController.getVersionHistory(unauthReq, mockRes);
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 401);
        return true;
      }
    );
  });
});

