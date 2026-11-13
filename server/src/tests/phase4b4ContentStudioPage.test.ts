import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ContentPackService } from '../services/contentPackService.js';
import { defaultAiProvider } from '../services/aiProviderClient.js';
import { VideoIntelligenceRecord } from '../types/videoIntelligence.js';
import { CreditPricingService } from '../services/billing/creditPricingService.js';
import { config } from '../config/index.js';
import { AppError } from '../types/index.js';

describe('Phase 4B.4 — Phase 2: Standalone Content Studio Backend Alignment & Invariants', () => {
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  let projectId: string;
  let clipId: string;
  let videoIntelligenceId: string;
  let packAId: string;

  const originalGenerateJsonCompletion = defaultAiProvider.generateJsonCompletion;

  before(async () => {
    config.openrouterApiKey = config.openrouterApiKey || 'mock-test-key-for-content-pack';

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

    defaultAiProvider.generateJsonCompletion = async () => {
      return {
        primary_title: 'Standalone Studio Masterpiece',
        alt_titles: [
          { text: 'How We Built Real-Time Video Repurposing', category: 'BENEFIT' },
        ],
        hooks: ['Want automated video content generation?'],
        short_caption: 'Transform any video into social packages in seconds.',
        long_caption: 'Detailed walkthrough of the multi-source Content Studio architecture.',
        short_description: 'An overview of the content studio pipeline.',
        long_description: 'Key takeaways from the video repurposing engineering pipeline.',
        cta_variants: ['Drop a comment below'],
        hashtags: ['#ContentStudio', '#VideoAI'],
        keywords: ['content studio', 'video ai'],
        thumbnail_direction: 'Modern creator workspace with timeline graphics',
        thumbnail_texts: ['AI Studio', 'Instant Packs'],
        alt_text: 'Content Studio editor interface',
        pinned_comment: 'What source do you use most often?',
        platform_packs: {
          youtube: { title: 'Standalone Studio Masterpiece', description: 'Complete technical overview.' },
          linkedin: { post: 'Key learnings from building our Content Studio.' },
        },
      } as any;
    };

    // Seed test Project, Clip, and Transcript inside ownerContext for userA
    await ownerContext.run(userA, async () => {
      await dataRepository.from('projects').insert({
        id: projectId,
        user_id: userA,
        title: 'Content Studio Groundwork Project',
        source_type: 'upload',
        source_storage_path: `uploads/${userA}/studio-test.mp4`,
        duration_seconds: 90,
        video_status: 'completed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await dataRepository.from('clips').insert({
        id: clipId,
        user_id: userA,
        project_id: projectId,
        title: 'Content Studio Clip 1',
        start_seconds: 5,
        end_seconds: 35,
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
          'Welcome to the standalone Content Studio. Today we demonstrate multi-source generation across clips, projects, uploads, and transcripts.',
        language: 'en',
        segments: [
          {
            start: 5,
            end: 35,
            text: 'Welcome to the standalone Content Studio. Today we demonstrate multi-source generation.',
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
        fileSizeBytes: 1024 * 1024 * 10,
        containerSignature: {
          durationSeconds: 60,
          width: 1920,
          height: 1080,
          aspectRatio: '16:9',
          fps: 30,
          hasAudio: true,
        },
        engineVersion: '1.7.0',
        verifiedAt: new Date(),
      },
      status: 'completed',
      attempt_count: 1,
      max_attempts: 3,
      metadata: {
        durationSeconds: 60,
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        fps: 30,
        hasAudio: true,
      },
      audio_intelligence: {
        transcriptText:
          'Welcome to the standalone Content Studio. Today we demonstrate multi-source generation across clips, projects, uploads, and transcripts.',
        language: 'en',
        segments: [],
        words: [],
        silenceIntervals: [],
        meanVolumeDb: -16,
        speakingPaceWpm: 130,
      },
      visual_intelligence: {
        ocr: [{ text: 'Content Studio Active', confidence: 0.99, timestamp: 10 }],
        objects: [{ label: 'laptop', category: 'device', confidence: 0.95, timestamp: 12 }],
        shots: [],
        scenes: [],
        faces: [],
        cameraMotion: [],
      },
      multimodal_reasoning: {
        summary: 'Demo video showing Content Studio capabilities.',
        topics: ['Content Studio', 'Video Repurposing'],
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
  });

  after(async () => {
    defaultAiProvider.generateJsonCompletion = originalGenerateJsonCompletion;
    await closeMongo();
  });

  it('1. Commercial Invariant: Content Studio generation operations cost exactly 0 credits', () => {
    const cost = CreditPricingService.calculateOperationCost('content_pack_generation');
    assert.strictEqual(cost.credits, 0, 'Content pack generation must cost 0 credits');

    const studioCost = CreditPricingService.calculateOperationCost('studio_content_pack');
    assert.strictEqual(studioCost.credits, 0, 'Studio content pack must cost 0 credits');

    const estimate = CreditPricingService.estimateOperation('content_pack_generation', {}, 10);
    assert.strictEqual(estimate.estimated_credits, 0);
    assert.strictEqual(estimate.has_sufficient_credits, true);
  });

  it('2. Source 1 (Clip): Successful generation with required fields', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId: userA,
      sourceType: 'clip',
      projectId,
      clipId,
      mode: 'BALANCED',
      template: 'Creator',
    });

    assert.ok(pack.id);
    packAId = pack.id;
    assert.strictEqual(pack.source.source_type, 'clip');
    assert.strictEqual(pack.project_id, projectId);
    assert.strictEqual(pack.clip_id, clipId);
  });

  it('3. Source 1 (Clip): Validation rejects missing projectId or clipId', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId: userA,
          sourceType: 'clip',
          projectId,
          // clipId missing
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  it('4. Source 2 (Project): Successful generation without clipId', async () => {
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

  it('5. Source 2 (Project): Validation rejects missing projectId', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId: userA,
          sourceType: 'project',
          // projectId missing
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  it('6. Source 3 (Upload): Successful generation via videoIntelligenceId', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId: userA,
      sourceType: 'upload',
      videoIntelligenceId,
      sourceTitle: 'Hardware Demo Upload',
      mode: 'FULL',
    });

    assert.ok(pack.id);
    assert.strictEqual(pack.source.source_type, 'upload');
  });

  it('7. Source 3 (Upload): Validation rejects missing both projectId and videoIntelligenceId', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId: userA,
          sourceType: 'upload',
          // both missing
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  it('8. Source 4 (Transcript): Successful generation with raw text only', async () => {
    const pack = await ContentPackService.generateContentPack({
      userId: userA,
      sourceType: 'transcript',
      transcriptText:
        'Welcome to the standalone Content Studio. Today we demonstrate multi-source generation across clips, projects, uploads, and transcripts.',
      sourceTitle: 'Raw Speech Transcript',
      mode: 'BALANCED',
    });

    assert.ok(pack.id);
    assert.strictEqual(pack.source.source_type, 'transcript');
    assert.strictEqual(pack.project_id, undefined);
    assert.strictEqual(pack.clip_id, undefined);
  });

  it('9. Source 4 (Transcript): Validation rejects empty or whitespace-only transcript', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId: userA,
          sourceType: 'transcript',
          transcriptText: '    \n\t   ',
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  it('10. Recent Content Packs: Retrieves packs exclusively for the authenticated user', async () => {
    const recentA = await ContentPackService.listRecentPacks(userA, 10);
    assert.ok(Array.isArray(recentA));
    assert.ok(recentA.length >= 4, 'User A should have at least 4 generated packs');
    assert.ok(recentA.every((p) => p.user_id === userA), 'All packs must belong strictly to userA');

    const recentB = await ContentPackService.listRecentPacks(userB, 10);
    assert.ok(Array.isArray(recentB));
    assert.strictEqual(recentB.length, 0, 'User B must see 0 packs from User A');
  });

  it('11. Opening an existing pack: Retrieves complete pack with items and validates owner boundary', async () => {
    const loaded = await ContentPackService.getContentPack(userA, packAId);
    assert.ok(loaded);
    assert.strictEqual(loaded.id, packAId);
    assert.strictEqual(loaded.user_id, userA);
    assert.ok(Array.isArray(loaded.items));

    // Cross-user access rejected
    await assert.rejects(
      async () => {
        await ContentPackService.getContentPack(userB, packAId);
      },
      (err: any) => {
        assert.strictEqual(err.statusCode, 404);
        assert.strictEqual(err.code, 'CONTENT_PACK_NOT_FOUND');
        return true;
      }
    );
  });
});

