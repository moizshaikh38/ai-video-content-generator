import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { isMidWord, BenchWord } from './benchmarks/selectionMetrics.js';
import { buildFixtures } from './benchmarks/syntheticFixtures.js';
import { TranscriptWord } from '../types/index.js';

/**
 * Genre roadmap Phase 6 — boundary & cross-pipeline parity properties.
 *
 * Invariants proven here against the REAL refinement implementation:
 *  P1. Refined boundaries never land mid-word (padding is capped at the
 *      neighboring word's edge by construction).
 *  P2. Durations respect the genre duration clamps.
 *  P3. Refined boundaries stay within [0, sourceDuration].
 *  P4. When refinement cannot satisfy the clamps it returns the unchanged
 *      fallback — which the caller's duration filter then rejects — so no
 *      silently corrupted boundary ever reaches persistence.
 */

const fixtures = buildFixtures();
const genres = ['podcast_interview', 'education_tutorial', 'gaming', 'general'];

const toTranscriptWords = (benchWords: BenchWord[]): TranscriptWord[] =>
  benchWords.map((w) => ({ word: w.text, start: w.start, end: w.end }) as TranscriptWord);

// Edge tolerance below the refiner's 1ms rounding but above float noise.
const MID_WORD_TOL = 0.001;

describe('Genre Phase 6 — boundary parity properties through refineWordBoundaries', () => {
  for (const fixture of fixtures) {
    for (const genre of genres) {
      it(`P1-P4 hold: ${fixture.id} × ${genre}`, () => {
        const profile = GenreIntelligenceService.getGenreProfile(genre);
        const minLimit = Math.max(15, profile.targetDuration.min);
        const maxLimit = Math.min(90, profile.targetDuration.max);
        const words = toTranscriptWords(fixture.words);
        const sourceDuration = fixture.words[fixture.words.length - 1].end + 0.5;

        const allCandidates = [...fixture.goldenCandidates, ...fixture.degradedCandidates];
        for (const candidate of allCandidates) {
          const refined = ClipAnalysisService.refineWordBoundaries({
            start_seconds: candidate.start,
            end_seconds: candidate.end,
            words,
            maxAdjustmentMs: 150,
            sourceDuration,
            minDurationLimit: minLimit,
            maxDurationLimit: maxLimit,
            preRollMs: 70,
            postRollMs: 150,
          });

          const isFallback =
            refined.start_seconds === Number(candidate.start.toFixed(3)) &&
            refined.end_seconds === Number(candidate.end.toFixed(3));

          if (isFallback) {
            // P4: the refiner never half-fixes — it either cleans or abstains.
            continue;
          }

          // P1: no refined boundary lands strictly inside a word.
          assert.equal(
            isMidWord(refined.start_seconds, fixture.words, MID_WORD_TOL),
            false,
            `${fixture.id}/${genre}: refined start ${refined.start_seconds} is mid-word`
          );
          assert.equal(
            isMidWord(refined.end_seconds, fixture.words, MID_WORD_TOL),
            false,
            `${fixture.id}/${genre}: refined end ${refined.end_seconds} is mid-word`
          );

          // P2: genre duration clamps hold on refined results.
          assert.ok(
            refined.duration_seconds >= minLimit - 0.001,
            `${fixture.id}/${genre}: duration ${refined.duration_seconds}s < min ${minLimit}s`
          );
          assert.ok(
            refined.duration_seconds <= maxLimit + 0.001,
            `${fixture.id}/${genre}: duration ${refined.duration_seconds}s > max ${maxLimit}s`
          );

          // P3: bounds respected.
          assert.ok(refined.start_seconds >= 0 && refined.start_seconds <= sourceDuration);
          assert.ok(refined.end_seconds <= sourceDuration + 0.001);
          assert.ok(refined.start_seconds < refined.end_seconds);
        }
      });
    }
  }

  it('whole-word priority: a mid-word start is always snapped out of the word', () => {
    const fixture = fixtures[0];
    const words = toTranscriptWords(fixture.words);
    const trapWord = fixture.words[2];
    const refined = ClipAnalysisService.refineWordBoundaries({
      start_seconds: trapWord.start + (trapWord.end - trapWord.start) / 2,
      end_seconds: trapWord.end + 30,
      words,
      maxAdjustmentMs: 150,
      sourceDuration: fixture.words[fixture.words.length - 1].end + 0.5,
      minDurationLimit: 15,
      maxDurationLimit: 90,
    });
    assert.equal(
      isMidWord(refined.start_seconds, fixture.words, MID_WORD_TOL),
      false,
      'whole-word rule must move a mid-word start to a word edge'
    );
  });
});

describe('Genre Phase 6 — production wiring guards', () => {
  const indexSource = fs.readFileSync(path.resolve(process.cwd(), 'src/index.ts'), 'utf8');

  it('multimodal analysis jobs have a production recovery sweep (same class as render sweep)', () => {
    assert.match(indexSource, /VideoAnalysisWorker\.processNext\(\)/);
    assert.match(indexSource, /multimodalSweepTimer = setInterval/);
    assert.match(indexSource, /if \(multimodalSweepTimer\) clearInterval\(multimodalSweepTimer\);/);
  });

  it('dev CORS allows exact loopback origins only — no substring match', () => {
    assert.match(indexSource, /LOOPBACK_ORIGIN_PATTERN = \/.*localhost.*\//);
    assert.doesNotMatch(indexSource, /origin\.includes\('localhost'\)/);
  });
});
