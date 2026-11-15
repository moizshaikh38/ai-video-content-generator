import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  SmartReframeService,
  resolveGenreReframeOptions,
} from '../services/smartReframeService.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { ReframeSample } from '../types/index.js';

/**
 * Phase 3b: genre-aware reframe wiring.
 *
 * Before this change the genre profiles' reframeConfig (deadZone, maxVelocity,
 * smoothingAlpha) and recommendedLayoutMode existed in genreIntelligenceService
 * but were never passed into the reframe pipeline - every genre rendered with
 * the same generic smoothing. These tests pin the merge semantics and prove the
 * parameters actually change the smoothed crop trajectory on identical input.
 */

describe('resolveGenreReframeOptions merge semantics', () => {
  it('fills from the genre profile when no explicit options are given', () => {
    const merged = resolveGenreReframeOptions({}, 'podcast_interview');
    const profile = GenreIntelligenceService.getGenreProfile('podcast_interview');
    assert.equal(merged.deadZone, profile.reframeConfig.deadZone);
    assert.equal(merged.maxVelocity, profile.reframeConfig.maxVelocity);
    assert.equal(merged.smoothingAlpha, profile.reframeConfig.smoothingAlpha);
    assert.equal(merged.preferredLayoutMode, profile.recommendedLayoutMode);
  });

  it('explicit per-call options always win over the genre profile', () => {
    const merged = resolveGenreReframeOptions(
      { deadZone: 0.5, smoothingAlpha: 0.9 },
      'gaming'
    );
    assert.equal(merged.deadZone, 0.5);
    assert.equal(merged.smoothingAlpha, 0.9);
    // Unspecified fields still fall through to the genre profile.
    assert.equal(
      merged.maxVelocity,
      GenreIntelligenceService.getGenreProfile('gaming').reframeConfig.maxVelocity
    );
  });

  it('returns undefined fields when no genre is set (internal defaults then apply)', () => {
    const merged = resolveGenreReframeOptions({}, null);
    assert.equal(merged.deadZone, undefined);
    assert.equal(merged.maxVelocity, undefined);
    assert.equal(merged.smoothingAlpha, undefined);
    assert.equal(merged.preferredLayoutMode, undefined);
  });

  it('unknown genre strings fall back to the general profile', () => {
    const merged = resolveGenreReframeOptions({}, 'not-a-real-genre');
    const general = GenreIntelligenceService.getGenreProfile('general');
    assert.equal(merged.deadZone, general.reframeConfig.deadZone);
  });
});

