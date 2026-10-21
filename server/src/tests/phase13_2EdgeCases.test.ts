import test from 'node:test';
import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';
import type { ReframeSample, ReframeKeyframe, NormalizedFaceDetection } from '../types/index.js';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

test('Phase 13.2 QA - Edge Cases & Robustness', async (t) => {
  await t.test('1. Missing scene_cuts defaults gracefully without cuts or errors', () => {
    const samples: ReframeSample[] = [
      { time: 0.0, faces: [{ x: 0.2, y: 0.2, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'subject_1' }] },
      { time: 2.0, faces: [{ x: 0.5, y: 0.2, width: 0.1, height: 0.1, center_x: 0.55, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'subject_1' }] },
      { time: 4.0, faces: [{ x: 0.7, y: 0.2, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'subject_1' }] },
    ];

    const kfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'subject_1',
      duration: 5.0,
      sceneCuts: undefined, // Missing scene_cuts
    });

    assert.ok(kfs.length >= 2, 'Keyframes should be generated');
    assert.equal(kfs[0].time, 0);
    assert.equal(kfs[kfs.length - 1].time, 5.0);
  });

  await t.test('2. Malformed, duplicate, unordered, negative, or out-of-duration cut timestamps', () => {
    const samples: ReframeSample[] = [
      { time: 0.0, faces: [{ x: 0.2, y: 0.2, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'subject_1' }] },
      { time: 2.0, faces: [{ x: 0.2, y: 0.2, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'subject_1' }] },
      { time: 3.0, faces: [{ x: 0.7, y: 0.2, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'subject_2' }] },
      { time: 5.0, faces: [{ x: 0.7, y: 0.2, width: 0.1, height: 0.1, center_x: 0.75, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'subject_2' }] },
    ];

    // Messy scene cuts: negative, NaN, duplicates within 0.4s, beyond duration, unordered
    const messyCuts = [-1.5, NaN, 2.5, 2.52, 99.0, 0.1, 2.5];

    const kfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'subject_1',
      duration: 5.0,
      sceneCuts: messyCuts,
    });

    assert.ok(kfs.length >= 2);
    // Cut at 2.5 should be cleanly sanitized and processed
    const hasSanitizedCut = kfs.some((k) => Math.abs(k.time - 2.5) <= 0.02);
    assert.ok(hasSanitizedCut, 'Cut at 2.5s should be preserved cleanly despite malformed array');
  });

  await t.test('3. Missing mouth_score falls back safely to legacy scoring formula', () => {
    const tracks = new Map<string, NormalizedFaceDetection[]>([
      [
        'subject_1',
        [
          { x: 0.2, y: 0.2, width: 0.2, height: 0.2, center_x: 0.3, center_y: 0.3, area: 0.04, confidence: 0.95 },
          { x: 0.2, y: 0.2, width: 0.2, height: 0.2, center_x: 0.3, center_y: 0.3, area: 0.04, confidence: 0.95 },
        ],
      ],
      [
        'subject_2',
        [
          { x: 0.6, y: 0.2, width: 0.1, height: 0.1, center_x: 0.65, center_y: 0.25, area: 0.01, confidence: 0.7 },
        ],
      ],
    ]);

    const result = SmartReframeService.selectDominantTrack(tracks, 2);
    assert.equal(result.dominantTrackId, 'subject_1');
    assert.ok(result.score > 0.5, 'Legacy score formula should yield expected dominant track');
  });

  await t.test('4. Constant / placeholder speaker labels do not crash or corrupt tracking', () => {
    const samples: ReframeSample[] = [
      { time: 0.0, faces: [{ x: 0.4, y: 0.4, width: 0.1, height: 0.1, center_x: 0.45, center_y: 0.45, area: 0.01, confidence: 0.9, track_id: 'SPEAKER_00' }] },
      { time: 1.0, faces: [{ x: 0.4, y: 0.4, width: 0.1, height: 0.1, center_x: 0.45, center_y: 0.45, area: 0.01, confidence: 0.9, track_id: 'SPEAKER_00' }] },
    ];

    const kfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'SPEAKER_00',
      duration: 2.0,
    });

    assert.ok(kfs.length >= 2);
    assert.equal(kfs[0].time, 0);
  });

  await t.test('5. Overlapping speech intervals are handled safely without NaN or infinite weights', () => {
    const tracks = new Map<string, NormalizedFaceDetection[]>([
      [
        'subject_1',
        [
          { x: 0.2, y: 0.2, width: 0.2, height: 0.2, center_x: 0.3, center_y: 0.3, area: 0.04, confidence: 0.95, mouth_score: 0.8 },
        ],
      ],
      [
        'subject_2',
        [
          { x: 0.6, y: 0.2, width: 0.2, height: 0.2, center_x: 0.7, center_y: 0.3, area: 0.04, confidence: 0.95, mouth_score: 0.3 },
        ],
      ],
    ]);

    // Overlapping speech intervals
    const speechIntervals = [
      { start: 0.0, end: 5.0 },
      { start: 2.0, end: 7.0 },
      { start: 1.0, end: 3.0 },
    ];

    const result = SmartReframeService.selectDominantTrack(tracks, 2, { speechIntervals });
    assert.equal(result.dominantTrackId, 'subject_1');
    assert.ok(Number.isFinite(result.score));
  });

  await t.test('6. Face detector dropout holds position for <= 1.0s then eases toward center', () => {
    const samples: ReframeSample[] = [
      { time: 0.0, faces: [{ x: 0.2, y: 0.2, width: 0.1, height: 0.1, center_x: 0.25, center_y: 0.25, area: 0.01, confidence: 0.9, track_id: 'subject_1' }] },
      { time: 0.5, faces: [] }, // Short dropout 0.5s -> should hold near 0.25
      { time: 1.0, faces: [] }, // 1.0s dropout -> holds
      { time: 2.5, faces: [] }, // 2.5s dropout -> eases toward 0.5 center
      { time: 4.0, faces: [] }, // 4.0s dropout -> reached center 0.5
    ];

    const kfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'subject_1',
      duration: 5.0,
    });

    const kfAt1 = kfs.find((k) => Math.abs(k.time - 1.0) < 0.2) || kfs[0];
    const kfAt4 = kfs[kfs.length - 1];

    assert.ok(kfAt1.centerX <= 0.26, `Short dropout should hold position near 0.25, got ${kfAt1.centerX}`);
    assert.ok(kfAt4.centerX > kfAt1.centerX && kfAt4.centerX <= 0.50, `Long dropout should ease toward 0.5, got ${kfAt4.centerX}`);
  });

  await t.test('7. Long videos reaching keyframe cap (<= 45) do NOT crash FFmpeg and preserve valid filter syntax', async () => {
    const longKfs: ReframeKeyframe[] = [];
    for (let i = 0; i < 90; i++) {
      longKfs.push({
        time: i * 0.5,
        centerX: 0.2 + (i % 2) * 0.5,
        centerY: 0.5,
      });
    }

    const filter = SmartReframeService.buildSmartCropFilter(longKfs, '9:16', 1920, 1080, 45.0);
    assert.ok(filter.includes('scale=1080:1920'));
    assert.ok(filter.includes('crop=1080:1920'));

    // Validate with real FFmpeg lavfi
    await execFileAsync('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=duration=1:size=1920x1080:rate=30',
      '-vf', filter,
      '-t', '0.1',
      '-f', 'null',
      '-',
    ]);
  });

  await t.test('8. Multiple hard cuts are strictly preserved across collinear pruning and capping', () => {
    // Construct keyframes with 3 hard cuts
    const cutKfs: ReframeKeyframe[] = [
      { time: 0.0, centerX: 0.25, centerY: 0.5 },
      { time: 1.0, centerX: 0.25, centerY: 0.5 },
      // Cut 1 at 2.0s: jump from 0.25 to 0.75
      { time: 1.995, centerX: 0.25, centerY: 0.5 },
      { time: 2.000, centerX: 0.75, centerY: 0.5 },
      { time: 3.0, centerX: 0.75, centerY: 0.5 },
      // Cut 2 at 4.0s: jump from 0.75 to 0.30
      { time: 3.995, centerX: 0.75, centerY: 0.5 },
      { time: 4.000, centerX: 0.30, centerY: 0.5 },
      { time: 5.0, centerX: 0.30, centerY: 0.5 },
      // Cut 3 at 6.0s: jump from 0.30 to 0.80
      { time: 5.995, centerX: 0.30, centerY: 0.5 },
      { time: 6.000, centerX: 0.80, centerY: 0.5 },
      { time: 7.0, centerX: 0.80, centerY: 0.5 },
    ];

    const filter = SmartReframeService.buildSmartCropFilter(cutKfs, '9:16', 1920, 1080, 7.0);

    // The filter string must contain the cut step times 1.995, 2.000, 3.995, 4.000, 5.995, 6.000
    assert.ok(filter.includes('1.995') || filter.includes('2.000'), 'Cut 1 must be preserved in filter');
    assert.ok(filter.includes('3.995') || filter.includes('4.000'), 'Cut 2 must be preserved in filter');
    assert.ok(filter.includes('5.995') || filter.includes('6.000'), 'Cut 3 must be preserved in filter');
  });
});
