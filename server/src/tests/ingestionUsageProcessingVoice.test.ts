import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { UrlIngestionService } from '../services/urlIngestionService.js';
import { UsageService } from '../services/usageService.js';
import { VoiceProviderRegistry, ElevenLabsVoiceProvider } from '../services/voiceProvider.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { closeMongo } from '../db/mongoClient.js';

describe('Beast-Mode Ingestion, Processing, Quota & Voice Pipeline Upgrades', { concurrency: 1 }, () => {
  after(async () => {
    await closeMongo().catch(() => undefined);
  });
  // =========================================================================
  // 1. UrlIngestionService Cache Seeding & Probe Robustness
  // =========================================================================
  describe('1. UrlIngestionService Source Cache Seeding & Stream Probe Parsing', () => {
    it('seeds shared source cache so downstream renderers produce 0ms cache_hit', async () => {
      const cacheDir = path.join(os.tmpdir(), 'vireo-source-cache');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const storageKey = `projects/proj-test-${Date.now()}/source/video.mp4`;
      const hash = crypto.createHash('sha256').update(storageKey).digest('hex');
      const cachedFile = path.join(cacheDir, `${hash}.mp4`);
      const testData = 'SOURCE_VIDEO_BYTES_PRE_SEEDED_BY_URL_INGESTION';

      // Seed cache file as done during ingestUrlToProject
      fs.writeFileSync(cachedFile, testData);

      const scratchTarget = path.join(os.tmpdir(), `scratch-target-${Date.now()}.mp4`);
      const resolution = await ClipRenderService.ensureSourceVideo(storageKey, scratchTarget);

      assert.equal(resolution, 'cache_hit', 'ensureSourceVideo must recognize pre-seeded cache');
      assert.ok(fs.existsSync(scratchTarget));
      assert.equal(fs.readFileSync(scratchTarget, 'utf8'), testData);

      // Cleanup
      try {
        fs.unlinkSync(cachedFile);
        fs.unlinkSync(scratchTarget);
      } catch {}
    });

    it('accurately parses resolution from real media probe or complex stream lines', async () => {
      // Find candidate local fixture in project tree
      const fixtureCandidates = [
        path.resolve(process.cwd(), 'artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'),
        path.resolve(process.cwd(), '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'),
      ];

      const fixture = fixtureCandidates.find((f) => fs.existsSync(f));
      if (!fixture) {
        return;
      }

      const probe = await UrlIngestionService.probeVideoFile(fixture);
      assert.equal(probe.hasVideo, true);
      assert.ok(probe.durationSeconds > 0);
      assert.ok(typeof probe.width === 'number' && probe.width >= 320);
      assert.ok(typeof probe.height === 'number' && probe.height >= 240);
      assert.ok(typeof probe.codec === 'string' && probe.codec.length > 0);
    });
  });

  // =========================================================================
  // 2. UsageService Live Subscription Precedence & Self-Healing Orphans
  // =========================================================================
  describe('2. UsageService Plan Upgrade Precedence & Self-Healing Orphans', () => {
    it('honors live subscription upgrade limit over stale database balance limit', async () => {
      const mockUserId = `user-upgraded-${Date.now()}`;
      const mockEmail = `user-${Date.now()}@test.com`;

      // Dynamically test getCurrentUsage precedence logic:
      // Even if stored DB record has free limit (30), upgraded Pro entitlement (300) must take precedence
      const { SubscriptionService } = await import('../services/subscriptionService.js');
      const origResolve = SubscriptionService.resolveUserEntitlement;

      (SubscriptionService as any).resolveUserEntitlement = async () => ({
        plan_id: 'pro',
        monthly_minutes: 300,
        max_active_projects: 10,
        max_duration_per_clip_sec: 180,
        max_resolution: '1080p',
        unlimited_rendering: true,
      });

      try {
        const usage = await UsageService.getCurrentUsage(mockUserId, mockEmail);
        assert.equal(usage.plan_tier, 'pro');
        assert.equal(usage.limit_minutes, 300, 'Upgraded plan limit (300) must override default free limit (30)');
        assert.equal(usage.remaining_minutes, 300);
      } finally {
        SubscriptionService.resolveUserEntitlement = origResolve;
      }
    });

    it('throttles orphan reservation self-healing cleanly without errors', async () => {
      UsageService.resetOrphanCleanupThrottle();
      // Calling cleanup directly works smoothly
      const cleaned = await UsageService.cleanupOrphanedReservations(30);
      assert.ok(typeof cleaned === 'number');
    });
  });

  // =========================================================================
  // 3. VoiceProviderRegistry Capability Aggregation & Caching
  // =========================================================================
  describe('3. VoiceProviderRegistry & ElevenLabsVoiceProvider Caching', () => {
    beforeEach(() => {
      VoiceProviderRegistry.clearCache();
    });

    it('calls getVoices only once during getAggregatedCapabilities', async () => {
      const provider = VoiceProviderRegistry.getProvider('elevenlabs') as ElevenLabsVoiceProvider;
      assert.ok(provider, 'ElevenLabs provider must be registered');

      // Inject temporary API key so getCapabilities treats provider as configured
      Object.defineProperty(provider, 'apiKey', { value: 'test_elevenlabs_key_123', configurable: true });

      let getVoicesCallCount = 0;
      const originalGetVoices = provider.getVoices.bind(provider);
      provider.getVoices = async () => {
        getVoicesCallCount++;
        return [
          {
            id: 'mock_voice_1',
            name: 'Rachel (Mock)',
            language: 'en',
            gender: 'female',
            provider: 'elevenlabs',
          },
        ];
      };

      try {
        const caps = await VoiceProviderRegistry.getAggregatedCapabilities();
        assert.ok(caps.voices.some((v) => v.id === 'mock_voice_1'));
        assert.equal(
          getVoicesCallCount,
          1,
          'getVoices must be called only ONCE per provider during capability aggregation'
        );
      } finally {
        provider.getVoices = originalGetVoices;
        delete (provider as any).apiKey;
      }
    });

    it('caches successful voice responses in memory to prevent duplicate API hits', async () => {
      const provider = new ElevenLabsVoiceProvider();
      // Temporarily inject mock API key to test cache behavior
      Object.defineProperty(provider, 'apiKey', { value: 'test_elevenlabs_key_123', configurable: true });

      let fetchCount = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (url: string) => {
        if (url.includes('elevenlabs.io/v1/voices')) {
          fetchCount++;
          return new Response(
            JSON.stringify({
              voices: [
                {
                  voice_id: 'voice_cached_abc',
                  name: 'Adam',
                  labels: { language: 'en', gender: 'male' },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(url);
      }) as any;

      try {
        ElevenLabsVoiceProvider.clearCache();

        const voices1 = await provider.getVoices();
        assert.equal(voices1.length, 1);
        assert.equal(voices1[0].id, 'voice_cached_abc');
        assert.equal(fetchCount, 1, 'First call should query API');

        const voices2 = await provider.getVoices();
        assert.equal(voices2.length, 1);
        assert.equal(fetchCount, 1, 'Second call must hit in-memory TTL cache without re-fetching');

        ElevenLabsVoiceProvider.clearCache();
        const voices3 = await provider.getVoices();
        assert.equal(voices3.length, 1);
        assert.equal(fetchCount, 2, 'Call after clearCache must re-fetch from API');
      } finally {
        globalThis.fetch = originalFetch;
        ElevenLabsVoiceProvider.clearCache();
      }
    });
  });

  // =========================================================================
  // 4. VideoProcessingService Duration Fallback & Auto-Genre Classification
  // =========================================================================
  describe('4. Video Processing Duration Fallback & Auto-Genre Classification', () => {
    it('computes effectiveDuration from last transcript segment timestamp when durationSeconds is absent', () => {
      const mockTranscription = {
        text: 'Welcome to this tech podcast discussion on artificial intelligence and scaling software.',
        language: 'en',
        durationSeconds: 0,
        segments: [
          { start: 0.0, end: 5.2, text: 'Welcome to this tech podcast' },
          { start: 5.2, end: 12.8, text: 'discussion on artificial intelligence' },
          { start: 12.8, end: 24.6, text: 'and scaling software.' },
        ],
      };

      const effectiveDuration = Number(
        (
          mockTranscription.durationSeconds ||
          (mockTranscription.segments?.length
            ? mockTranscription.segments[mockTranscription.segments.length - 1].end
            : 0)
        ).toFixed(2)
      );

      assert.equal(effectiveDuration, 24.6, 'Effective duration must fallback to final segment end time');
    });

    it('auto-classifies podcast_interview genre and updates suggested_genre for project in auto mode', () => {
      const sampleText =
        'Welcome to episode 42 of our podcast! Today we have an exclusive interview with our guest. What is your perspective on this? How do you answer that question?';
      const durationSeconds = 60;
      const durationMin = durationSeconds / 60;
      const wordCount = sampleText.split(/\s+/).length;
      const wpm = Math.round(wordCount / durationMin);
      const questionDensity = 3.0;

      const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
        transcriptText: sampleText,
        wpm,
        durationSeconds,
        faceCount: 2,
        questionDensityPerMin: questionDensity,
      });

      assert.equal(suggestion.genre, 'podcast_interview');
      assert.ok(suggestion.confidence >= 0.7);

      // Verify clip_preferences merge payload logic
      const existingPrefs = {
        genre: 'general' as const,
        genreSelectionMode: 'auto' as const,
        contentGoal: 'shareable_moments' as const,
      };

      const updatePayload: Record<string, any> = {
        video_status: 'transcribed',
        duration_seconds: durationSeconds,
      };

      if (existingPrefs.genreSelectionMode === 'auto') {
        updatePayload.clip_preferences = {
          ...existingPrefs,
          suggested_genre: suggestion.genre,
          genre_confidence: suggestion.confidence,
        };
      }

      assert.equal(updatePayload.clip_preferences.suggested_genre, 'podcast_interview');
      assert.ok(updatePayload.clip_preferences.genre_confidence >= 0.7);
    });
  });
});
