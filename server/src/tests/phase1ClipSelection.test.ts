import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  snapClipToWordBoundaries,
  calculateAdaptiveClipCount,
  deduplicateCandidatesByOverlap,
} from '../utils/wordSnappingUtils.js';

describe('Phase 1: Intelligent Clip Selection & Boundary Snapping Tests', () => {
  const sampleWords = [
    { word: 'Welcome', start: 1.0, end: 1.4 },
    { word: 'everyone', start: 1.45, end: 1.9 },
    { word: 'to', start: 1.95, end: 2.1 },
    { word: 'our', start: 2.15, end: 2.3 },
    { word: 'podcast.', start: 2.35, end: 2.9 },
    { word: 'Today', start: 3.5, end: 3.8 },
    { word: 'we', start: 3.85, end: 4.0 },
    { word: 'are', start: 4.05, end: 4.2 },
    { word: 'talking', start: 4.25, end: 4.7 },
    { word: 'about', start: 4.75, end: 5.0 },
    { word: 'AI.', start: 5.05, end: 5.4 },
    { word: 'It', start: 6.0, end: 6.2 },
    { word: 'is', start: 6.25, end: 6.4 },
    { word: 'revolutionizing', start: 6.45, end: 7.3 },
    { word: 'video.', start: 7.35, end: 7.9 },
    { word: 'Thanks', start: 18.0, end: 18.4 },
    { word: 'for', start: 18.45, end: 18.6 },
    { word: 'listening!', start: 18.65, end: 19.3 },
  ];

  describe('Word Boundary Snapping (snapClipToWordBoundaries)', () => {
    it('1. snaps start and end boundaries to word boundaries with acoustic silence padding', () => {
      // Raw AI cut proposed at 3.3s to 18.8s
      const snapped = snapClipToWordBoundaries({
        start: 3.3,
        end: 18.8,
        words: sampleWords,
        videoDuration: 30.0,
        config: {
          minDurationSec: 10.0,
          maxDurationSec: 30.0,
          leadSilenceSec: 0.35,
          tailSilenceSec: 0.45,
        },
      });

      assert.strictEqual(snapped.was_snapped, true);
      assert.strictEqual(snapped.matched_start_word, 'Today');
      assert.strictEqual(snapped.matched_end_word, 'listening!');
      // Start is padded before 'Today' (3.5s - lead padding)
      assert.ok(snapped.start_seconds < 3.5);
      assert.ok(snapped.start_seconds >= 2.9, 'Must not cut into previous word');
      // End is padded after 'listening!' (19.3s + tail padding)
      assert.ok(snapped.end_seconds > 19.3);
      assert.ok(snapped.duration_seconds >= 10.0);
    });

    it('2. prefers sentence-ending punctuation when multiple candidates exist near end', () => {
      // Raw cut near 2.7s
      const snapped = snapClipToWordBoundaries({
        start: 0.8,
        end: 2.7,
        words: sampleWords,
        videoDuration: 30.0,
        config: {
          minDurationSec: 1.0,
          maxDurationSec: 10.0,
          preferSentenceEndings: true,
        },
      });

      assert.strictEqual(snapped.matched_end_word, 'podcast.');
    });

    it('3. gracefully falls back when word list is empty or invalid', () => {
      const fallback = snapClipToWordBoundaries({
        start: 5.0,
        end: 25.0,
        words: [],
        videoDuration: 60.0,
      });

      assert.strictEqual(fallback.was_snapped, false);
      assert.strictEqual(fallback.start_seconds, 5.0);
      assert.strictEqual(fallback.end_seconds, 25.0);
      assert.strictEqual(fallback.duration_seconds, 20.0);
    });
  });

  describe('Adaptive Clip Count (calculateAdaptiveClipCount)', () => {
    it('1. enforces empirical 4+ clip floor for long-form podcasts (>10 min)', () => {
      const targets = calculateAdaptiveClipCount(1200, 10); // 20-min video with 10 candidates
      assert.ok(targets.minClips >= 4, 'Must enforce at least 4 clips on 20-min video');
      assert.strictEqual(targets.maxClips, 8);
      assert.ok(targets.reason.includes('empirical 4+ floor'));
    });

    it('2. avoids over-segmenting short sources (<3 min)', () => {
      const targets = calculateAdaptiveClipCount(120, 5); // 2-min video
      assert.strictEqual(targets.minClips, 1);
      assert.strictEqual(targets.maxClips, 3);
      assert.strictEqual(targets.targetClips, 2);
    });

    it('3. respects explicit user-requested count overrides', () => {
      const targets = calculateAdaptiveClipCount(1200, 10, 5);
      assert.strictEqual(targets.targetClips, 5);
      assert.strictEqual(targets.minClips, 5);
      assert.strictEqual(targets.maxClips, 5);
    });
  });

  describe('Candidate Deduplication (deduplicateCandidatesByOverlap)', () => {
    it('1. drops candidates with >=25% overlap while preserving higher-scoring candidate', () => {
      const candidates = [
        { id: 'c1', start_seconds: 10.0, end_seconds: 40.0, engagement_score: 95 }, // 30s dur
        { id: 'c2', start_seconds: 25.0, end_seconds: 50.0, engagement_score: 80 }, // 15s overlap (50% of c2) -> should be dropped
        { id: 'c3', start_seconds: 60.0, end_seconds: 90.0, engagement_score: 88 }, // No overlap -> should be kept
      ];

      const deduped = deduplicateCandidatesByOverlap(candidates, 0.25);
      assert.strictEqual(deduped.length, 2);
      assert.strictEqual(deduped[0].id, 'c1');
      assert.strictEqual(deduped[1].id, 'c3');
    });

    it('2. returns surviving candidates in chronological transcript order', () => {
      const candidates = [
        { id: 'late_high', start_seconds: 100.0, end_seconds: 130.0, engagement_score: 98 },
        { id: 'early_med', start_seconds: 10.0, end_seconds: 40.0, engagement_score: 85 },
      ];

      const deduped = deduplicateCandidatesByOverlap(candidates, 0.25);
      assert.strictEqual(deduped.length, 2);
      assert.strictEqual(deduped[0].id, 'early_med', 'Earlier clip must be first in chronological array');
      assert.strictEqual(deduped[1].id, 'late_high');
    });
  });
});
