import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ClipAnalysisService,
  RefineWordBoundariesParams,
} from '../services/clipAnalysisService.js';
import { AudioFeatureService } from '../services/multimodal/audioFeatureService.js';
import { TranscriptWord, AudioSilenceInterval } from '../types/index.js';

describe('Phase 1 — Word-Boundary Snapping Unit Tests', () => {
  // Sample reference transcript words
  const sampleWords: TranscriptWord[] = [
    { word: 'Welcome', start: 10.0, end: 10.6 },
    { word: 'to', start: 10.65, end: 10.8 },
    { word: 'the', start: 10.85, end: 11.0 },
    { word: 'AI', start: 11.05, end: 11.4 },
    { word: 'revolution', start: 11.45, end: 12.2 },
    // Silence pause between 12.2 and 15.0
    { word: 'Here', start: 15.0, end: 15.3 },
    { word: 'is', start: 15.35, end: 15.5 },
    { word: 'the', start: 15.55, end: 15.7 },
    { word: 'key', start: 15.75, end: 16.1 },
    { word: 'insight', start: 16.15, end: 16.8 },
    // Speech continuing up to 40s
    { word: 'and', start: 39.5, end: 39.7 },
    { word: 'that', start: 39.75, end: 39.95 },
    { word: 'matters', start: 40.0, end: 40.6 },
  ];

  // ─────────────────────────────────────────────────────────────
  // 1. Boundary falling inside a spoken word (preserving whole word)
  // ─────────────────────────────────────────────────────────────
  it('Start boundary falling inside a word snaps backward to word start (whole word preserved)', () => {
    // Proposed start 10.3 falls strictly inside 'Welcome' (10.0 - 10.6)
    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.3,
      end_seconds: 40.6,
      words: sampleWords,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(result.was_snapped, true);
    assert.equal(result.snapped_start, true);
    assert.equal(result.start_seconds, 10.0);
    assert.equal(result.matched_start_word, 'Welcome');
    assert.ok(result.start_seconds <= 10.0, 'Start must include the beginning of the word');
  });

  it('End boundary falling inside a word snaps forward to word end (whole word preserved)', () => {
    // Proposed end 40.3 falls strictly inside 'matters' (40.0 - 40.6)
    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.0,
      end_seconds: 40.3,
      words: sampleWords,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(result.was_snapped, true);
    assert.equal(result.snapped_end, true);
    assert.equal(result.end_seconds, 40.6);
    assert.equal(result.matched_end_word, 'matters');
    assert.ok(result.end_seconds >= 40.6, 'End must include the complete final word');
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Preserving whole word takes priority over 150 ms threshold
  // ─────────────────────────────────────────────────────────────
  it('Long word crossing boundary: whole word takes priority even if adjustment > 150ms', () => {
    // 'revolution' is 750ms long (11.45 to 12.2). Proposed start is 11.9 (450ms into word).
    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 11.9,
      end_seconds: 40.0,
      words: sampleWords,
      maxAdjustmentMs: 150,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(result.snapped_start, true);
    assert.equal(result.start_seconds, 11.45);
    assert.equal(result.matched_start_word, 'revolution');

    // 'revolution' crossing end boundary at 11.6 (600ms before end of word).
    const endResult = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.0,
      end_seconds: 11.6,
      words: sampleWords,
      maxAdjustmentMs: 150,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(endResult.snapped_end, true);
    assert.equal(endResult.end_seconds, 12.2);
    assert.equal(endResult.matched_end_word, 'revolution');
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Pause gap snapping: 150 ms constraint behavior
  // ─────────────────────────────────────────────────────────────
  it('Nearest word boundary within 150ms in a pause gap snaps cleanly', () => {
    // Silence between 12.2 and 15.0. Proposed start is 14.9 (100ms before 'Here' at 15.0).
    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 14.9,
      end_seconds: 40.0,
      words: sampleWords,
      maxAdjustmentMs: 150,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(result.snapped_start, true);
    assert.equal(result.start_seconds, 15.0);
    assert.equal(result.matched_start_word, 'Here');

    // Preceding word 'revolution' ended at 12.2. Proposed end is 12.28 (80ms after word end).
    const endResult = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.0,
      end_seconds: 12.28,
      words: sampleWords,
      maxAdjustmentMs: 150,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(endResult.snapped_end, true);
    assert.equal(endResult.end_seconds, 12.2);
    assert.equal(endResult.matched_end_word, 'revolution');
  });

  it('Nearest word boundary more than 150ms away in silence is NOT jumped', () => {
    // Silence between 12.2 and 15.0. Proposed start is 13.5 (1.3s before 'Here' and 1.3s after 'revolution').
    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 13.5,
      end_seconds: 35.0,
      words: sampleWords,
      maxAdjustmentMs: 150,
      preRollMs: 0,
      postRollMs: 0,
    });

    // Distance to 15.0 is 1.5s (> 0.15s), distance to 12.2 is 1.3s (> 0.15s)
    assert.equal(result.snapped_start, false);
    assert.equal(result.start_seconds, 13.5);

    // Proposed end is 14.0 (1.8s after 'revolution' at 12.2).
    const endResult = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.0,
      end_seconds: 14.0,
      words: sampleWords,
      maxAdjustmentMs: 150,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(endResult.snapped_end, false);
    assert.equal(endResult.end_seconds, 14.0);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Missing, empty, malformed, and unordered words
  // ─────────────────────────────────────────────────────────────
  it('Handles empty or missing words array gracefully without throwing', () => {
    const emptyResult = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.0,
      end_seconds: 25.0,
      words: [],
    });
    assert.equal(emptyResult.was_snapped, false);
    assert.equal(emptyResult.start_seconds, 10.0);
    assert.equal(emptyResult.end_seconds, 25.0);

    const nullResult = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.0,
      end_seconds: 25.0,
      words: null,
    });
    assert.equal(nullResult.was_snapped, false);
    assert.equal(nullResult.start_seconds, 10.0);

    const undefinedResult = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.0,
      end_seconds: 25.0,
      words: undefined,
    });
    assert.equal(undefinedResult.was_snapped, false);
  });

  it('Handles unordered and malformed word entries safely', () => {
    const chaoticWords: any[] = [
      { word: 'second', start: 20.0, end: 20.5 },
      { word: '', start: 5.0, end: 5.5 }, // empty text
      { word: 'first', start: 10.0, end: 10.5 },
      { word: 'bad-nan', start: NaN, end: 12.0 },
      { word: 'negative', start: -2.0, end: 3.0 },
      { word: 'inverted', start: 30.0, end: 25.0 }, // end < start
    ];

    // Proposed start at 10.2 falls inside 'first' (10.0 to 10.5)
    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.2,
      end_seconds: 25.0,
      words: chaoticWords,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(result.snapped_start, true);
    assert.equal(result.start_seconds, 10.0);
    assert.equal(result.matched_start_word, 'first');
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Boundaries near video boundaries (0.0 and source duration)
  // ─────────────────────────────────────────────────────────────
  it('Clamps start boundary at 0.0 without going negative', () => {
    const nearStartWords: TranscriptWord[] = [
      { word: 'Start', start: 0.02, end: 0.4 },
      { word: 'clip', start: 0.45, end: 0.9 },
    ];

    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 0.1,
      end_seconds: 15.0,
      words: nearStartWords,
      sourceDuration: 60.0,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(result.snapped_start, true);
    assert.equal(result.start_seconds, 0.02);
    assert.ok(result.start_seconds >= 0.0);
  });

  it('Clamps end boundary to sourceDuration without exceeding file length', () => {
    const nearEndWords: TranscriptWord[] = [
      { word: 'penultimate', start: 58.0, end: 59.0 },
      { word: 'goodbye', start: 59.2, end: 60.5 }, // word extends slightly past video duration 60.0
    ];

    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 20.0,
      end_seconds: 59.8, // falls inside 'goodbye'
      words: nearEndWords,
      sourceDuration: 60.0,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(result.snapped_end, true);
    assert.equal(result.end_seconds, 60.0); // clamped to sourceDuration
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Minimum and Maximum Clip Duration Enforcement
  // ─────────────────────────────────────────────────────────────
  it('Aborts snapping if adjustment would violate minimum duration limit', () => {
    // Clip duration is 15.0s (minDurationLimit = 15.0).
    // Snapping end backward by 100ms would make duration 14.9s (< 15.0s).
    const wordsWithEdge: TranscriptWord[] = [
      { word: 'first', start: 10.0, end: 10.5 },
      { word: 'last', start: 24.0, end: 24.9 },
    ];

    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.0,
      end_seconds: 25.0, // duration = 15.0s
      words: wordsWithEdge,
      minDurationLimit: 15.0,
      maxAdjustmentMs: 150,
      preRollMs: 0,
      postRollMs: 0,
    });

    // Should abort end snapping because 24.9 - 10.0 = 14.9s < 15.0s
    assert.equal(result.duration_seconds >= 15.0, true);
    assert.equal(result.end_seconds, 25.0);
  });

  it('Aborts snapping if adjustment would exceed maximum duration limit', () => {
    // Clip duration is 90.0s (maxDurationLimit = 90.0).
    // Start at 10.2 falls inside word (10.0 - 10.5). Snapping to 10.0 would make duration 90.2s (> 90.0s).
    const wordsLong: TranscriptWord[] = [
      { word: 'intro', start: 10.0, end: 10.5 },
      { word: 'outro', start: 100.0, end: 100.2 },
    ];

    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: 10.2,
      end_seconds: 100.2, // duration = 90.0s
      words: wordsLong,
      maxDurationLimit: 90.0,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(result.duration_seconds <= 90.0, true);
    assert.equal(result.start_seconds, 10.2);
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Interaction with Existing Silence Snapping
  // ─────────────────────────────────────────────────────────────
  it('Safely refines boundaries after AudioFeatureService.snapBoundaryToSilence', () => {
    // Simulate silence intervals: pause from 9.5 to 10.0, and 25.0 to 26.0
    const silenceIntervals: AudioSilenceInterval[] = [
      { start: 9.5, end: 10.0, duration: 0.5 },
      { start: 25.0, end: 26.0, duration: 1.0 },
    ];

    const words: TranscriptWord[] = [
      { word: 'Speaking', start: 10.05, end: 10.6 },
      { word: 'content', start: 10.7, end: 11.2 },
      { word: 'finished', start: 24.4, end: 24.95 },
    ];

    // Raw proposal from LLM: start = 9.8 (inside silence), end = 25.3 (inside silence)
    const silenceStart = AudioFeatureService.snapBoundaryToSilence({
      targetSecond: 9.8,
      silenceIntervals,
      type: 'start',
    });
    // Silence snap moves start to 10.0 (silence.end)
    assert.equal(silenceStart.snappedSecond, 10.0);

    const silenceEnd = AudioFeatureService.snapBoundaryToSilence({
      targetSecond: 25.3,
      silenceIntervals,
      type: 'end',
    });
    // Silence snap moves end to 25.0 (silence.start)
    assert.equal(silenceEnd.snappedSecond, 25.0);

    // Now run Phase 1 Word-Boundary Refinement on the silence-snapped boundaries:
    // start is 10.0, first word 'Speaking' starts at 10.05 (50ms away <= 150ms)
    // end is 25.0, last word 'finished' ended at 24.95 (50ms away <= 150ms)
    const wordRefined = ClipAnalysisService.refineWordBoundaries({
      start_seconds: silenceStart.snappedSecond,
      end_seconds: silenceEnd.snappedSecond,
      words,
      maxAdjustmentMs: 150,
      preRollMs: 0,
      postRollMs: 0,
    });

    assert.equal(wordRefined.snapped_start, true);
    assert.equal(wordRefined.start_seconds, 10.05); // Aligned to first word
    assert.equal(wordRefined.matched_start_word, 'Speaking');

    assert.equal(wordRefined.snapped_end, true);
    assert.equal(wordRefined.end_seconds, 24.95); // Aligned to last word
    assert.equal(wordRefined.matched_end_word, 'finished');
  });

  // ─────────────────────────────────────────────────────────────
  // 8. Backward Compatibility: Preserves Exact Output When No Words
  // ─────────────────────────────────────────────────────────────
  it('Preserves exact original bounds when word timestamps are unavailable', () => {
    const rawStart = 14.567;
    const rawEnd = 38.123;

    const result = ClipAnalysisService.refineWordBoundaries({
      start_seconds: rawStart,
      end_seconds: rawEnd,
      words: [],
    });

    assert.equal(result.was_snapped, false);
    assert.equal(result.start_seconds, 14.567);
    assert.equal(result.end_seconds, 38.123);
    assert.equal(result.duration_seconds, 23.556);
  });
});
