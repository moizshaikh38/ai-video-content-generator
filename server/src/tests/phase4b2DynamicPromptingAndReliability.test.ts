import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { ContentPackService } from '../services/contentPackService.js';
import {
  OpenRouterContentProvider,
  GroqContentProvider,
  ReliableAiContentProvider,
  defaultAiProvider,
  isTransientError,
  calculateBackoffDelay,
  estimateProviderCostUsd,
} from '../services/aiProviderClient.js';
import { SUPPORTED_STUDIO_PLATFORMS, OutputPlatform, AppError } from '../types/index.js';
import { VideoIntelligenceRecord } from '../types/videoIntelligence.js';
import { config } from '../config/index.js';

describe('Phase 4B.2 — Dynamic Platform Prompting & Provider Reliability Test Suite', () => {
  const userId = crypto.randomUUID();
  let projectId: string;
  let clipId: string;
  let uploadViId: string;

  const validAiMockOutput = {
    primary_title: 'High Performance Video Repurposing Architecture',
    alt_titles: [
      { text: 'Scale Your Video Pipelines with Hardware Acceleration', category: 'BENEFIT' },
      { text: 'How to Process 4K 60FPS Video Reliably', category: 'QUESTION' },
    ],
    hooks: [
      'Stop waiting hours for video transcodes.',
      'Here is the secret to real-time video repurposing.',
    ],
    short_caption: 'Stop waiting hours for video transcodes. Hardware acceleration changes everything.',
    long_caption: 'Detailed architectural breakdown of hardware acceleration and video pipelines.',
    short_description: 'An architectural breakdown of video repurposing and hardware pipelines.',
    long_description: 'Full technical overview covering Intel QSV, queue management, and video pipelines.',
    cta_variants: ['Drop your questions in the comments below!'],
    hashtags: ['#VideoEngineering', '#FFmpeg', '#DevOps'],
    keywords: ['video processing', 'hardware acceleration', 'transcoding'],
    thumbnail_direction: 'High-contrast workstation screen with hardware telemetry graphs',
    thumbnail_texts: ['60 FPS Transcode', 'Zero Latency'],
    alt_text: 'Engineering architecture diagram showing video pipeline',
    pinned_comment: 'Which hardware encoder do you use in your production stack?',
    platform_packs: {
      youtube: {
        title: 'Mastering Hardware-Accelerated Video Repurposing',
        description: 'Complete walkthrough of high-performance video pipelines with Intel QSV.\n\nChapters:\n0:00 Intro\n1:00 Pipeline Architecture',
        hashtags: ['#YouTubeTech', '#VideoArchitecture'],
      },
      shorts: {
        title: '10x Faster Video Transcodes',
        caption: 'Stop waiting hours for video exports. Use hardware encoders.',
        hashtags: ['#Shorts', '#TechTips'],
      },
      instagram: {
        caption: 'Want to scale your video content without melting your CPU?\n\nHere is how hardware pipelines work.\n\nSave this for later!',
        hashtags: ['#InstagramReels', '#VideoCreator'],
        cta: 'Save this post for later!',
      },
      tiktok: {
        caption: 'How we process 4K video at 60fps in seconds #techtok #coding',
        hashtags: ['#TechTok', '#CodingTips'],
      },
      linkedin: {
        post: 'Video infrastructure bottlenecked by CPU encoding? We implemented Intel QSV hardware pipelines.\n\nKey takeaways:\n1. 5x throughput\n2. Bounded memory\n3. Zero frame drops.',
        cta: 'How does your engineering team manage video transcoding at scale?',
      },
      x: {
        post: 'Hardware-accelerated video pipelines cut transcode latency by 80%. Here is the architectural breakdown:',
      },
    },
    explanations: {
      primary_title: 'Directly reflects discussion of video pipelines and hardware acceleration',
    },
  };

  const sampleTranscript =
    'Welcome to the architectural breakdown of high performance video pipelines and hardware acceleration. In this session we demonstrate Intel QSV transcoding and bounded memory allocation. Video engineering teams can scale processing throughput dramatically.';

  before(async () => {
    config.openrouterApiKey = config.openrouterApiKey || 'mock-openrouter-key';
    config.groqApiKey = config.groqApiKey || 'mock-groq-key';

    const db = await getMongoDb();
    await db.command({ ping: 1 });

    projectId = crypto.randomUUID();
    clipId = crypto.randomUUID();
    uploadViId = crypto.randomUUID();

    // Seed test Project, Clip, and Transcript
    await ownerContext.run(userId, async () => {
      await dataRepository.from('projects').insert({
        id: projectId,
        user_id: userId,
        title: 'High Performance Video Repurposing Architecture',
        source_type: 'upload',
        status: 'READY',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await dataRepository.from('clips').insert({
        id: clipId,
        user_id: userId,
        project_id: projectId,
        title: 'Pipeline Architecture Clip',
        start_time: 10,
        end_time: 40,
        duration: 30,
        status: 'READY',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await dataRepository.from('transcripts').insert({
        id: crypto.randomUUID(),
        user_id: userId,
        project_id: projectId,
        transcript_text: sampleTranscript,
        language: 'en',
        segments: [
          { start: 10, end: 40, text: sampleTranscript },
        ],
        created_at: new Date().toISOString(),
      });
    });

    // Seed test VideoIntelligenceRecord for upload source
    const mockViRecord: VideoIntelligenceRecord = {
      id: uploadViId,
      user_id: userId,
      source_hash: crypto.randomUUID(),
      metadata: { durationSeconds: 60, width: 1920, height: 1080, fps: 30, format: 'mp4' },
      source_identity: {
        rawContentHash: 'b'.repeat(64),
        containerFormat: 'mp4',
        durationSeconds: 60,
        fileSizeBytes: 2048000,
        videoStreams: [{ index: 0, codec: 'h264', width: 1920, height: 1080, fps: 30 }],
        audioStreams: [{ index: 1, codec: 'aac', sampleRate: 48000, channels: 2 }],
      },
      audio_intelligence: {
        transcriptText: sampleTranscript,
        language: 'en',
        segments: [],
        words: [],
        silenceIntervals: [],
        meanVolumeDb: -18,
        speakingPaceWpm: 140,
      },
      visual_intelligence: {
        ocr: [{ text: 'Intel QSV Benchmark', confidence: 0.95, timestamp: 12 }],
        objects: [{ label: 'server', category: 'hardware', confidence: 0.9, timestamp: 15 }],
        shots: [],
        scenes: [],
        faces: [],
        cameraMotion: [],
      },
      multimodal_reasoning: {
        summary: 'Discussion of video pipeline architecture and Intel QSV hardware acceleration.',
        topics: ['Video Pipelines', 'Hardware Acceleration', 'Intel QSV'],
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
    try {
      const db = await getMongoDb();
      await db.collection('projects').deleteMany({ user_id: userId });
      await db.collection('clips').deleteMany({ user_id: userId });
      await db.collection('transcripts').deleteMany({ user_id: userId });
      await db.collection('content_packs').deleteMany({ user_id: userId });
      await db.collection('content_pack_items').deleteMany({ user_id: userId });
      await db.collection('content_pack_versions').deleteMany({ user_id: userId });
      await db.collection('content_generation_telemetry').deleteMany({ user_id: userId });
      await db.collection('video_intelligence').deleteMany({ user_id: userId });
    } catch {}
    await closeMongo();
  });

  // =========================================================================
  // SCENARIO 1: Individual Platform Selection (YouTube only, LinkedIn only, etc.)
  // =========================================================================
  it('1. Individual Platform Selection: generates content strictly for single selected platform', async () => {
    // Mock provider to return mock output with telemetry
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;
    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        promptTokens: 520,
        completionTokens: 280,
        totalTokens: 800,
        latencyMs: 350,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: false,
        tokenMeasurementType: 'provider_measured',
        estimatedProviderCostUsd: 0.005,
      },
    });

    try {
      const pack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['youtube'],
      });

      assert.deepEqual(pack.selected_platforms, ['youtube']);
      assert.ok(pack.items && pack.items.length > 0);

      const platformsPresent = new Set(pack.items.map((i) => i.platform));
      assert.ok(platformsPresent.has('youtube'), 'Should have youtube items');
      assert.ok(platformsPresent.has('all'), 'Should have shared/global items');
      assert.ok(!platformsPresent.has('shorts'), 'Should not have shorts');
      assert.ok(!platformsPresent.has('instagram'), 'Should not have instagram');
      assert.ok(!platformsPresent.has('tiktok'), 'Should not have tiktok');
      assert.ok(!platformsPresent.has('linkedin'), 'Should not have linkedin');
      assert.ok(!platformsPresent.has('x'), 'Should not have x');

      // YouTube specific item checks
      const ytTitle = pack.items.find((i) => i.platform === 'youtube' && i.type === 'PRIMARY_TITLE');
      const ytDesc = pack.items.find((i) => i.platform === 'youtube' && i.type === 'LONG_DESCRIPTION');
      assert.ok(ytTitle, 'Must generate youtube PRIMARY_TITLE');
      assert.ok(ytDesc, 'Must generate youtube LONG_DESCRIPTION');
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 2: Multiple Selected Platforms (e.g. YouTube + LinkedIn only)
  // =========================================================================
  it('2. Multiple Selected Platforms: generates content strictly for selected subset', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;
    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        promptTokens: 650,
        completionTokens: 380,
        totalTokens: 1030,
        latencyMs: 400,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: false,
        tokenMeasurementType: 'provider_measured',
        estimatedProviderCostUsd: 0.007,
      },
    });

    try {
      const pack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['youtube', 'linkedin'],
      });

      assert.deepEqual(pack.selected_platforms, ['youtube', 'linkedin']);

      const platformSet = new Set(pack.items?.map((i) => i.platform));
      assert.ok(platformSet.has('youtube'), 'Must have youtube items');
      assert.ok(platformSet.has('linkedin'), 'Must have linkedin items');
      assert.ok(platformSet.has('all'), 'Must have all/shared items');
      assert.ok(!platformSet.has('instagram'), 'Must NOT have instagram');
      assert.ok(!platformSet.has('tiktok'), 'Must NOT have tiktok');
      assert.ok(!platformSet.has('shorts'), 'Must NOT have shorts');
      assert.ok(!platformSet.has('x'), 'Must NOT have x');
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 3: Select All (all 6 platforms)
  // =========================================================================
  it('3. Select All: supports "all" keyword and expands to all 6 supported platforms', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;
    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        promptTokens: 900,
        completionTokens: 750,
        totalTokens: 1650,
        latencyMs: 500,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: false,
        tokenMeasurementType: 'provider_measured',
        estimatedProviderCostUsd: 0.011,
      },
    });

    try {
      const pack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['all'],
      });

      assert.deepEqual(pack.selected_platforms, [...SUPPORTED_STUDIO_PLATFORMS]);

      const platformSet = new Set(pack.items?.map((i) => i.platform));
      for (const p of SUPPORTED_STUDIO_PLATFORMS) {
        assert.ok(platformSet.has(p), `Pack must contain items for platform: ${p}`);
      }
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 4: Invalid Platform Identifier Rejection
  // =========================================================================
  it('4. Invalid Platform Identifier: rejects unsupported platform with 400 INVALID_PLATFORM_SELECTION', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId,
          projectId,
          clipId,
          platforms: ['myspace' as any],
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_PLATFORM_SELECTION');
        assert.ok(err.message.includes('Invalid platform'));
        return true;
      }
    );

    // Also test mixed valid and invalid
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId,
          projectId,
          clipId,
          platforms: ['youtube', 'snapchat' as any],
        });
      },
      (err: any) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_PLATFORM_SELECTION');
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 5: Empty Platform Array Rejection
  // =========================================================================
  it('5. Empty Platform Array: rejects empty platform array with 400 INVALID_PLATFORM_SELECTION', async () => {
    await assert.rejects(
      async () => {
        await ContentPackService.generateContentPack({
          userId,
          projectId,
          clipId,
          platforms: [],
        });
      },
      (err: any) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.equal(err.code, 'INVALID_PLATFORM_SELECTION');
        assert.ok(err.message.includes('At least one platform'));
        return true;
      }
    );
  });

  // =========================================================================
  // SCENARIO 6: Mode Compatibility (QUICK, BALANCED, FULL)
  // =========================================================================
  it('6. Mode Compatibility: supports QUICK, BALANCED, and FULL modes with selected platforms', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;
    let capturedMaxTokens: number | undefined;

    defaultAiProvider.generateJsonCompletionWithTelemetry = async (req) => {
      capturedMaxTokens = req.maxTokens;
      return {
        data: validAiMockOutput as any,
        telemetry: {
          provider: 'openrouter',
          model: 'anthropic/claude-3.5-sonnet',
          promptTokens: 400,
          completionTokens: 200,
          totalTokens: 600,
          latencyMs: 250,
          attemptCount: 1,
          retryCount: 0,
          usedFallback: false,
          tokenMeasurementType: 'provider_measured',
          estimatedProviderCostUsd: 0.003,
        },
      };
    };

    try {
      // 1. QUICK Mode
      const quickPack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        mode: 'QUICK',
        platforms: ['shorts', 'tiktok'],
      });
      assert.equal(quickPack.generation_mode, 'QUICK');
      assert.equal(capturedMaxTokens, 1200, 'QUICK mode should set maxTokens to 1200');
      assert.deepEqual(quickPack.selected_platforms, ['shorts', 'tiktok']);

      // 2. BALANCED Mode
      const balancedPack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        mode: 'BALANCED',
        platforms: ['instagram'],
      });
      assert.equal(balancedPack.generation_mode, 'BALANCED');
      assert.equal(capturedMaxTokens, 2500, 'BALANCED mode should set maxTokens to 2500');

      // 3. FULL Mode
      const fullPack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        mode: 'FULL',
        platforms: ['youtube', 'linkedin', 'x'],
      });
      assert.equal(fullPack.generation_mode, 'FULL');
      assert.equal(capturedMaxTokens, 3500, 'FULL mode should set maxTokens to 3500');
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 7: Dynamic Prompt Construction (Exclusion of unselected platforms)
  // =========================================================================
  it('7. Dynamic Prompt Construction: excludes unselected platforms and their guidelines from prompt', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;
    let capturedUserPrompt = '';
    let capturedSystemPrompt = '';

    defaultAiProvider.generateJsonCompletionWithTelemetry = async (req) => {
      capturedUserPrompt = req.userPrompt;
      capturedSystemPrompt = req.systemPrompt;
      return {
        data: validAiMockOutput as any,
        telemetry: {
          provider: 'openrouter',
          model: 'anthropic/claude-3.5-sonnet',
          promptTokens: 500,
          completionTokens: 250,
          totalTokens: 750,
          latencyMs: 300,
          attemptCount: 1,
          retryCount: 0,
          usedFallback: false,
          tokenMeasurementType: 'provider_measured',
          estimatedProviderCostUsd: 0.004,
        },
      };
    };

    try {
      await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['youtube', 'linkedin'],
      });

      // Verify selected platforms are in user prompt
      assert.ok(capturedUserPrompt.includes('Selected Target Platforms: youtube, linkedin'));
      assert.ok(capturedUserPrompt.includes('- YouTube: Title under 100 chars'));
      assert.ok(capturedUserPrompt.includes('- LinkedIn: Professional post under 3000 chars'));

      // Verify unselected platforms are NOT in user prompt guidelines
      assert.ok(!capturedUserPrompt.includes('- Instagram Reels:'), 'Prompt should not contain Instagram');
      assert.ok(!capturedUserPrompt.includes('- TikTok:'), 'Prompt should not contain TikTok');
      assert.ok(!capturedUserPrompt.includes('- YouTube Shorts:'), 'Prompt should not contain Shorts');
      assert.ok(!capturedUserPrompt.includes('- X: Standalone concise tweet'), 'Prompt should not contain X');

      // Verify strict grounding instruction is preserved
      assert.ok(capturedSystemPrompt.includes('STRICT SOURCE GROUNDING'));
      assert.ok(capturedSystemPrompt.includes('NEVER invent statistics'));
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 8: Schema Construction Matches Selected Platforms
  // =========================================================================
  it('8. Schema Construction: prompt output schema template only requests schemas for selected platforms', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;
    let capturedPrompt = '';

    defaultAiProvider.generateJsonCompletionWithTelemetry = async (req) => {
      capturedPrompt = req.userPrompt;
      return {
        data: validAiMockOutput as any,
        telemetry: {
          provider: 'openrouter',
          model: 'anthropic/claude-3.5-sonnet',
          promptTokens: 450,
          completionTokens: 200,
          totalTokens: 650,
          latencyMs: 280,
          attemptCount: 1,
          retryCount: 0,
          usedFallback: false,
          tokenMeasurementType: 'provider_measured',
          estimatedProviderCostUsd: 0.003,
        },
      };
    };

    try {
      await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['x'],
      });

      // Extract JSON schema section from prompt
      const schemaMatch = capturedPrompt.match(/"platform_packs":\s*({[\s\S]*?})\s*,\s*"explanations"/);
      assert.ok(schemaMatch, 'Should find platform_packs in schema');
      const platformSchema = JSON.parse(schemaMatch[1]);

      assert.ok('x' in platformSchema, 'Schema must include x');
      assert.ok(!('youtube' in platformSchema), 'Schema must not include youtube');
      assert.ok(!('shorts' in platformSchema), 'Schema must not include shorts');
      assert.ok(!('instagram' in platformSchema), 'Schema must not include instagram');
      assert.ok(!('tiktok' in platformSchema), 'Schema must not include tiktok');
      assert.ok(!('linkedin' in platformSchema), 'Schema must not include linkedin');
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 9: Primary Provider Success with Measured Token Usage
  // =========================================================================
  it('9. Primary Provider Success: captures provider-reported token usage and cost faithfully', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;

    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'openrouter',
        model: 'openai/gpt-4o-mini',
        promptTokens: 820,
        completionTokens: 410,
        totalTokens: 1230,
        latencyMs: 412,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: false,
        tokenMeasurementType: 'provider_measured',
        estimatedProviderCostUsd: 0.000369,
      },
    });

    try {
      const pack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['youtube'],
      });

      assert.ok(pack.telemetry);
      assert.equal(pack.telemetry.provider, 'openrouter');
      assert.equal(pack.telemetry.prompt_tokens, 820);
      assert.equal(pack.telemetry.completion_tokens, 410);
      assert.equal(pack.telemetry.total_tokens, 1230);
      assert.equal(pack.telemetry.attempt_count, 1);
      assert.equal(pack.telemetry.retry_count, 0);
      assert.equal(pack.telemetry.used_fallback, false);
      assert.equal(pack.telemetry.status, 'success');
      assert.equal(pack.telemetry.token_measurement_type, 'provider_measured');
      assert.equal(pack.telemetry.estimated_provider_cost_usd, 0.000369);

      // Verify dedicated telemetry log collection in MongoDB
      const db = await getMongoDb();
      const telemetryDoc = await db
        .collection('content_generation_telemetry')
        .findOne({ content_pack_id: pack.id });

      assert.ok(telemetryDoc, 'Telemetry must be saved to dedicated collection');
      assert.equal(telemetryDoc.user_id, userId);
      assert.equal(telemetryDoc.prompt_tokens, 820);
      assert.equal(telemetryDoc.total_tokens, 1230);
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 10: Transient Provider Failure & Successful Retry (429/502 on Attempt 1, Success on Attempt 2)
  // =========================================================================
  it('10. Transient Provider Failure & Retry: retries 429/502 with bounded backoff and succeeds on attempt 2', async () => {
    let callCount = 0;
    const originalFetch = global.fetch;

    global.fetch = async (url: any, init: any): Promise<Response> => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: { message: 'Rate limit exceeded (429)' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(validAiMockOutput) } }],
          usage: { prompt_tokens: 600, completion_tokens: 300, total_tokens: 900 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    try {
      const openRouter = new OpenRouterContentProvider();
      const result = await openRouter.generateJsonCompletionWithTelemetry({
        systemPrompt: 'System',
        userPrompt: 'User',
      });

      assert.equal(callCount, 2, 'Should have made exactly 2 attempts');
      assert.equal(result.telemetry.attemptCount, 2);
      assert.equal(result.telemetry.retryCount, 1);
      assert.equal(result.telemetry.totalTokens, 900);
      assert.ok(result.data);
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 11: Permanent Provider Failure Without Retries (401/400 throws immediately)
  // =========================================================================
  it('11. Permanent Provider Failure: does NOT retry permanent 401 or 400 errors and fails immediately', async () => {
    let callCount = 0;
    const originalFetch = global.fetch;

    global.fetch = async (): Promise<Response> => {
      callCount++;
      return new Response(JSON.stringify({ error: { message: 'Unauthorized API key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const openRouter = new OpenRouterContentProvider();
      await assert.rejects(
        async () => {
          await openRouter.generateJsonCompletionWithTelemetry({
            systemPrompt: 'System',
            userPrompt: 'User',
          });
        },
        (err: any) => {
          assert.ok(err.message.includes('401') || err.message.includes('authentication failed'));
          return true;
        }
      );

      assert.equal(callCount, 1, 'Permanent 401 must fail immediately on attempt 1 without retry loop');
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 12: Primary Provider Failure Followed by Fallback Success
  // =========================================================================
  it('12. Fallback to Groq: switches to Groq when OpenRouter fails all retries and records fallback flag', async () => {
    const provider = new ReliableAiContentProvider();

    // Mock primary (OpenRouter) to fail with 503
    provider.primaryProvider.executeRequest = async () => {
      throw new Error('OpenRouter 503 Service Unavailable across all retries');
    };

    // Mock fallback (Groq) to succeed
    provider.fallbackProvider.executeRequest = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        promptTokens: 710,
        completionTokens: 340,
        totalTokens: 1050,
        latencyMs: 290,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: true,
        tokenMeasurementType: 'provider_measured',
        estimatedProviderCostUsd: 0.000688,
      },
    });

    const result = await provider.generateJsonCompletionWithTelemetry({
      systemPrompt: 'System',
      userPrompt: 'User',
    });

    assert.equal(result.telemetry.provider, 'groq');
    assert.equal(result.telemetry.usedFallback, true);
    assert.equal(result.telemetry.model, 'llama-3.3-70b-versatile');
    assert.equal(result.telemetry.totalTokens, 1050);
  });

  // =========================================================================
  // SCENARIO 13: Both Providers Failing (Throws 502 AI_GENERATION_FAILED)
  // =========================================================================
  it('13. Both Providers Failing: throws 502 AI_GENERATION_FAILED when both OpenRouter and Groq fail', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;

    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => {
      throw new Error('All AI content providers failed. Primary: OpenRouter 503; Fallback: Groq 500');
    };

    try {
      await assert.rejects(
        async () => {
          await ContentPackService.generateContentPack({
            userId,
            projectId,
            clipId,
            platforms: ['youtube'],
          });
        },
        (err: any) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.statusCode, 502);
          assert.equal(err.code, 'AI_GENERATION_FAILED');
          assert.ok(err.message.includes('AI content pack generation failed'));
          return true;
        }
      );
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 14: Malformed Provider Output Handling
  // =========================================================================
  it('14. Malformed Provider Output: safely catches unparseable non-JSON without crashing server', async () => {
    const originalFetch = global.fetch;

    global.fetch = async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'Sorry, I cannot generate this content due to internal error.' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    try {
      const openRouter = new OpenRouterContentProvider();
      await assert.rejects(
        async () => {
          await openRouter.generateJsonCompletionWithTelemetry({
            systemPrompt: 'System',
            userPrompt: 'User',
          });
        },
        (err: any) => {
          assert.ok(err.message.includes('Failed to parse structured JSON'));
          return true;
        }
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  // =========================================================================
  // SCENARIO 15: Timeout Handling (AbortError / timeout triggers transient retry)
  // =========================================================================
  it('15. Timeout Handling: AbortError is identified as transient and retried', () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';

    assert.equal(isTransientError(abortErr), true, 'AbortError must qualify as transient');

    const timeoutErr = new Error('request timed out after 60000ms');
    assert.equal(isTransientError(timeoutErr), true, 'Timeout error must qualify as transient');

    const econnresetErr = new Error('read ECONNRESET');
    (econnresetErr as any).code = 'ECONNRESET';
    assert.equal(isTransientError(econnresetErr), true, 'ECONNRESET must qualify as transient');

    // Verify non-transient
    const badRequestErr = new Error('Bad Request');
    assert.equal(isTransientError(badRequestErr, 400), false, '400 must NOT qualify as transient');
    assert.equal(isTransientError(new Error('Forbidden'), 403), false, '403 must NOT qualify as transient');
  });

  // =========================================================================
  // SCENARIO 16: Accurate Token Usage Capture
  // =========================================================================
  it('16. Accurate Token Capture: accurately records prompt, completion and total tokens in pack and DB', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;

    const measuredPrompt = 1450;
    const measuredCompletion = 620;
    const measuredTotal = 2070;

    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        promptTokens: measuredPrompt,
        completionTokens: measuredCompletion,
        totalTokens: measuredTotal,
        latencyMs: 620,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: false,
        tokenMeasurementType: 'provider_measured',
        estimatedProviderCostUsd: 0.01365,
      },
    });

    try {
      const pack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['linkedin'],
      });

      assert.equal(pack.telemetry?.prompt_tokens, measuredPrompt);
      assert.equal(pack.telemetry?.completion_tokens, measuredCompletion);
      assert.equal(pack.telemetry?.total_tokens, measuredTotal);
      assert.equal(pack.telemetry?.token_measurement_type, 'provider_measured');

      // Verify stored record in content_packs collection
      const db = await getMongoDb();
      const savedPack = await db.collection('content_packs').findOne({ id: pack.id });
      assert.ok(savedPack);
      assert.equal(savedPack.telemetry.prompt_tokens, measuredPrompt);
      assert.equal(savedPack.telemetry.total_tokens, measuredTotal);
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 17: Missing Provider Usage Reporting (token_measurement_type: 'unavailable')
  // =========================================================================
  it('17. Missing Provider Usage: flags token_measurement_type as unavailable when provider omits usage', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;

    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'openrouter',
        model: 'custom-model',
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        latencyMs: 310,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: false,
        tokenMeasurementType: 'unavailable',
        estimatedProviderCostUsd: null,
      },
    });

    try {
      const pack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['shorts'],
      });

      assert.ok(pack.telemetry);
      assert.equal(pack.telemetry.token_measurement_type, 'unavailable');
      assert.equal(pack.telemetry.prompt_tokens, null);
      assert.equal(pack.telemetry.completion_tokens, null);
      assert.equal(pack.telemetry.total_tokens, null);
      assert.equal(pack.telemetry.estimated_provider_cost_usd, null);
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 18: Telemetry Failure Isolation (MongoDB Insert Failure Does Not Abort Generation)
  // =========================================================================
  it('18. Telemetry Failure Isolation: telemetry insert failure does not abort content pack generation', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;
    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        promptTokens: 400,
        completionTokens: 200,
        totalTokens: 600,
        latencyMs: 250,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: false,
        tokenMeasurementType: 'provider_measured',
        estimatedProviderCostUsd: 0.003,
      },
    });

    const db = await getMongoDb();
    const originalInsertOne = db.collection('content_generation_telemetry').insertOne;

    // Simulate collection insert failure
    db.collection('content_generation_telemetry').insertOne = async () => {
      throw new Error('Simulated MongoDB Write Error on telemetry collection');
    };

    try {
      const pack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['tiktok'],
      });

      assert.ok(pack, 'Pack must be successfully generated despite telemetry collection error');
      assert.equal(pack.status, 'READY');
      assert.deepEqual(pack.selected_platforms, ['tiktok']);
    } finally {
      db.collection('content_generation_telemetry').insertOne = originalInsertOne;
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 19: Financial & Billing Invariant (No accidental wallet deductions or pricing changes)
  // =========================================================================
  it('19. Financial & Billing Invariant: verifies no credits or wallet balances are deducted in Phase 4B.2', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;
    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        promptTokens: 450,
        completionTokens: 250,
        totalTokens: 700,
        latencyMs: 280,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: false,
        tokenMeasurementType: 'provider_measured',
        estimatedProviderCostUsd: 0.004,
      },
    });

    const db = await getMongoDb();

    // Check pre-generation credit balances or transaction records
    const preCreditTxCount = await db.collection('credit_transactions').countDocuments({ user_id: userId });

    try {
      await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
        platforms: ['youtube', 'shorts', 'instagram', 'tiktok', 'linkedin', 'x'],
      });

      // Check post-generation: no new credit transactions or balance deductions exist
      const postCreditTxCount = await db.collection('credit_transactions').countDocuments({ user_id: userId });
      assert.equal(
        postCreditTxCount,
        preCreditTxCount,
        'Zero credit transactions must be recorded during Phase 4B.2 generation'
      );
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });

  // =========================================================================
  // SCENARIO 20: Existing Phase 4B.1 Multi-Source & Regression Compatibility
  // =========================================================================
  it('20. Backward & Multi-Source Compatibility: verifies clip, project, transcript, and upload sources work with platform selection', async () => {
    const originalMethod = defaultAiProvider.generateJsonCompletionWithTelemetry;
    defaultAiProvider.generateJsonCompletionWithTelemetry = async () => ({
      data: validAiMockOutput as any,
      telemetry: {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
        promptTokens: 450,
        completionTokens: 250,
        totalTokens: 700,
        latencyMs: 280,
        attemptCount: 1,
        retryCount: 0,
        usedFallback: false,
        tokenMeasurementType: 'provider_measured',
        estimatedProviderCostUsd: 0.004,
      },
    });

    try {
      // 1. Backward compatibility: when platforms parameter is omitted, defaults to all 6 platforms
      const defaultPack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        clipId,
      });
      assert.deepEqual(defaultPack.selected_platforms, [...SUPPORTED_STUDIO_PLATFORMS]);

      // 2. Project source with selected platform
      const projectPack = await ContentPackService.generateContentPack({
        userId,
        projectId,
        sourceType: 'project',
        platforms: ['linkedin'],
      });
      assert.equal(projectPack.source_type, 'project');
      assert.deepEqual(projectPack.selected_platforms, ['linkedin']);

      // 3. Standalone Transcript source with selected platform
      const transcriptPack = await ContentPackService.generateContentPack({
        userId,
        sourceType: 'transcript',
        transcriptText: sampleTranscript,
        platforms: ['x'],
      });
      assert.equal(transcriptPack.source_type, 'transcript');
      assert.deepEqual(transcriptPack.selected_platforms, ['x']);

      // 4. Upload source backed by verified VideoIntelligenceRecord
      const uploadPack = await ContentPackService.generateContentPack({
        userId,
        sourceType: 'upload',
        videoIntelligenceId: uploadViId,
        platforms: ['youtube', 'shorts'],
      });
      assert.equal(uploadPack.source_type, 'upload');
      assert.deepEqual(uploadPack.selected_platforms, ['youtube', 'shorts']);
    } finally {
      defaultAiProvider.generateJsonCompletionWithTelemetry = originalMethod;
    }
  });
});
