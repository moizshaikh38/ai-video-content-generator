import { describe, it } from 'node:test';
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
