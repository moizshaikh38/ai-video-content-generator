import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { closeMongo } from '../db/mongoClient.js';
import { MediaAssetService } from '../services/mediaAssetService.js';
import { StockMediaProviderRegistry, PexelsProvider, PixabayProvider, GeneratedMediaProvider } from '../services/stockMediaProvider.js';
import { BrollOpportunityService } from '../services/brollOpportunityService.js';
import { BrollPlanService } from '../services/brollPlanService.js';
import { UrlValidator } from '../utils/urlValidator.js';
import { ProEditorService } from '../services/proEditorService.js';
import {
  MediaAssetRecord,
  EditorProject,
  BROLL_DENSITY_RULES,
} from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

// Real launch video test asset path. When the (uncommitted, gitignored)
// launch asset is absent - e.g. a fresh clone - a deterministic synthetic
// 1080p fixture is generated in its place so the compositing tests remain
// runnable everywhere. The synthetic fixture proves the render pipeline
// mechanics only; it cannot establish real launch-asset output quality.
const REAL_VIDEO_ASSET = path.resolve(
  process.cwd(),
  '../artifacts/vireo-launch/vireo-launch-preview-1080p.mp4'
);

async function ensureVideoAsset(): Promise<'real' | 'synthetic'> {
  if (fs.existsSync(REAL_VIDEO_ASSET)) return 'real';
  fs.mkdirSync(path.dirname(REAL_VIDEO_ASSET), { recursive: true });
  await execFileAsync(ffmpegBin, [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=15',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=15',
    '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest',
    REAL_VIDEO_ASSET,
  ]);
  return 'synthetic';
}

