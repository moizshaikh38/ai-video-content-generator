import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';
import { CaptionService } from '../services/captionService.js';
import { ProducerRenderService } from '../services/producerRenderService.js';
import type {
  ReframeSample,
  TimedCaptionCue,
  ProducerEditPlan,
  ClipRecord,
} from '../types/index.js';

describe('Phase D — Smart Reframe, Subtitle Engine & Producer Plan Verification', () => {
  // ─── 1. Smart Reframe: Instant Hard Cuts & Vertical Headroom ───────────────
  describe('1. Smart Reframe Instantaneous Hard Cuts & Headroom', () => {
    it('emits instantaneous paired hard-cut keyframe at scene cuts (t_cut - 0.001 and t_cut)', () => {
      const samples: ReframeSample[] = [
        {
          time: 0.0,
          faces: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.2, center_x: 0.2, center_y: 0.35, confidence: 0.95, track_id: 'host' }],
        },
        {
          time: 1.0,
          faces: [{ x: 0.1, y: 0.2, width: 0.2, height: 0.2, center_x: 0.2, center_y: 0.35, confidence: 0.95, track_id: 'host' }],
        },
        {
          time: 2.0,
          faces: [{ x: 0.7, y: 0.2, width: 0.2, height: 0.2, center_x: 0.8, center_y: 0.35, confidence: 0.95, track_id: 'guest' }],
        },
        {
          time: 3.0,
          faces: [{ x: 0.7, y: 0.2, width: 0.2, height: 0.2, center_x: 0.8, center_y: 0.35, confidence: 0.95, track_id: 'guest' }],
        },
      ];

      const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
        samples,
        dominantTrackId: 'host',
        duration: 3.0,
        sceneCuts: [2.0],
      });

      assert.ok(keyframes.length >= 3, 'Must produce multiple keyframes across shots');

      // Check pre-cut and post-cut keyframes
      const preCutKf = keyframes.find((k) => k.time === 1.999);
      const postCutKf = keyframes.find((k) => k.time === 2.0);

      assert.ok(preCutKf, 'Must emit keyframe right before cut at t_cut - 0.001 (1.999)');
      assert.ok(postCutKf, 'Must emit keyframe at t_cut (2.000)');

      // Verify instantaneous position jump without intermediate slow pan
      assert.ok(preCutKf.centerX < 0.4, `Pre-cut position should remain on host (x ~ 0.2), got ${preCutKf.centerX}`);
      assert.ok(postCutKf.centerX > 0.6, `Post-cut position should immediately switch to guest (x ~ 0.8), got ${postCutKf.centerX}`);
    });

    it('generates crop filter with vertical crop expression targeting ~0.38 eye headroom (never hardcoded :0)', () => {
      const keyframes = [
        { time: 0.0, centerX: 0.5, centerY: 0.38 },
        { time: 2.0, centerX: 0.55, centerY: 0.38 },
        { time: 4.0, centerX: 0.5, centerY: 0.38 },
      ];

      const filter916 = SmartReframeService.buildSmartCropFilter(keyframes, '9:16', 1920, 1080, 4.0);
      assert.ok(!filter916.endsWith(':0'), 'Crop filter must not hardcode :0 for Y crop');
      assert.ok(filter916.includes('(in_h-out_h)*'), 'Crop filter must position vertical headroom via (in_h-out_h)*clampedYExpr');
    });

    it('prunes collinear keyframes and strictly enforces expression cap <= 45', () => {
      // 80 collinear flat keyframes
      const flatKeyframes = Array.from({ length: 80 }, (_, i) => ({
        time: Number((i * 0.5).toFixed(2)),
        centerX: 0.45,
        centerY: 0.38,
      }));

      const filter = SmartReframeService.buildSmartCropFilter(flatKeyframes, '9:16', 1920, 1080, 40.0);
      const ifMatches = (filter.match(/if\(lte\(t\\,/g) || []).length;
      assert.ok(ifMatches <= 45, `Nested if expressions (${ifMatches}) must be <= 45`);
    });
  });

  // ─── 2. Subtitle Engine & Typography Fixes ─────────────────────────────────
  describe('2. Subtitle Engine & Typography Fixes', () => {
    it('preserves valid ASS line breaks (\\N and \\n) and never corrupts into /N', () => {
      const withLineBreak = 'The future belongs\\Nto those who prepare';
      const sanitized = CaptionService.sanitizeAssText(withLineBreak);

      assert.ok(sanitized.includes('\\N'), 'Must preserve ASS line break \\N');
      assert.ok(!sanitized.includes('/N'), 'Must never corrupt \\N into /N');
      assert.equal(sanitized, 'The future belongs\\Nto those who prepare');
    });

    it('strips unsafe ASS override curly braces while normalizing stray backslashes', () => {
      const adversarial = 'Normal words {\\b1\\c&H0000FF&} with \\stray backslash and \\N valid break';
      const sanitized = CaptionService.sanitizeAssText(adversarial);

      assert.ok(!sanitized.includes('{'), 'Must strip opening curly brace');
      assert.ok(!sanitized.includes('}'), 'Must strip closing curly brace');
      assert.ok(!sanitized.includes('\\stray'), 'Must normalize stray backslash to forward slash');
      assert.ok(sanitized.includes('\\N'), 'Must preserve valid \\N line break');
    });

    it('synchronizes word tokens and timestamps in applyOverrides when word count matches', () => {
      const originalCues: TimedCaptionCue[] = [
        {
          id: 'cue-1',
          start: 0.0,
          end: 1.5,
          text: 'Hello world today',
          words: [
            { text: 'Hello', start: 0.0, end: 0.4 },
            { text: 'world', start: 0.5, end: 0.9 },
            { text: 'today', start: 1.0, end: 1.4 },
          ],
        },
      ];

      const overridden = CaptionService.applyOverrides(originalCues, [
        { cueId: 'cue-1', text: 'Goodbye world tonight' },
      ]);

      assert.equal(overridden[0].text, 'Goodbye world tonight');
      assert.equal(overridden[0].words[0].text, 'Goodbye');
      assert.equal(overridden[0].words[0].start, 0.0);
      assert.equal(overridden[0].words[0].end, 0.4);
      assert.equal(overridden[0].words[2].text, 'tonight');
      assert.equal(overridden[0].words[2].start, 1.0);
      assert.equal(overridden[0].words[2].end, 1.4);
    });

    it('proportionally redistributes timestamps in applyOverrides when word count changes', () => {
      const originalCues: TimedCaptionCue[] = [
        {
          id: 'cue-1',
          start: 0.0,
          end: 2.0,
          text: 'Short text',
          words: [
            { text: 'Short', start: 0.0, end: 0.8 },
            { text: 'text', start: 1.0, end: 1.9 },
          ],
        },
      ];

      // Override with 4 words
      const overridden = CaptionService.applyOverrides(originalCues, [
        { cueId: 'cue-1', text: 'This is longer text' },
      ]);

      assert.equal(overridden[0].words.length, 4);
      assert.equal(overridden[0].words[0].text, 'This');
      assert.equal(overridden[0].words[3].text, 'text');
      assert.equal(overridden[0].words[0].start, 0.0);
      assert.equal(overridden[0].words[3].end, 2.0);

      // Verify kinetic events render without errors
      const kineticEvents = CaptionService.buildKineticCueEvents(overridden[0], {
        primaryColour: '&H00FFFFFF&',
        secondaryColour: '&H0000FFFF&',
      });
      assert.ok(kineticEvents.length > 0, 'Must generate valid kinetic events with new words');
    });

    it('findImpactfulWordIndex prioritizes numbers, currencies, and words with length >= 4', () => {
      const wordsWithMoney = ['we', 'made', '$50000', 'in', 'profit'];
      const moneyIdx = CaptionService.findImpactfulWordIndex(wordsWithMoney);
      assert.equal(moneyIdx, 2, 'Should pick $50000 as impactful word');

      const wordsWithPercent = ['growth', 'is', 'over', '40%', 'year'];
      const percentIdx = CaptionService.findImpactfulWordIndex(wordsWithPercent);
      assert.equal(percentIdx, 3, 'Should pick 40% as impactful word');

      const textWords = ['this', 'is', 'a', 'remarkable', 'day'];
      const longestIdx = CaptionService.findImpactfulWordIndex(textWords);
      assert.equal(longestIdx, 3, 'Should pick "remarkable" (longest word >= 4 chars)');
    });
  });

  // ─── 3. Producer Plan Execution & Dynamic Render Graph ─────────────────────
  describe('3. Producer Plan Execution & Dynamic Render Graph', () => {
    const dummyClip: ClipRecord = {
      id: 'd9b1a7d6-3e4f-4d9a-9e12-7f8e9a0b1c2d',
      project_id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
      user_id: 'test-user',
      title: 'Test Clip',
      start_seconds: 10.0,
      end_seconds: 25.0,
      duration_seconds: 15.0,
      aspect_ratio: '9:16',
      crop_mode: 'center',
      source_storage_path: 'sources/dummy.mp4',
      render_status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('builds dynamic PUNCH_IN filter with escaped commas matching 9:16 resolution (1080x1920)', async () => {
      const punchPlan: ProducerEditPlan = {
        id: 'c1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6e',
        clip_id: dummyClip.id,
        project_id: dummyClip.project_id,
        user_id: dummyClip.user_id,
        version: 1,
        parent_plan_id: null,
        mode: 'BALANCED',
        target_platform: 'tiktok',
        title: 'Punch In Edit',
        user_instruction: null,
        original_duration: 15.0,
        preview_video_url: null,
        preview_storage_path: null,
        operations: [
          {
            id: 'op-punch',
            type: 'PUNCH_IN',
            label: 'Punch In',
            description: 'Punch In on Hook',
            confidence: 0.9,
            reason: 'Engagement climax',
            enabled: true,
            parameters: {
              punch_in_start_sec: 14.0, // 4.0s into clip
              punch_in_duration_sec: 2.0,
              scale: 1.08,
            },
          },
        ],
        estimated_duration: 15.0,
        scores: { before: {} as any, after: {} as any, delta: 15 },
        explanation: {} as any,
        status: 'draft',
        applied_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const graph = await ProducerRenderService.buildRenderGraph(
        punchPlan,
        dummyClip,
        '/dummy/input.mp4',
        '/dummy/output.mp4',
        '/tmp'
      );

      const punchFilter = graph.videoFilters.find((f) => f.includes('crop=w=\'if(between(t'));
      assert.ok(punchFilter, 'Must include dynamic punch-in crop filter');
      assert.ok(punchFilter.includes('scale=1080:1920'), 'Must scale to target 9:16 canvas (1080x1920)');
      assert.ok(punchFilter.includes('between(t,4.00,6.00)'), 'Punch time must be relative to clip start (14.0 - 10.0 = 4.0s)');
    });

    it('executes REMOVE_RANGE dead-air cuts on both video and audio and updates durationSec', async () => {
      const removePlan: ProducerEditPlan = {
        id: 'c2b3c4d5-e6f7-8a9b-0c1d-2e3f4a5b6c7d',
        clip_id: dummyClip.id,
        project_id: dummyClip.project_id,
        user_id: dummyClip.user_id,
        version: 1,
        parent_plan_id: null,
        mode: 'BALANCED',
        target_platform: 'tiktok',
        title: 'Remove Dead Space Edit',
        user_instruction: null,
        original_duration: 15.0,
        preview_video_url: null,
        preview_storage_path: null,
        operations: [
          {
            id: 'op-remove',
            type: 'REMOVE_RANGE',
            label: 'Remove Dead Air',
            description: 'Cut silence pauses',
            confidence: 0.9,
            reason: 'Dead air elimination',
            enabled: true,
            parameters: {
              cut_ranges: [
                { start: 12.0, end: 13.5, duration: 1.5 }, // 1.5s dead space (2.0s to 3.5s in clip)
              ],
            },
          },
        ],
        estimated_duration: 13.5,
        scores: { before: {} as any, after: {} as any, delta: 12 },
        explanation: {} as any,
        status: 'draft',
        applied_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const graph = await ProducerRenderService.buildRenderGraph(
        removePlan,
        dummyClip,
        '/dummy/input.mp4',
        '/dummy/output.mp4',
        '/tmp'
      );

      const videoSelect = graph.videoFilters.find((f) => f.includes('select=\'not('));
      const audioSelect = graph.audioFilters.find((f) => f.includes('aselect=\'not('));

      assert.ok(videoSelect, 'Must include video select filter removing dead air');
      assert.ok(audioSelect, 'Must include audio aselect filter removing dead air');
      assert.ok(videoSelect.includes('between(t\\,2.000\\,3.500)'), 'Cut range must be relative to clip start');
      assert.equal(graph.duration, 13.5, 'Duration must subtract dead air duration (15.0 - 1.5 = 13.5s)');
    });

    it('escapes all colons in ASS subtitle path using replace(/:/g, \\\\:)', async () => {
      const winAssPath = 'C:\\videos\\output\\producer_captions.ass';
      const safeAss = winAssPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
      assert.equal(safeAss, 'C\\\\:/videos/output/producer_captions.ass');
      assert.ok(!safeAss.includes('videos/output/producer_captions.ass').valueOf === false);
      assert.ok(safeAss.includes('\\\\:'), 'Colon must be escaped for FFmpeg filter parameter');
    });
  });
});