describe('genre reframeConfig changes the actual smoothed trajectory', () => {
  // One face on one track, walking steadily from x=0.2 to x=0.8 over 4s.
  const makeSamples = (): ReframeSample[] => {
    const samples: ReframeSample[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i * 0.25;
      const x = 0.2 + 0.6 * (t / 4);
      samples.push({
        time: t,
        faces: [
          {
            // Small box: tracking-tightness differences must come from the
            // smoothing parameters here, not from the retention boundary
            // (retention behavior is pinned by its own test suite below).
            x: x - 0.025,
            y: 0.2,
            width: 0.05,
            height: 0.2,
            center_x: x,
            center_y: 0.3,
            confidence: 0.95,
            track_id: 't1',
          },
        ],
      });
    }
    return samples;
  };

  const finalX = (keyframes: { time: number; centerX: number }[]): number =>
    keyframes[keyframes.length - 1].centerX;

  it('gaming config tracks a moving subject tighter than podcast config on identical samples', () => {
    const samples = makeSamples();
    const podcast = GenreIntelligenceService.getGenreProfile('podcast_interview').reframeConfig;
    const gaming = GenreIntelligenceService.getGenreProfile('gaming').reframeConfig;

    const podcastKfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 't1',
      duration: 4,
      deadZone: podcast.deadZone,
      maxVelocity: podcast.maxVelocity,
      smoothingAlpha: podcast.smoothingAlpha,
    });
    const gamingKfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 't1',
      duration: 4,
      deadZone: gaming.deadZone,
      maxVelocity: gaming.maxVelocity,
      smoothingAlpha: gaming.smoothingAlpha,
    });

    // The configurations must not collapse into identical output.
    assert.notDeepEqual(
      gamingKfs.map((k) => k.centerX),
      podcastKfs.map((k) => k.centerX)
    );

    // Raw trajectory ends at x=0.8; the tighter config (gaming: larger
    // smoothingAlpha, smaller deadZone) must end closer to it.
    const rawFinalX = 0.8;
    const podcastErr = Math.abs(finalX(podcastKfs) - rawFinalX);
    const gamingErr = Math.abs(finalX(gamingKfs) - rawFinalX);
    assert.ok(
      gamingErr < podcastErr,
      `gaming should track tighter (gamingErr=${gamingErr}, podcastErr=${podcastErr})`
    );
  });

  it('larger deadZone ignores micro-jitter that smaller deadZone tracks', () => {
    // Jitter of +/-0.02 around center: below podcast deadZone (0.05), and its
    // accumulated drift must stay far below the gaming response.
    const samples: ReframeSample[] = [];
    for (let i = 0; i <= 16; i++) {
      const t = i * 0.25;
      const x = 0.5 + (i % 2 === 0 ? 0.02 : -0.02);
      samples.push({
        time: t,
        faces: [
          {
            x: x - 0.1,
            y: 0.2,
            width: 0.2,
            height: 0.2,
            center_x: x,
            center_y: 0.3,
            confidence: 0.95,
            track_id: 't1',
          },
        ],
      });
    }
    const podcast = GenreIntelligenceService.getGenreProfile('podcast_interview').reframeConfig;
    const gaming = GenreIntelligenceService.getGenreProfile('gaming').reframeConfig;
    const run = (cfg: typeof podcast) =>
      SmartReframeService.smoothAndGenerateKeyframes({
        samples,
        dominantTrackId: 't1',
        duration: 4,
        deadZone: cfg.deadZone,
        maxVelocity: cfg.maxVelocity,
        smoothingAlpha: cfg.smoothingAlpha,
      });
    const range = (kfs: { centerX: number }[]) =>
      Math.max(...kfs.map((k) => k.centerX)) - Math.min(...kfs.map((k) => k.centerX));

    const podcastRange = range(run(podcast));
    const gamingRange = range(run(gaming));
    assert.ok(
      gamingRange > podcastRange,
      `gaming should react to jitter more (gaming=${gamingRange}, podcast=${podcastRange})`
    );
    assert.ok(
      podcastRange < 0.05,
      `podcast deadZone should suppress micro-jitter (range=${podcastRange})`
    );
  });
});