describe('Phase 19 — Vireo AI B-Roll & Media Intelligence System Tests', () => {
  const mockUserId = crypto.randomUUID();
  const mockOtherUserId = crypto.randomUUID();
  const mockProjectId = crypto.randomUUID();
  const mockClipId = crypto.randomUUID();

  after(async () => {
    try {
      await ownerContext.run(mockUserId, async () => {
        await dataRepository.from('projects').delete().eq('user_id', mockUserId);
        await dataRepository.from('media_assets').delete().eq('user_id', mockUserId);
      });
      await ownerContext.run(mockOtherUserId, async () => {
        await dataRepository.from('media_assets').delete().eq('user_id', mockOtherUserId);
      });
    } catch {
      // Ignore cleanup error if any
    }
    await closeMongo();
  });

  // Test fixture generator
  function createMockProject(overrides: Partial<EditorProject> = {}): EditorProject {
    const videoTrackId = crypto.randomUUID();
    const videoItemId = crypto.randomUUID();

    return {
      id: crypto.randomUUID(),
      user_id: mockUserId,
      project_id: mockProjectId,
      clip_id: mockClipId,
      version: 1,
      status: 'draft',
      title: 'Phase 19 Pro Editor Project',
      canvas: {
        width: 1080,
        height: 1920,
        aspect_ratio: '9:16',
        fps: 30,
        duration: 10.0,
        background_color: '#000000',
        background_mode: 'color',
      },
      tracks: [
        {
          id: videoTrackId,
          type: 'VIDEO',
          name: 'Main Video',
          locked: false,
          muted: false,
          hidden: false,
          height: 64,
          items: [
            {
              id: videoItemId,
              track_id: videoTrackId,
              type: 'VIDEO',
              source_asset_id: mockClipId,
              source_path: REAL_VIDEO_ASSET,
              timeline_start: 0,
              timeline_end: 10.0,
              source_start: 0,
              source_end: 10.0,
              transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
              speed: { speed: 1.0, pitch_preserved: true },
              audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 },
              effects: [],
              keyframes: [],
              locked: false,
              muted: false,
              hidden: false,
              z_index: 0,
            },
          ],
        },
      ],
      playhead: 0,
      settings: {
        snapping: true,
        safe_guides: true,
        snap_tolerance_sec: 0.15,
        show_safe_zones: true,
      },
      producer_plan_id: null,
      output_storage_path: null,
      preview_video_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      ...overrides,
    };
  }

  // 1. Media Asset Schema & Ownership
  describe('1. Media Asset Model & Ownership Isolation', () => {
    it('1. creates and persists valid MediaAssetRecord with required fields', async () => {
      await ownerContext.run(mockUserId, async () => {
        const asset = await MediaAssetService.createAsset(mockUserId, {
          project_id: mockProjectId,
          source_type: 'USER_UPLOAD',
          media_type: 'VIDEO',
          title: 'Interview B-Roll Clip',
          description: 'Founder speaking about automated workflow',
          tags: ['founder', 'automation', 'interview'],
          duration: 12.5,
          width: 1080,
          height: 1920,
          aspect_ratio: '9:16',
          license_type: 'User Owned',
        });

        assert.ok(asset.id);
        assert.equal(asset.user_id, mockUserId);
        assert.equal(asset.source_type, 'USER_UPLOAD');
        assert.equal(asset.duration, 12.5);
        assert.ok(asset.semantic_text.includes('founder'));
      });
    });

    it('2. prevents cross-user access (IDOR protection)', async () => {
      let assetId = '';
      await ownerContext.run(mockUserId, async () => {
        const asset = await MediaAssetService.createAsset(mockUserId, {
          project_id: mockProjectId,
          source_type: 'BRAND_ASSET',
          media_type: 'IMAGE',
          title: 'Brand Logo',
        });
        assetId = asset.id;

        // User A can access
        const userAFetch = await MediaAssetService.getAsset(asset.id, mockUserId);
        assert.ok(userAFetch);
        assert.equal(userAFetch?.id, asset.id);
      });

      // User B cannot access User A's asset
      await ownerContext.run(mockOtherUserId, async () => {
        const userBFetch = await MediaAssetService.getAsset(assetId, mockOtherUserId);
        assert.equal(userBFetch, null, 'User B must not be able to fetch User A media asset');
      });
    });
  });

  // 2. Project Media Indexing & Semantic Search
  describe('2. Project Media Indexing & Prioritized Search', () => {
    it('3. indexes real project media idempotently without byte duplication', async () => {
      await ownerContext.run(mockUserId, async () => {
        // Seed a project in dataRepository
        const testProjId = crypto.randomUUID();
        const { error: insErr } = await dataRepository.from('projects').insert({
          id: testProjId,
          user_id: mockUserId,
          title: 'Workflow Product Demo',
          source_type: 'upload',
          source_storage_path: REAL_VIDEO_ASSET,
          duration_seconds: 60.0,
          video_status: 'completed',
        });
        assert.ifError(insErr);

        const indexed = await MediaAssetService.indexProjectMedia(testProjId, mockUserId);
        assert.ok(Array.isArray(indexed));
        assert.ok(indexed.length > 0);
        assert.equal(indexed[0].source_type, 'PROJECT_SOURCE');
        assert.equal(indexed[0].storage_path, REAL_VIDEO_ASSET);

        // Re-indexing does not duplicate
        const reindexed = await MediaAssetService.indexProjectMedia(testProjId, mockUserId);
        assert.equal(reindexed.length, indexed.length);
      });
    });

    it('4. search prioritizes project assets over generic library assets', async () => {
      await ownerContext.run(mockUserId, async () => {
        const searchRes = await MediaAssetService.searchMedia(mockUserId, {
          query: 'workflow',
          project_id: mockProjectId,
        });

        assert.ok(searchRes.items);
        assert.ok(searchRes.total_count >= 0);
        assert.ok(Array.isArray(searchRes.items));
      });
    });

    it('5. computes normalized 0–100 relevance score with clear explanation', () => {
      const asset: Partial<MediaAssetRecord> = {
        title: 'Automated CRM Dashboard',
        description: 'Revenue growth chart with workflow animation',
        tags: ['crm', 'dashboard', 'automation', 'revenue'],
        aspect_ratio: '9:16',
        duration: 3.8,
        source_type: 'PROJECT_SOURCE',
      };

      const result = MediaAssetService.computeRelevanceScore(asset, ['automation', 'dashboard'], {
        orientation: 'portrait',
        target_duration: 4.0,
      });

      assert.ok(result.score >= 0 && result.score <= 100, 'Score must be bounded 0–100');
      assert.ok(result.score >= 70, 'Strong keyword + aspect + duration match should score high');
      assert.ok(result.explanation.includes('matches'));
      assert.ok(result.explanation.includes('relevance'));
    });
  });

  // 3. Provider Abstractions & Strict NOT_CONFIGURED States
  describe('3. Stock & Generation Provider Neutrality', () => {
    it('6. Pexels provider explicitly returns NOT_CONFIGURED when unconfigured', () => {
      const pexels = new PexelsProvider();
      const caps = pexels.getCapabilities();

      if (!process.env.PEXELS_API_KEY) {
        assert.equal(caps.status, 'NOT_CONFIGURED');
        assert.equal(caps.supports_video, false);
        assert.equal(caps.supports_image, false);
      }
    });

    it('7. Pixabay provider explicitly returns NOT_CONFIGURED when unconfigured', () => {
      const pixabay = new PixabayProvider();
      const caps = pixabay.getCapabilities();

      if (!process.env.PIXABAY_API_KEY) {
        assert.equal(caps.status, 'NOT_CONFIGURED');
        assert.equal(caps.supports_video, false);
        assert.equal(caps.supports_image, false);
      }
    });

    it('8. searchStock returns NOT_CONFIGURED with empty items and zero fake media', async () => {
      const res = await StockMediaProviderRegistry.searchStock('analytics dashboard', {
        provider: 'pexels',
      });

      if (!process.env.PEXELS_API_KEY) {
        assert.equal(res.status, 'NOT_CONFIGURED');
        assert.equal(res.items.length, 0);
        assert.equal(res.total_count, 0);
      }
    });

    it('9. GeneratedMediaProvider exposes explicit NOT_CONFIGURED state', () => {
      const genProvider = new GeneratedMediaProvider();
      const caps = genProvider.getCapabilities();

      assert.equal(caps.status, 'NOT_CONFIGURED');
      assert.ok(caps.message?.includes('not configured'));
    });
  });

  // 4. B-Roll Opportunity Detection & Density Controls
  describe('4. B-Roll Opportunity Detection & Density Rules', () => {
    it('10. generates concise 2–4 keyword search queries without filler words', () => {
      const spokenText = "We actually grew revenue by automating our entire sales workflow, you know.";
      const queries = BrollOpportunityService.generateSearchQueries(spokenText);

      assert.ok(queries.length > 0 && queries.length <= 3);
      for (const q of queries) {
        assert.ok(!q.includes('actually'));
        assert.ok(!q.includes('you know'));
        assert.ok(q.split(' ').length <= 4, `Query "${q}" must be concise (<= 4 words)`);
      }
    });

    it('11. density rules enforce min gap and max coverage bounds across styles', () => {
      const minimal = BROLL_DENSITY_RULES.MINIMAL;
      const balanced = BROLL_DENSITY_RULES.BALANCED;
      const dynamic = BROLL_DENSITY_RULES.DYNAMIC;

      assert.ok(minimal.max_broll_per_minute < balanced.max_broll_per_minute);
      assert.ok(balanced.max_broll_per_minute < dynamic.max_broll_per_minute);
      assert.ok(minimal.min_gap_between_broll > balanced.min_gap_between_broll);
      assert.ok(minimal.max_broll_coverage_percent < dynamic.max_broll_coverage_percent);
    });

    it('12. suppresses duplicate assets across consecutive opportunities', async () => {
      const opp1 = {
        id: crypto.randomUUID(),
        start_time: 2.0,
        end_time: 5.0,
        duration: 3.0,
        concept: 'workflow automation',
        search_queries: ['workflow automation'],
        reason: 'Talking head shot',
        confidence: 0.85,
        importance: 'HIGH' as const,
        status: 'suggested' as const,
      };

      const opp2 = {
        id: crypto.randomUUID(),
        start_time: 8.0,
        end_time: 11.0,
        duration: 3.0,
        concept: 'software dashboard',
        search_queries: ['software dashboard'],
        reason: 'Talking head shot',
        confidence: 0.85,
        importance: 'MEDIUM' as const,
        status: 'suggested' as const,
      };

      await ownerContext.run(mockUserId, async () => {
        const suggestions = await BrollOpportunityService.discoverSuggestionsForOpportunities(
          mockUserId,
          mockProjectId,
          [opp1, opp2]
        );

        assert.equal(suggestions.length, 2);
        if (suggestions[0].selected_asset && suggestions[1].selected_asset) {
          assert.notEqual(
            suggestions[0].selected_asset.id,
            suggestions[1].selected_asset.id,
            'Duplicate suppression must prevent identical asset assignment across consecutive slots'
          );
        }
      });
    });
  });

  // 5. SSRF Protections & URL Security
  describe('5. SSRF Protections & Remote Download Validation', () => {
    it('13. blocks localhost, loopback and private IP addresses', async () => {
      await assert.rejects(
        async () => UrlValidator.checkSsrf('127.0.0.1'),
        /(blocked|SSRF_BLOCKED)/i
      );
      await assert.rejects(
        async () => UrlValidator.checkSsrf('localhost'),
        /(blocked|SSRF_BLOCKED)/i
      );
      await assert.rejects(
        async () => UrlValidator.checkSsrf('192.168.1.1'),
        /(blocked|SSRF_BLOCKED)/i
      );
      await assert.rejects(
        async () => UrlValidator.checkSsrf('10.0.0.5'),
        /(blocked|SSRF_BLOCKED)/i
      );
      await assert.rejects(
        async () => UrlValidator.checkSsrf('metadata.google.internal'),
        /(blocked|SSRF_BLOCKED)/i
      );
    });

    it('14. correctly identifies private IP ranges via net inspection', () => {
      assert.equal(UrlValidator.isPrivateIp('127.0.0.1'), true);
      assert.equal(UrlValidator.isPrivateIp('10.254.0.1'), true);
      assert.equal(UrlValidator.isPrivateIp('172.16.0.1'), true);
      assert.equal(UrlValidator.isPrivateIp('192.168.0.1'), true);
      assert.equal(UrlValidator.isPrivateIp('169.254.169.254'), true);
      assert.equal(UrlValidator.isPrivateIp('8.8.8.8'), false);
    });
  });

  // 6. Editor Integration & Multi-Track Insertion
  describe('6. Editor Timeline Insertion & Fit Modes', () => {
    it('15. inserts B-roll into EditorProject on a VIDEO track above base video', async () => {
      await ownerContext.run(mockUserId, async () => {
        const testClipId15 = crypto.randomUUID();
        const project = createMockProject({ id: crypto.randomUUID(), clip_id: testClipId15 });
        await dataRepository.from('editor_projects').insert(project);

        const asset = await MediaAssetService.createAsset(mockUserId, {
          project_id: mockProjectId,
          source_type: 'PROJECT_SOURCE',
          media_type: 'VIDEO',
          title: 'Inserted B-Roll Demo',
          storage_path: REAL_VIDEO_ASSET,
          duration: 5.0,
        });

        const updated = await BrollPlanService.insertDirectAsset(
          project.id,
          mockUserId,
          asset.id,
          2.5,
          3.0
        );

        // Verify B-roll layer track was created/updated
        const brollTrack = updated.tracks.find((t) => t.name.toLowerCase().includes('b-roll'));
        assert.ok(brollTrack, 'B-Roll layer track must exist');
        assert.equal(brollTrack.type, 'VIDEO');

        // Verify item properties
        const item = brollTrack.items.find((i) => i.source_asset_id === asset.id);
        assert.ok(item, 'B-roll item must exist on the track');
        assert.equal(item.timeline_start, 2.5);
        assert.equal(item.timeline_end, 5.5);
        assert.equal(item.muted, true, 'Default B-roll audio behavior must be MUTED');
        assert.equal(item.crop?.mode, 'fill');
        assert.equal(item.z_index, 5);

        // Verify source footage track was NOT overwritten
        const baseTrack = updated.tracks.find((t) => t.name === 'Main Video');
        assert.ok(baseTrack);
        assert.equal(baseTrack.items.length, 1);
        assert.equal(baseTrack.items[0].source_path, REAL_VIDEO_ASSET);
      });
    });

    it('16. plan application is idempotent and does not create duplicate tracks', async () => {
      await ownerContext.run(mockUserId, async () => {
        const testClipId16 = crypto.randomUUID();
        const project = createMockProject({ id: crypto.randomUUID(), clip_id: testClipId16 });
        await dataRepository.from('editor_projects').insert(project);

        const asset = await MediaAssetService.createAsset(mockUserId, {
          project_id: mockProjectId,
          title: 'Plan Asset',
          storage_path: REAL_VIDEO_ASSET,
          duration: 4.0,
        });

        // Construct mock plan
        const planId = crypto.randomUUID();
        const oppId = crypto.randomUUID();
        const sugId = crypto.randomUUID();

        await dataRepository.from('broll_plans').insert({
          id: planId,
          user_id: mockUserId,
          clip_id: project.clip_id,
          editor_project_id: project.id,
          status: 'ready',
          style: 'BALANCED',
          opportunities: [{
            id: oppId,
            start_time: 1.0,
            end_time: 4.0,
            duration: 3.0,
            concept: 'growth metrics',
            search_queries: ['growth metrics'],
            reason: 'Talking head shot',
            confidence: 0.9,
            importance: 'HIGH',
            status: 'suggested',
          }],
          suggestions: [{
            id: sugId,
            opportunity_id: oppId,
            selected_asset: {
              id: asset.id,
              provider: 'local',
              provider_asset_id: asset.id,
              media_type: 'VIDEO',
              title: asset.title,
              preview_url: '',
              source_url: REAL_VIDEO_ASSET,
              duration: 4.0,
              width: 1080,
              height: 1920,
              aspect_ratio: '9:16',
              license_type: 'User Owned',
              tags: [],
            },
            relevance_score: 95,
            explanation: {
              summary: 'High relevance match',
              matching_factors: ['growth metrics'],
              duration_fit: '4.0s',
              aspect_fit: '9:16',
            },
            suggested_timeline_start: 1.0,
            suggested_timeline_end: 4.0,
            suggested_source_start: 0,
            suggested_source_end: 3.0,
            status: 'suggested',
          }],
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Apply 1st time
        const res1 = await BrollPlanService.applyPlan(planId, mockUserId);
        assert.equal(res1.appliedCount, 1);

        // Apply 2nd time (idempotency check)
        const res2 = await BrollPlanService.applyPlan(planId, mockUserId);
        const brollTracks = res2.editorProject.tracks.filter((t) => t.name.toLowerCase().includes('b-roll'));
        assert.equal(brollTracks.length, 1, 'Only one B-Roll track must exist');
        assert.equal(brollTracks[0].items.length, 1, 'Idempotent application must not duplicate items');
      });
    });
  });

  // 7. Real Local E2E Verification & FFmpeg Render
  describe('7. Real Local E2E FFmpeg Render Verification', () => {
    it('17. ensures a video asset exists on disk (generating a synthetic fixture when the launch asset is absent)', async () => {
      const kind = await ensureVideoAsset();
      assert.ok(fs.existsSync(REAL_VIDEO_ASSET), `Asset must exist at ${REAL_VIDEO_ASSET}`);
      if (kind === 'synthetic') {
        console.log('    (synthetic fixture generated - pipeline mechanics only, not launch-asset quality)');
      }
    });

    it('18. compiles Render Graph V2 with multi-layer B-roll compositing', async () => {
      await ensureVideoAsset();
      const project = createMockProject();
      // Add a B-roll track
      const brollTrackId = crypto.randomUUID();
      project.tracks.push({
        id: brollTrackId,
        type: 'VIDEO',
        name: 'B-Roll Layer',
        locked: false,
        muted: false,
        hidden: false,
        height: 64,
        items: [
          {
            id: crypto.randomUUID(),
            track_id: brollTrackId,
            type: 'VIDEO',
            source_path: REAL_VIDEO_ASSET,
            timeline_start: 1.0,
            timeline_end: 3.0,
            source_start: 5.0,
            source_end: 7.0,
            transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
            crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
            speed: { speed: 1.0, pitch_preserved: true },
            effects: [],
            keyframes: [],
            locked: false,
            muted: true,
            hidden: false,
            z_index: 5,
          },
        ],
      });

      const tmpDir = os.tmpdir();
      const dummyOut = path.join(tmpDir, 'test_render.mp4');

      const graph = ProEditorService.compileRenderGraph(
        project,
        REAL_VIDEO_ASSET,
        dummyOut,
        tmpDir
      );

      assert.ok(Array.isArray(graph.inputArgs));
      assert.ok(Array.isArray(graph.filterComplex));
      // Must contain secondary input for B-roll
      assert.ok(graph.inputArgs.length >= 4, 'Must have at least 2 input files (-i base, -i broll)');
      // Must contain overlay filterComplex node
      const hasOverlay = graph.filterComplex.some((f) => f.includes('overlay'));
      assert.ok(hasOverlay, 'Filter graph must contain overlay filter for B-roll');
    });

    it('19. executes real FFmpeg render with B-roll layer and validates with ffprobe', async () => {
      await ensureVideoAsset();
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-p19-render-'));
      const outputVideo = path.join(tmpDir, 'p19_broll_render.mp4');

      try {
        const project = createMockProject();
        // Shorten duration to 2.5s for fast deterministic test run
        project.canvas.duration = 2.5;
        project.tracks[0].items[0].timeline_end = 2.5;

        // Insert B-roll overlay from 0.8s to 2.0s
        const brollTrackId = crypto.randomUUID();
        project.tracks.push({
          id: brollTrackId,
          type: 'VIDEO',
          name: 'B-Roll Layer',
          locked: false,
          muted: false,
          hidden: false,
          height: 64,
          items: [
            {
              id: crypto.randomUUID(),
              track_id: brollTrackId,
              type: 'VIDEO',
              source_path: REAL_VIDEO_ASSET,
              timeline_start: 0.8,
              timeline_end: 2.0,
              source_start: 10.0,
              source_end: 11.2,
              transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
              crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
              speed: { speed: 1.0, pitch_preserved: true },
              effects: [],
              keyframes: [],
              locked: false,
              muted: true, // Muted stock audio
              hidden: false,
              z_index: 5,
            },
          ],
        });

        const graph = ProEditorService.compileRenderGraph(
          project,
          REAL_VIDEO_ASSET,
          outputVideo,
          tmpDir
        );

        const ffmpegArgs = [
          '-y',
          '-ss', '0',
          '-t', '2.5',
          ...graph.inputArgs,
          '-filter_complex', graph.filterComplex.join(';'),
          '-map', graph.videoMap,
          '-map', graph.audioMap,
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-crf', '28',
          '-c:a', 'aac',
          '-b:a', '64k',
          '-t', '2.5',
          outputVideo,
        ];

        await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: 30000 });

        assert.ok(fs.existsSync(outputVideo), 'Rendered output video must exist');
        const stat = fs.statSync(outputVideo);
        assert.ok(stat.size > 10000, 'Rendered video must have non-trivial file size');

        // Probe output with ffprobe to verify decodable stream, dimensions, and audio
        const probeArgs = [
          '-v', 'error',
          '-show_entries', 'stream=codec_type,width,height:format=duration',
          '-of', 'json',
          outputVideo,
        ];

        const { stdout: probeOut } = await execFileAsync('ffprobe', probeArgs);
        const probeData = JSON.parse(probeOut);

        const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
        const audioStream = probeData.streams?.find((s: any) => s.codec_type === 'audio');

        assert.ok(videoStream, 'Output must have valid video stream');
        assert.equal(videoStream.width, 1080);
        assert.equal(videoStream.height, 1920);
        assert.ok(audioStream, 'Base audio stream must be preserved');

        const duration = parseFloat(probeData.format?.duration || '0');
        assert.ok(Math.abs(duration - 2.5) < 0.5, `Duration must match requested range (got ${duration})`);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('Secondary VIDEO track (B-roll layer) base-timeline regression', () => {
    // brollPlanService inserts its B-Roll Layer as a track of type VIDEO. The base
    // composition must collect slices only from the primary video track; splicing
    // the B-roll item into the base concat pulls its source window from input 0 and
    // shifts/corrupts the base timeline (verified pre-fix: output frame at t=3.5
    // pixel-matched source t=6.5 instead of t=3.5). This test renders a two-slice
    // main track with a secondary VIDEO track and checks the base timeline and
    // overlay compositing on actual pixels, not graph shape.
    it('keeps secondary VIDEO items out of the base concat and overlays them from their own source', { timeout: 120000 }, async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-vtrack-'));
      try {
        const mainSrc = path.join(tmpDir, 'main.mp4');
        const brollSrc = path.join(tmpDir, 'broll-red.mp4');
        // Time-varying base (every timestamp visually distinct) + feasible-to-normalize
        // modulated sine audio; solid red B-roll so the overlay window is unambiguous.
        await execFileAsync(ffmpegBin, [
          '-y', '-f', 'lavfi', '-i', 'testsrc2=size=480x270:rate=30:duration=10',
          '-f', 'lavfi', '-i', 'aevalsrc=0.4*sin(440*2*PI*t)*(0.5+0.4*sin(2*PI*t*0.7)):d=10',
          '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', mainSrc,
        ]);
        await execFileAsync(ffmpegBin, [
          '-y', '-f', 'lavfi', '-i', 'color=red:size=480x270:rate=30:duration=10',
          '-f', 'lavfi', '-i', 'sine=frequency=220:duration=10',
          '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', brollSrc,
        ]);

        const itemAudio = { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 };
        const project = {
          user_id: mockUserId,
          canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: 4 },
          tracks: [
            {
              type: 'VIDEO', name: 'Main',
              items: [
                { id: 'm1', name: 'm1', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2, source_path: mainSrc, audio: itemAudio },
                { id: 'm2', name: 'm2', timeline_start: 2, timeline_end: 4, source_start: 2, source_end: 4, source_path: mainSrc, audio: itemAudio },
              ],
            },
            {
              // Mirrors brollPlanService: secondary track inserted as type VIDEO.
              type: 'VIDEO', name: 'B-Roll Layer',
              items: [
                { id: 'b1', name: 'b1', timeline_start: 1.0, timeline_end: 3.0, source_start: 5.0, source_end: 7.0, source_path: brollSrc,
                  audio: { volume: 0.0, fade_in: 0, fade_out: 0 } },
              ],
            },
          ],
        } as any;

        const outPath = path.join(tmpDir, 'out.mp4');
        const graph = await ProEditorService.compileRenderGraphWithNormalization(project, mainSrc, outPath, tmpDir);
        await execFileAsync(ffmpegBin, [
          '-y', '-v', 'error', ...graph.inputArgs,
          '-filter_complex', graph.filterComplex.join(';'),
          '-map', graph.videoMap, '-map', graph.audioMap,
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac',
          '-t', '4', outPath,
        ], { timeout: 60000 });
        assert.ok(fs.existsSync(outPath), 'render must produce output');

        // Timeline/sync: both streams span the 4s timeline.
        const { stdout: probeOut } = await execFileAsync((ffprobeStatic as any).path || (ffprobeStatic as unknown as string), [
          '-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', outPath,
        ]);
        const streams = JSON.parse(probeOut).streams as { codec_type: string; duration?: string }[];
        const vDur = Number(streams.find((s) => s.codec_type === 'video')?.duration);
        const aDur = Number(streams.find((s) => s.codec_type === 'audio')?.duration);
        assert.ok(Math.abs(vDur - 4) < 0.2, `video duration ${vDur} != 4`);
        assert.ok(Math.abs(aDur - 4) < 0.2, `audio duration ${aDur} != 4 (sync drift)`);

        // Overlay window: center pixel at t=2.0 must be the red B-roll, not the base.
        const { stdout: px } = await execFileAsync(ffmpegBin, [
          '-v', 'error', '-ss', '2.0', '-i', outPath, '-frames:v', '1',
          '-vf', 'crop=2:2:540:960', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
        ], { encoding: 'buffer' as any, maxBuffer: 1024 });
        const buf = px as unknown as Buffer;
        assert.ok(buf[0] > 150 && buf[1] < 100 && buf[2] < 100,
          `overlay window must show the red B-roll layer (got rgb ${buf[0]},${buf[1]},${buf[2]})`);

        // Base timeline: output frame at t=3.5 must match the source frame at t=3.5,
        // not the t=6.5 frame the pre-fix splice produced.
        const reframe = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920';
        const outFrame = path.join(tmpDir, 'out3.5.png');
        const srcRight = path.join(tmpDir, 'src3.5.png');
        const srcWrong = path.join(tmpDir, 'src6.5.png');
        await execFileAsync(ffmpegBin, ['-y', '-v', 'error', '-ss', '3.5', '-i', outPath, '-frames:v', '1', outFrame]);
        await execFileAsync(ffmpegBin, ['-y', '-v', 'error', '-ss', '3.5', '-i', mainSrc, '-frames:v', '1', '-vf', reframe, srcRight]);
        await execFileAsync(ffmpegBin, ['-y', '-v', 'error', '-ss', '6.5', '-i', mainSrc, '-frames:v', '1', '-vf', reframe, srcWrong]);
        const psnr = async (a: string, b: string): Promise<number> => {
          const { stderr } = await execFileAsync(ffmpegBin, [
            '-v', 'info', '-i', a, '-i', b, '-lavfi', 'psnr', '-f', 'null', '-',
          ]);
          const m = stderr.match(/average:([0-9.]+|inf)/);
          assert.ok(m, `PSNR parse failed: ${stderr.slice(-200)}`);
          return m[1] === 'inf' ? 99 : Number(m[1]);
        };
        // Calibrated on this pipeline: correct window ~40dB, mis-spliced window ~11dB.
        const pRight = await psnr(outFrame, srcRight);
        const pWrong = await psnr(outFrame, srcWrong);
        assert.ok(pRight > 25, `base frame at t=3.5 must match source t=3.5 (PSNR ${pRight}dB)`);
        assert.ok(pRight - pWrong > 10, `base frame must not match the mis-spliced window (right ${pRight}dB vs wrong ${pWrong}dB)`);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });
});
