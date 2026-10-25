import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  applyWordEnergyFusion,
  speechDensity,
  WordTiming,
} from '../utils/wordEnergyFusion.js';
import {
  detectReactionSpikes,
  corroborateEventWithSpikes,
  EnergySegment,
} from '../utils/reactionSpikes.js';
import { ReframeKeyframe } from '../types/index.js';

/**
 * Word-energy diarization fusion + audio-spike reactions + VLM game events,
 * integrated into clipping. Pure logic fully tested; service paths pinned.
 */

const kf = (time: number, cx = 0.3, cy = 0.38): ReframeKeyframe => ({ time, centerX: cx, centerY: cy });
const w = (start: number, end: number, word = 'x'): WordTiming => ({ start, end, word });

describe('Word-energy fusion — switches align to word boundaries', () => {
  it('a speaker switch mid-word snaps to the nearest word boundary', () => {
    // Words 0-0.4 and 0.6-1.0; switch lands at 0.5 inside the gap — stays.
    // Second case: switch at 0.2 (mid-word) snaps to 0.4/0.6 region.
    const words = [w(0.0, 0.4), w(0.6, 1.0), w(1.2, 1.6)];
    const keyframes = [kf(0), kf(0.2, 0.7), kf(0.8)]; // switch at 0.2 (mid-word)
    const fused = applyWordEnergyFusion(keyframes, words);
    // 0.2 is inside word[0]; nearest boundaries are 0.0 and 0.4 → snap to 0.4.
    assert.equal(fused[1].time >= 0.38 && fused[1].time <= 0.42, true, `snapped to ${fused[1].time}`);
    // Position preserved — only time moved.
    assert.equal(fused[1].centerX, 0.7);
  });

  it('switches already in a speech pause are left alone', () => {
    const words = [w(0.0, 0.4), w(0.6, 1.0)];
    const keyframes = [kf(0), kf(0.5, 0.7)]; // 0.5 is in the pause
    const fused = applyWordEnergyFusion(keyframes, words);
    assert.equal(fused[1].time, 0.5);
  });

  it('never crosses adjacent keyframes and degrades safely with no words', () => {
    const words = [w(0.0, 2.0)];
    const keyframes = [kf(0), kf(1.9, 0.7), kf(1.95)];
    const fused = applyWordEnergyFusion(keyframes, words);
    for (let i = 1; i < fused.length; i++) {
      assert.ok(fused[i].time > fused[i - 1].time, 'strictly increasing');
    }
    // No words → unchanged
    const none = applyWordEnergyFusion([kf(0), kf(1, 0.8)], []);
    assert.deepEqual(none, [kf(0), kf(1, 0.8)]);
    // Fewer than 2 keyframes → unchanged
    assert.deepEqual(applyWordEnergyFusion([kf(1)], [w(0, 1)]), [kf(1)]);
  });

  it('non-cut keyframes (smooth pans) keep their times', () => {
    const words = [w(0.0, 0.4), w(0.6, 1.0)];
    // Same subject position (0.3) — a pan, not a switch; time 0.2 mid-word kept.
    const keyframes = [kf(0, 0.3), kf(0.2, 0.32)];
    const fused = applyWordEnergyFusion(keyframes, words);
    assert.equal(fused[1].time, 0.2);
  });

  it('speechDensity measures word coverage of a window', () => {
    const words = [w(0, 0.5), w(0.6, 1.0)];
    assert.equal(speechDensity(0, 1, words), 0.9);
    assert.equal(speechDensity(0, 0.25, words), 1);
    assert.equal(speechDensity(5, 6, words), 0);
  });
});