describe('subject retention: smoothing may not lose a known subject', () => {
  // Fast subject crossing most of the frame in 2s - quicker than the podcast
  // config's steadiness tuning would follow on its own.
  const HALF_W = Math.min(1, (720 * (9 / 16)) / 1280) / 2; // 9:16 window from 1280x720

  const fastSamples = (): ReframeSample[] => {
    const samples: ReframeSample[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i * 0.1;
      const cx = 0.1 + 0.8 * (t / 2);
      samples.push({
        time: t,
        faces: [
          {
            x: cx - 0.05,
            y: 0.4,
            width: 0.1,
            height: 0.1,
            center_x: cx,
            center_y: 0.45,
            confidence: 0.95,
            track_id: 't1',
          },
        ],
      });
    }
    return samples;
  };

  it('podcast config keeps a fast subject fully inside the crop window at every keyframe', () => {
    const podcast = GenreIntelligenceService.getGenreProfile('podcast_interview').reframeConfig;
    const kfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples: fastSamples(),
      dominantTrackId: 't1',
      duration: 2,
      deadZone: podcast.deadZone,
      maxVelocity: podcast.maxVelocity,
      smoothingAlpha: podcast.smoothingAlpha,
      aspectRatio: '9:16',
      sourceWidth: 1280,
      sourceHeight: 720,
    });

    const eps = 1e-3;
    for (const kf of kfs) {
      const cx = 0.1 + 0.8 * (kf.time / 2);
      const boxLeft = cx - 0.05;
      const boxRight = cx + 0.05;
      const winLeft = kf.centerX - HALF_W;
      const winRight = kf.centerX + HALF_W;
      assert.ok(
        winLeft <= boxLeft + eps && winRight >= boxRight - eps,
        `subject must stay inside the window at t=${kf.time}: ` +
          `window [${winLeft.toFixed(4)}, ${winRight.toFixed(4)}], box [${boxLeft.toFixed(4)}, ${boxRight.toFixed(4)}]`
      );
    }
  });

  it('a subject wider than the window is centered on, not clamped away', () => {
    const samples: ReframeSample[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i * 0.2;
      samples.push({
        time: t,
        faces: [
          {
            x: 0.6,
            y: 0.2,
            width: 0.35, // wider than the 0.3164-wide 9:16 window
            height: 0.2,
            center_x: 0.775,
            center_y: 0.3,
            confidence: 0.95,
            track_id: 't1',
          },
        ],
      });
    }
    const podcast = GenreIntelligenceService.getGenreProfile('podcast_interview').reframeConfig;
    const kfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples,
      dominantTrackId: 't1',
      duration: 2,
      deadZone: podcast.deadZone,
      maxVelocity: podcast.maxVelocity,
      smoothingAlpha: podcast.smoothingAlpha,
      aspectRatio: '9:16',
      sourceWidth: 1280,
      sourceHeight: 720,
    });
    const last = kfs[kfs.length - 1];
    assert.ok(
      Math.abs(last.centerX - 0.775) < 0.05,
      `oversized subject should end centered on its box, got centerX=${last.centerX}`
    );
  });
});

describe('confidence-weighted centering (real-media FP mitigation, EXPERIMENTAL)', () => {
  // Haar false positives on non-face content cluster at 0.65-0.83 confidence;
  // confident detections reach 0.9+. Weak detections must pull the crop only
  // weakly from center; confident ones steer fully.
  // Gated behind SMART_REFRAME_WEIGHTED_CENTERING=1 (default off pending
  // held-out validation).
  before(() => { process.env.SMART_REFRAME_WEIGHTED_CENTERING = '1'; });
  after(() => { delete process.env.SMART_REFRAME_WEIGHTED_CENTERING; });
  const mk = (t: number, cx: number, conf: number): ReframeSample => ({
    time: t,
    faces: [
      {
        x: cx - 0.05,
        y: 0.4,
        width: 0.1,
        height: 0.1,
        center_x: cx,
        center_y: 0.45,
        confidence: conf,
        track_id: 't1',
      },
    ],
  });

  it('a 0.70-confidence detection at x=0.2 pulls the crop only weakly', () => {
    const kfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples: [mk(0, 0.2, 0.7), mk(0.5, 0.2, 0.7), mk(1, 0.2, 0.7)],
      dominantTrackId: 't1',
      duration: 1.5,
      aspectRatio: '9:16',
      sourceWidth: 1280,
      sourceHeight: 720,
    });
    const x = kfs[0].centerX;
    // Weight = (0.70-0.68)/0.2 = 0.1 -> 0.5 + (0.2-0.5)*0.1 = 0.47
    assert.ok(Math.abs(x - 0.47) < 0.02, `expected weak pull toward 0.47, got ${x}`);
  });

  it('a 0.95-confidence detection at x=0.2 steers fully', () => {
    const kfs = SmartReframeService.smoothAndGenerateKeyframes({
      samples: [mk(0, 0.2, 0.95), mk(0.5, 0.2, 0.95), mk(1, 0.2, 0.95)],
      dominantTrackId: 't1',
      duration: 1.5,
      aspectRatio: '9:16',
      sourceWidth: 1280,
      sourceHeight: 720,
    });
    const x = kfs[0].centerX;
    // Weight 1 -> full position 0.2, clamped by window half-width 0.158
    assert.ok(x < 0.25, `expected full steering toward 0.2, got ${x}`);
  });
});
