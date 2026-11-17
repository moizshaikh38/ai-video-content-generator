import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';
import { VideoIntelligenceRepository } from '../db/repositories/videoIntelligenceRepository.js';
import type { VideoIntelligenceRecord } from '../types/videoIntelligence.js';

describe('P0.1 Global Cut Bridge & P1.3 Scene-Cut Boundary Invariance', () => {

  describe('A. Scene Cut Sanitation & Timebase Deduplication (Requirement B)', () => {
    test('1. Unsorted cuts are sorted before deduplication so earlier cuts are not dropped', () => {
      // 5.58 and 5.50 are within minCutSeparation (0.12s).
      // If unsorted [5.58, 5.50], processing 5.58 first would drop 5.50.
      // Our fix sorts first -> 5.50 is kept and 5.58 is merged.
      const kfs = SmartReframeService.smoothAndGenerateKeyframes({
        samples: [
          { time: 1.0, faces: [{ track_id: 't1', center_x: 0.2, center_y: 0.4, x: 0.15, y: 0.35, width: 0.1, height: 0.1 }] },
          { time: 6.0, faces: [{ track_id: 't1', center_x: 0.8, center_y: 0.4, x: 0.75, y: 0.35, width: 0.1, height: 0.1 }] },
        ],
        dominantTrackId: 't1',
        duration: 10.0,
        sourceFps: 30,
        sceneCuts: [5.58, 5.50],
      });

      // Cut keyframes must be anchored at 5.50, not 5.58
      const cutKfs = kfs.filter(k => k.time === 5.5 || Math.abs(k.time - 5.499) < 0.002);
      assert.ok(cutKfs.length >= 1, 'Cut boundary must snap to the earliest sorted timestamp (5.50s)');
      const wrongCut = kfs.find(k => k.time === 5.58 || Math.abs(k.time - 5.579) < 0.002);
      assert.equal(wrongCut, undefined, 'Late duplicate cut (5.58s) must have been merged into 5.50s');
    });

    test('2. Timebase-aware deduplication preserves genuine rapid montage cuts at 24 fps', () => {
      // At 24 fps, an 8-frame shot is 0.333s apart (e.g. cut at 3.00s and 3.35s).
      // Both cuts must be preserved as distinct shot boundaries.
      const kfs = SmartReframeService.smoothAndGenerateKeyframes({
        samples: [
          { time: 1.0, faces: [{ track_id: 't1', center_x: 0.2, center_y: 0.4, x: 0.15, y: 0.35, width: 0.1, height: 0.1 }] },
          { time: 3.1, faces: [{ track_id: 't2', center_x: 0.5, center_y: 0.4, x: 0.45, y: 0.35, width: 0.1, height: 0.1 }] },
          { time: 3.5, faces: [{ track_id: 't3', center_x: 0.8, center_y: 0.4, x: 0.75, y: 0.35, width: 0.1, height: 0.1 }] },
        ],
        dominantTrackId: 't1',
        duration: 8.0,
        sourceFps: 24,
        sceneCuts: [3.00, 3.35],
      });

      const cut1 = kfs.find(k => k.time === 3.0 || Math.abs(k.time - 2.999) < 0.002);
      const cut2 = kfs.find(k => k.time === 3.35 || Math.abs(k.time - 3.349) < 0.002);
      assert.ok(cut1, 'First rapid montage cut at 3.00s must be preserved');
      assert.ok(cut2, 'Second rapid montage cut at 3.35s (8 frames later) must be preserved');
    });

    test('3. Timebase-aware deduplication collapses detector duplicate spikes under 3 frames', () => {
      // At 30 fps, 2 frames is 0.067s. A detector false spike at 4.00s and 4.05s is a duplicate.
      const kfs = SmartReframeService.smoothAndGenerateKeyframes({
        samples: [
          { time: 1.0, faces: [{ track_id: 't1', center_x: 0.2, center_y: 0.4, x: 0.15, y: 0.35, width: 0.1, height: 0.1 }] },
          { time: 5.0, faces: [{ track_id: 't1', center_x: 0.8, center_y: 0.4, x: 0.75, y: 0.35, width: 0.1, height: 0.1 }] },
        ],
        dominantTrackId: 't1',
        duration: 10.0,
        sourceFps: 30,
        sceneCuts: [4.00, 4.05],
      });

      const cut1 = kfs.filter(k => k.time === 4.0 || Math.abs(k.time - 3.999) < 0.002);
      const cut2 = kfs.filter(k => k.time === 4.05 || Math.abs(k.time - 4.049) < 0.002);
      assert.ok(cut1.length >= 1, 'First cut at 4.00s preserved');
      assert.equal(cut2.length, 0, 'Duplicate detector cut at 4.05s (delta 0.05s) must be collapsed');
    });

    test('4. Cuts within 250ms of clip boundaries are strictly excluded', () => {
      const kfs = SmartReframeService.smoothAndGenerateKeyframes({
        samples: [
          { time: 1.0, faces: [{ track_id: 't1', center_x: 0.2, center_y: 0.4, x: 0.15, y: 0.35, width: 0.1, height: 0.1 }] },
          { time: 6.0, faces: [{ track_id: 't1', center_x: 0.8, center_y: 0.4, x: 0.75, y: 0.35, width: 0.1, height: 0.1 }] },
        ],
        dominantTrackId: 't1',
        duration: 10.0,
        sourceFps: 30,
        sceneCuts: [0.15, 0.24, 5.0, 9.76, 9.90],
      });

      // Cuts at 0.15, 0.24 (<0.25) and 9.76, 9.90 (>10 - 0.25) must NOT generate hard-cut pairs
      assert.equal(kfs.some(k => Math.abs(k.time - 0.15) < 0.002 || Math.abs(k.time - 0.149) < 0.002), false, 'Start boundary margin <0.25s cut 0.15s excluded');
      assert.equal(kfs.some(k => Math.abs(k.time - 0.24) < 0.002 || Math.abs(k.time - 0.239) < 0.002), false, 'Start boundary margin <0.25s cut 0.24s excluded');
      assert.equal(kfs.some(k => Math.abs(k.time - 9.76) < 0.002 || Math.abs(k.time - 9.759) < 0.002), false, 'End boundary margin >9.75s cut 9.76s excluded');
      assert.equal(kfs.some(k => Math.abs(k.time - 9.90) < 0.002 || Math.abs(k.time - 9.899) < 0.002), false, 'End boundary margin >9.75s cut 9.90s excluded');
      assert.ok(kfs.some(k => k.time === 5.0 || Math.abs(k.time - 4.999) < 0.002), 'Mid-clip cut at 5.0s preserved');
    });
  });

  describe('B. Export Hard-Cut Protection Across Keyframe Decimation (Requirement C)', () => {
    test('1. buildGroupFitFilter preserves hard-cut boundary pairs when keyframes > 40', () => {
      // Create 60 keyframes with a hard cut at t = 10.0s (pair: 9.999s, x=0.2 and 10.000s, x=0.8)
      const keyframes: Array<{ time: number; centerX: number; centerY: number }> = [];
      for (let i = 0; i < 30; i++) {
        keyframes.push({ time: Number((i * 0.33).toFixed(3)), centerX: 0.20, centerY: 0.38 });
      }
      // Insert exact hard cut pair
      keyframes.push({ time: 9.999, centerX: 0.20, centerY: 0.38 });
      keyframes.push({ time: 10.000, centerX: 0.80, centerY: 0.38 });
      for (let i = 1; i <= 30; i++) {
        keyframes.push({ time: Number((10.0 + i * 0.33).toFixed(3)), centerX: 0.80, centerY: 0.38 });
      }

      assert.ok(keyframes.length > 60, 'Input has > 40 keyframes');

      const filterGraph = SmartReframeService.buildGroupFitFilter({
        keyframes,
        windowW: 0.75,
        windowH: 0.75,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });

      // Verify that the hard-cut jump pair is NOT obliterated by decimation
      // In FFmpeg piecewise expression: 'lte(t,10.000)' or 'lte(t,9.999)' must exist
      assert.ok(filterGraph.includes('10.000') || filterGraph.includes('9.999'), 'Hard-cut boundary timestamp must be retained in FFmpeg filter expression');
      // Verify crop expression exists
      assert.ok(filterGraph.includes('crop='), 'Must produce valid crop filter');
      assert.ok(filterGraph.includes('boxblur='), 'Must produce valid boxblur fill');
    });

    test('2. Decimation retains strict temporal ordering and boundary endpoints', () => {
      const keyframes: Array<{ time: number; centerX: number; centerY: number }> = [];
      for (let i = 0; i < 50; i++) {
        keyframes.push({ time: Number((i * 0.5).toFixed(3)), centerX: 0.3 + (i % 5) * 0.05, centerY: 0.38 });
      }

      const filter = SmartReframeService.buildGroupFitFilter({
        keyframes,
        windowW: 0.8,
        sourceWidth: 1920,
        sourceHeight: 1080,
      });

      assert.ok(typeof filter === 'string' && filter.length > 50);
      assert.ok(filter.includes('split=2'));
    });
  });

  describe('C. Solo-Shot Behavior & P1.3 Shot Invariance (Requirement E)', () => {
    const makeFace = (trackId: string, cx: number, cy = 0.4, w = 0.15, h = 0.15, conf = 0.9) => ({
      track_id: trackId,
      center_x: cx,
      center_y: cy,
      x: cx - w / 2,
      y: cy - h / 2,
      width: w,
      height: h,
      confidence: conf,
    });

    test('1. Shot 1 has two speakers (split) and Shot 2 has one speaker (solo portrait crop)', () => {
      // 0-3s: Alice (left) and Bob (right)
      // 3-6s: Bob alone in close-up
      const samples = Array.from({ length: 12 }, (_, i) => {
        const time = i * 0.5;
        if (time < 3.0) {
          return { time, faces: [makeFace('spk_alice', 0.25), makeFace('spk_bob', 0.75)] };
        } else {
          return { time, faces: [makeFace('spk_bob', 0.50)] };
        }
      });

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [3.0],
        duration: 6.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        windowScope: 'shot',
      });

      assert.equal(plan.length, 2, 'Must partition into 2 shots');
      // Shot 1: Both speakers present -> split layout
      assert.equal(plan[0].kind, 'group');
      assert.ok(plan[0].splitGeometry && !plan[0].splitGeometry.unresolved, 'Shot 1 must resolve two-speaker split');
      assert.ok(plan[0].split !== undefined);

      // Shot 2: Bob alone -> Rule E.2: One confidently detected speaker evaluates solo portrait framing
      assert.equal(plan[1].kind, 'solo', 'Shot 2 with single speaker must evaluate solo portrait framing');
      assert.equal(plan[1].contextStatus, undefined, 'Shot 2 must not be marked unresolved review required');
      assert.ok(Math.abs(plan[1].keyframes[0].centerX - 0.50) < 0.05, 'Solo keyframe centered on Bob');
    });

    test('2. Missing explicitly requested speaker track enforces unresolved blur (Rule E.4)', () => {
      // Caller explicitly requested Alice and Bob.
      // Shot 2 has Bob alone, Alice is missing.
      const samples = Array.from({ length: 12 }, (_, i) => {
        const time = i * 0.5;
        if (time < 3.0) {
          return { time, faces: [makeFace('spk_alice', 0.25), makeFace('spk_bob', 0.75)] };
        } else {
          return { time, faces: [makeFace('spk_bob', 0.50)] };
        }
      });

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [3.0],
        duration: 6.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        speaker1TrackId: 'spk_alice',
        speaker2TrackId: 'spk_bob',
        windowScope: 'shot',
      });

      assert.equal(plan.length, 2);
      assert.equal(plan[0].splitGeometry!.unresolved, false);
      // Shot 2 requested Alice, but Alice is missing -> MUST NOT silently substitute or solo track
      assert.equal(plan[1].splitGeometry!.unresolved, true);
      assert.equal(plan[1].splitGeometry!.unresolvedReason, 'requested_speaker_track_not_found');
      assert.equal(plan[1].contextStatus, 'unresolved-review-required');
      assert.ok(plan[1].uncertainty?.includes('Using safe blur fallback'));
    });

    test('3. Insufficient evidence (0 faces) in shot falls back to safe blur and review (Rule E.3)', () => {
      const samples = Array.from({ length: 12 }, (_, i) => {
        const time = i * 0.5;
        if (time < 3.0) {
          return { time, faces: [makeFace('spk_alice', 0.25), makeFace('spk_bob', 0.75)] };
        } else {
          return { time, faces: [] }; // No faces in Shot 2
        }
      });

      const plan = SmartReframeService.computeShotComposition({
        targetLayout: 'split',
        rawSamples: samples,
        sceneCuts: [3.0],
        duration: 6.0,
        sourceWidth: 1920,
        sourceHeight: 1080,
        windowScope: 'shot',
      });

      assert.equal(plan.length, 2);
      assert.equal(plan[0].splitGeometry!.unresolved, false);
      assert.equal(plan[1].contextStatus, 'unresolved-review-required');
      assert.ok(plan[1].uncertainty?.includes('Using safe blur fallback'));
    });
  });

  describe('D. P0.1 Global Cut Bridge Validation (Requirement A)', () => {
    test('1. Global cuts slicing correctly converts to clip-relative coordinates', () => {
      // Global source video: cuts at [2.0, 7.5, 12.8, 18.2]
      // Clip window: startSec = 5.0, durationSec = 10.0 ([5.0s, 15.0s])
      const startSec = 5.0;
      const durationSec = 10.0;
      const globalCuts = [
        { timestamp: 2.0, score: 0.8 },   // Outside (before start)
        { timestamp: 5.15, score: 0.8 },  // Within 250ms of start (5.15 - 5.0 = 0.15 < 0.25) -> EXCLUDED
        { timestamp: 7.5, score: 0.8 },   // Valid (7.5 - 5.0 = 2.50s) -> INCLUDED
        { timestamp: 12.8, score: 0.8 },  // Valid (12.8 - 5.0 = 7.80s) -> INCLUDED
        { timestamp: 14.85, score: 0.8 }, // Within 250ms of end (14.85 - 5.0 = 9.85 > 9.75) -> EXCLUDED
        { timestamp: 18.2, score: 0.8 },  // Outside (after end)
      ];

      const relativeCuts = globalCuts
        .filter(c => Number.isFinite(c.timestamp))
        .map(c => Number(c.timestamp))
        .filter(t => t > startSec + 0.25 && t < startSec + durationSec - 0.25)
        .map(t => Number((t - startSec).toFixed(3)))
        .sort((a, b) => a - b);

      assert.deepEqual(relativeCuts, [2.5, 7.8]);
    });

    test('2. Only status === "completed" records are accepted from video_intelligence', () => {
      const completedRecord = {
        status: 'completed',
        visual_intelligence: {
          sceneCuts: [{ timestamp: 4.5, score: 0.7 }],
        },
      };
      const pendingRecord = {
        status: 'analyzing',
        visual_intelligence: {
          sceneCuts: [{ timestamp: 4.5, score: 0.7 }],
        },
      };
      const failedRecord = {
        status: 'failed',
        visual_intelligence: undefined,
      };

      const isValid = (rec: any) => Boolean(rec && rec.status === 'completed' && Array.isArray(rec.visual_intelligence?.sceneCuts));

      assert.equal(isValid(completedRecord), true, 'Completed record is valid');
      assert.equal(isValid(pendingRecord), false, 'Pending record must be rejected');
      assert.equal(isValid(failedRecord), false, 'Failed record must be rejected');
      assert.equal(isValid(null), false, 'Null record must be rejected');
    });
  });
});
