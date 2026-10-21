import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SmartReframeService } from '../services/smartReframeService.js';
import type {
  ReframeSample,
  NormalizedFaceDetection,
  ReframeKeyframe,
} from '../types/index.js';
import { buildSmartCropFilter } from '../services/clipRenderService.js';

const execFileAsync = promisify(execFile);

describe('Phase 13.1: Shot-Aware Framing, AV Active Speaker & Anti-Whip Tracking', () => {
  it('1. Scene-Cut Partitioning: emits hard-cut keyframe pair and prevents pan glitch across cut', () => {
    // Shot 1 (0.0s - 2.0s): Subject on the left (x = 0.2)
    // Shot 2 (2.0s - 4.0s): Subject on the right (x = 0.8)
    const samples: ReframeSample[] = [];

    // Shot 1
    for (let t = 0.0; t <= 1.8; t += 0.2) {
      samples.push({
        time: Number(t.toFixed(2)),
        faces: [{
          x: 0.1, y: 0.2, width: 0.2, height: 0.2,
          center_x: 0.2, center_y: 0.3,
          confidence: 0.95, track_id: 'subject_1',
        }],
      });
    }

    // Shot 2
    for (let t = 2.0; t <= 4.0; t += 0.2) {
      samples.push({
        time: Number(t.toFixed(2)),
        faces: [{
          x: 0.7, y: 0.2, width: 0.2, height: 0.2,
          center_x: 0.8, center_y: 0.3,
          confidence: 0.95, track_id: 'subject_2',
        }],
      });
    }

    const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'subject_1',
      duration: 4.0,
      sceneCuts: [2.0],
    });

    assert.ok(keyframes.length >= 3, 'Should generate multiple keyframes');

    // Find keyframe immediately before cut and at cut
    const preCutKf = keyframes.find((k) => k.time >= 1.95 && k.time < 2.0);
    const postCutKf = keyframes.find((k) => k.time >= 2.0 && k.time <= 2.02);

    assert.ok(preCutKf, 'Must emit keyframe right before scene cut');
    assert.ok(postCutKf, 'Must emit keyframe exactly at scene cut');

    // Pre-cut should frame Shot 1 (near 0.2)
    assert.ok(preCutKf.centerX < 0.35, `Pre-cut center (${preCutKf.centerX}) should be near 0.2`);
    // Post-cut should immediately jump to Shot 2 (near 0.8) without intermediate pan frames
    assert.ok(postCutKf.centerX > 0.65, `Post-cut center (${postCutKf.centerX}) should jump to near 0.8`);

    // Verify there is no keyframe in between that slowly pans across 0.4 - 0.6
    const midPanKf = keyframes.find((k) => k.time > preCutKf.time && k.time < postCutKf.time);
    assert.equal(midPanKf, undefined, 'No intermediate panning keyframe allowed across scene cut');
  });

  it('2. Audio-Visual Active Speaker Selection: prioritizes active speaker over passive listener', () => {
    // Subject 1: on screen for 10 samples, mouth_score = 0.05 (passive listener)
    // Subject 2: on screen for 7 samples, mouth_score = 0.85 (active speaker)
    const tracks = new Map<string, NormalizedFaceDetection[]>();

    const sub1Dets: NormalizedFaceDetection[] = [];
    for (let i = 0; i < 10; i++) {
      sub1Dets.push({
        x: 0.1, y: 0.2, width: 0.18, height: 0.18,
        center_x: 0.19, center_y: 0.29,
        confidence: 0.9,
        mouth_score: 0.05,
      });
    }
    tracks.set('listener', sub1Dets);

    const sub2Dets: NormalizedFaceDetection[] = [];
    for (let i = 0; i < 7; i++) {
      sub2Dets.push({
        x: 0.6, y: 0.2, width: 0.18, height: 0.18,
        center_x: 0.69, center_y: 0.29,
        confidence: 0.9,
        mouth_score: 0.85,
      });
    }
    tracks.set('speaker', sub2Dets);

    const result = SmartReframeService.selectDominantTrack(tracks, 10, {
      speechIntervals: [{ start: 0.0, end: 3.0 }],
    });

    assert.equal(result.dominantTrackId, 'speaker', 'Active speaker must be selected despite fewer presence frames');
    assert.ok(result.score > 0.45);
  });

  it('3. Conversational Turn-Taking across Shots: switches focus to active speaker after cut', () => {
    // Two speakers present in both shots:
    // Shot 1 (0-2s): Speaker A speaks (mouth=0.8), Speaker B silent (mouth=0.1)
    // Shot 2 (2-4s): Speaker B speaks (mouth=0.85), Speaker A silent (mouth=0.1)
    const samples: ReframeSample[] = [];

    for (let t = 0.0; t <= 1.8; t += 0.2) {
      samples.push({
        time: Number(t.toFixed(2)),
        faces: [
          { x: 0.1, y: 0.2, width: 0.15, height: 0.15, center_x: 0.2, center_y: 0.3, confidence: 0.9, track_id: 'spk_A', mouth_score: 0.8 },
          { x: 0.7, y: 0.2, width: 0.15, height: 0.15, center_x: 0.8, center_y: 0.3, confidence: 0.9, track_id: 'spk_B', mouth_score: 0.1 },
        ],
      });
    }

    for (let t = 2.0; t <= 4.0; t += 0.2) {
      samples.push({
        time: Number(t.toFixed(2)),
        faces: [
          { x: 0.1, y: 0.2, width: 0.15, height: 0.15, center_x: 0.2, center_y: 0.3, confidence: 0.9, track_id: 'spk_A', mouth_score: 0.1 },
          { x: 0.7, y: 0.2, width: 0.15, height: 0.15, center_x: 0.8, center_y: 0.3, confidence: 0.9, track_id: 'spk_B', mouth_score: 0.85 },
        ],
      });
    }

    const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'spk_A',
      duration: 4.0,
      sceneCuts: [2.0],
      speechIntervals: [{ start: 0, end: 1.8 }, { start: 2.0, end: 4.0 }],
    });

    const shot1Kf = keyframes.find((k) => k.time >= 0.5 && k.time <= 1.5);
    const shot2Kf = keyframes.find((k) => k.time >= 2.5 && k.time <= 3.5);

    assert.ok(shot1Kf && shot1Kf.centerX < 0.35, 'Shot 1 must focus on Speaker A');
    assert.ok(shot2Kf && shot2Kf.centerX > 0.65, 'Shot 2 must focus on Speaker B');
  });

  it('4. Hysteresis within Shot: resists erratic whip-panning from brief noise', () => {
    // Single shot with primary speaker at 0.3. A brief 1-frame mouth twitch from listener at 0.8
    const samples: ReframeSample[] = [];

    for (let t = 0.0; t <= 3.0; t += 0.2) {
      const isTwitch = Math.abs(t - 1.4) < 0.05;
      samples.push({
        time: Number(t.toFixed(2)),
        faces: [
          { x: 0.25, y: 0.2, width: 0.15, height: 0.15, center_x: 0.3, center_y: 0.3, confidence: 0.9, track_id: 'main_spk', mouth_score: 0.75 },
          { x: 0.75, y: 0.2, width: 0.15, height: 0.15, center_x: 0.8, center_y: 0.3, confidence: 0.9, track_id: 'listener', mouth_score: isTwitch ? 0.76 : 0.05 },
        ],
      });
    }

    const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'main_spk',
      duration: 3.0,
      sceneCuts: [],
    });

    // Camera should stay anchored on main_spk (~0.3) throughout the shot
    for (const kf of keyframes) {
      assert.ok(kf.centerX < 0.45, `Keyframe at t=${kf.time} with centerX=${kf.centerX} should stay near 0.3`);
    }
  });

  it('5. Tight Two-Shot Framing: frames midpoint when two speakers are closely seated', () => {
    // Two speakers close together at center_x = 0.40 and center_x = 0.60 (|x1 - x2| = 0.20 <= 0.32)
    const samples: ReframeSample[] = [];

    for (let t = 0.0; t <= 2.0; t += 0.2) {
      samples.push({
        time: Number(t.toFixed(2)),
        faces: [
          { x: 0.35, y: 0.2, width: 0.1, height: 0.1, center_x: 0.40, center_y: 0.3, confidence: 0.9, track_id: 'host_left', mouth_score: 0.6 },
          { x: 0.55, y: 0.2, width: 0.1, height: 0.1, center_x: 0.60, center_y: 0.3, confidence: 0.9, track_id: 'host_right', mouth_score: 0.6 },
        ],
      });
    }

    const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 'host_left',
      duration: 2.0,
      sceneCuts: [],
    });

    // In a tight two-shot, crop should be centered around the midpoint (0.50)
    for (const kf of keyframes) {
      assert.ok(Math.abs(kf.centerX - 0.50) < 0.08, `Two-shot keyframe should be near midpoint 0.50, got ${kf.centerX}`);
    }
  });

  it('6. Collinear Pruning & Expression Capping: caps keyframes <= 45 and preserves hard cuts', () => {
    // Generate 120 keyframes with redundant collinear drift + 1 hard cut at t = 10.0
    const rawKeyframes: ReframeKeyframe[] = [];

    for (let i = 0; i < 50; i++) {
      const t = i * 0.2;
      rawKeyframes.push({
        time: Number(t.toFixed(2)),
        centerX: 0.25, // perfectly flat line
        centerY: 0.5,
      });
    }

    // Hard cut at 10.0s:
    rawKeyframes.push({ time: 9.995, centerX: 0.25, centerY: 0.5 });
    rawKeyframes.push({ time: 10.000, centerX: 0.75, centerY: 0.5 });

    for (let i = 51; i < 110; i++) {
      const t = 10.0 + (i - 50) * 0.2;
      rawKeyframes.push({
        time: Number(t.toFixed(2)),
        centerX: 0.75, // flat line
        centerY: 0.5,
      });
    }

    const filter = buildSmartCropFilter(rawKeyframes, '9:16', 1920, 1080, 22.0);

    // Verify filter expression is generated properly
    assert.ok(filter.includes('crop=1080:1920:'), 'Filter should contain crop expression');
    assert.ok(filter.includes('if(lte(t\\,'), 'Filter should contain piecewise expressions');

    // Count if(lte( expressions to verify capping
    const ifCount = (filter.match(/if\(lte\(t\\,/g) || []).length;
    assert.ok(ifCount <= 45, `Keyframe if expressions (${ifCount}) must be capped at <= 45`);

    // Ensure hard cut at 10.000 is preserved in the filter
    assert.ok(filter.includes('10.000') || filter.includes('9.995'), 'Hard cut transition must be preserved');
  });

  it('7. Track Association: reconnects rapid subject motion using linear velocity and 2.2s dropout survival', () => {
    // Subject moving rightward with 1.4s occlusion gap
    const samples: ReframeSample[] = [
      {
        time: 0.0,
        faces: [{ x: 0.1, y: 0.2, width: 0.15, height: 0.15, center_x: 0.175, center_y: 0.275, confidence: 0.9 }],
      },
      {
        time: 0.3,
        faces: [{ x: 0.2, y: 0.2, width: 0.15, height: 0.15, center_x: 0.275, center_y: 0.275, confidence: 0.9 }],
      },
      // 1.4 second gap (dropout / occlusion)
      {
        time: 1.7,
        faces: [{ x: 0.4, y: 0.2, width: 0.15, height: 0.15, center_x: 0.475, center_y: 0.275, confidence: 0.9 }],
      },
    ];

    const { tracks, faceCount } = SmartReframeService.associateTracks(samples, 0.45);

    assert.equal(faceCount, 1, 'Should track as a single stable subject across 1.4s dropout');
    const subject1 = tracks.get('subject_1');
    assert.ok(subject1, 'subject_1 track must exist');
    assert.equal(subject1.length, 3, 'All 3 detections must belong to subject_1');
  });

  it('8. Real FFmpeg Render: executes hard-cut filter on real video without syntax/stack errors', async () => {
    const tmpDir = path.resolve(process.cwd(), 'server/temp_test_reframe_phase13_1');
    fs.mkdirSync(tmpDir, { recursive: true });

    const srcVideo = path.join(tmpDir, 'test_cut_src.mp4');
    const outVideo = path.join(tmpDir, 'test_cut_out.mp4');

    try {
      // Create a 3-second 640x360 test video with a scene color shift at 1.5s
      await execFileAsync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=blue:s=640x360:d=1.5',
        '-f', 'lavfi',
        '-i', 'color=c=red:s=640x360:d=1.5',
        '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[outv]',
        '-map', '[outv]',
        '-pix_fmt', 'yuv420p',
        srcVideo,
      ]);

      const keyframes: ReframeKeyframe[] = [
        { time: 0.0, centerX: 0.2, centerY: 0.5 },
        { time: 1.495, centerX: 0.2, centerY: 0.5 },
        { time: 1.500, centerX: 0.8, centerY: 0.5 },
        { time: 3.0, centerX: 0.8, centerY: 0.5 },
      ];

      const cropFilter = buildSmartCropFilter(keyframes, '9:16', 640, 360, 3.0);

      // Execute render with real FFmpeg
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', srcVideo,
        '-vf', cropFilter,
        '-t', '3.0',
        '-pix_fmt', 'yuv420p',
        outVideo,
      ]);

      assert.ok(fs.existsSync(outVideo), 'Output video must be generated');
      const stats = fs.statSync(outVideo);
      assert.ok(stats.size > 5000, `Output video size (${stats.size}) must be valid`);
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