describe('Audio-spike reaction detection', () => {
  const seg = (start: number, db: number): EnergySegment => ({ start, end: start + 1, audio_energy_db: db });

  it('detects surges above local baseline with confidence and separation', () => {
    const segments = [
      seg(0, -30), seg(1, -31), seg(2, -30), seg(3, -14), seg(4, -30), seg(5, -31), seg(6, -30), seg(7, -30), seg(8, -29),
    ];
    const spikes = detectReactionSpikes(segments);
    assert.equal(spikes.length, 1);
    assert.equal(spikes[0].time, 3);
    assert.equal(spikes[0].magnitude >= 9, true);
    assert.equal(spikes[0].confidence >= 0.5, true);
  });

  it('keeps the stronger spike within the separation window', () => {
    const segments = [
      seg(0, -30), seg(1, -31), seg(2, -20), seg(3, -12), seg(4, -30), seg(5, -30), seg(6, -30), seg(7, -30), seg(8, -30),
    ];
    const spikes = detectReactionSpikes(segments);
    assert.equal(spikes.length, 1);
    assert.equal(spikes[0].peakDb, -12);
  });

  it('flat audio and too-few segments produce nothing', () => {
    assert.deepEqual(detectReactionSpikes([seg(0, -20), seg(1, -20)]), []);
    const flat = [seg(0, -20), seg(1, -20), seg(2, -20), seg(3, -20)];
    assert.deepEqual(detectReactionSpikes(flat), []);
  });

  it('event corroboration: agreement boosts, disagreement caps below trust', () => {
    const spikes = [{ time: 5, magnitude: 12, peakDb: -12, confidence: 0.8 }];
    const yes = corroborateEventWithSpikes(5.5, 0.7, spikes);
    assert.equal(yes.corroborated, true);
    assert.ok(yes.confidence > 0.7);
    const no = corroborateEventWithSpikes(30, 0.7, spikes);
    assert.equal(no.corroborated, false);
    assert.ok(no.confidence <= 0.7);
  });
});

describe('Game-event service + clipping integration (wiring pins)', () => {
  const svc = fs.readFileSync(path.resolve(process.cwd(), 'src/services/gameEventService.ts'), 'utf8');
  const scoring = fs.readFileSync(path.resolve(process.cwd(), 'src/services/multimodal/multimodalScoringService.ts'), 'utf8');
  const analysis = fs.readFileSync(path.resolve(process.cwd(), 'src/services/clipAnalysisService.ts'), 'utf8');
  const reframe = fs.readFileSync(path.resolve(process.cwd(), 'src/services/smartReframeService.ts'), 'utf8');
  const processing = fs.readFileSync(path.resolve(process.cwd(), 'src/services/videoProcessingService.ts'), 'utf8');

  it('VLM detection is cost-gated, capped, and never throws into the pipeline', () => {
    assert.match(svc, /config\.gameEventsAuto/);
    assert.match(svc, /GAME_EVENTS/);
    assert.match(svc, /clipping unaffected/);
    assert.match(svc, /MAX_FRAMES = 24/);
  });

  it('events cross-validate with audio spikes (vision + audio agree)', () => {
    assert.match(svc, /corroborateEventWithSpikes/);
    assert.match(svc, /corroborated_by_audio/);
    // Standalone strong spikes become reaction events (Eklipse fallback parity).
    assert.match(svc, /type: 'reaction'/);
  });

  it('gaming candidates earn a gameplay-alignment hook bonus with disclosed reason', () => {
    assert.match(scoring, /gameplayEvents/);
    assert.match(scoring, /hook_score \+ \(gameplayAlignment\.corroborated \? 10 : 6\)/);
    assert.match(scoring, /vision \+ audio agree/);
  });

  it('analysis passes events only for the gaming genre (scoped enrichment)', () => {
    assert.match(analysis, /genreProfile\.genre === 'gaming' \? gameplayEvents : undefined/);
    assert.match(analysis, /GameEventService\.getEvents\(projectId\)/);
  });

  it('reframe tracks apply word-energy fusion after CV smoothing', () => {
    assert.match(reframe, /applyWordEnergyFusion\(smoothedKeyframes, wordTimings\)/);
    assert.match(reframe, /smoothed_keyframes: fusedKeyframes/);
    assert.match(reframe, /word_energy_fused: wordTimings\.length > 0/);
  });

  it('processing auto-triggers game analysis for gaming/sports when enabled', () => {
    assert.match(processing, /config\.gameEventsAuto/);
    assert.match(processing, /genre === 'gaming' \|\| genre === 'sports'/);
    assert.match(processing, /GameEventService/);
  });
});
