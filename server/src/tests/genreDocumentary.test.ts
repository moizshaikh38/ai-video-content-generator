import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { getDirectorClamps } from '../services/directorPlanBuilder.js';

// Phase 9 gap closure (15 Nov 2026): a NASA-style space documentary was
// locally classified 'education_tutorial', which then recommended the
// 'screencast' layout — wrong for cinematic narrated b-roll. A dedicated
// 'documentary' genre (track layout, factual narrative arc) now exists.

const NASA_TRANSCRIPT = [
  'In this documentary we follow the nasa mission control team as astronauts',
  'prepare for the rocket launch. The solar system, our planet, the moon, and',
  'mars have been the focus of space exploration for decades. Scientists',
  'discovered new clues about the universe and the galaxy as the spacecraft',
  'entered orbit.',
].join(' ');

describe('Documentary genre — classification', () => {
  it('1. classifies narrated space-documentary transcripts as documentary, not education_tutorial', () => {
    const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
      wpm: 142,
      ocrDensityPerMin: 0.4, // cinematic b-roll: little on-screen text
      faceCount: 1, // narrator voice-over, occasional interview subject
      sceneCutRatePerMin: 5.5, // cinematic b-roll cut rhythm
      silenceRatio: 0.14,
      transcriptText: NASA_TRANSCRIPT,
      questionDensityPerMin: 0.2,
    });
    assert.strictEqual(suggestion.genre, 'documentary');
    assert.ok(suggestion.confidence > 0.5);
    assert.ok(suggestion.reasons.some((r) => r.includes('keyword')));
  });

  it('2. documentary profile recommends track layout (not screencast)', () => {
    const profile = GenreIntelligenceService.getGenreProfile('documentary');
    assert.strictEqual(profile.displayName, 'Documentary & Factual');
    assert.strictEqual(profile.recommendedLayoutMode, 'track');
    assert.strictEqual(profile.captionSafePlacement, 'bottom');
    assert.ok(profile.naturalLanguageKeywords.includes('documentary'));
  });

  it('3. director clamps cover the documentary genre', () => {
    const clamps = getDirectorClamps('documentary');
    assert.strictEqual(clamps.minDurationSec, 30);
    assert.strictEqual(clamps.maxDurationSec, 90);
  });

  it('4. unknown genres still fall back to general (regression guard)', () => {
    const profile = GenreIntelligenceService.getGenreProfile('not_a_genre');
    assert.strictEqual(profile.genre, 'general');
  });
});
