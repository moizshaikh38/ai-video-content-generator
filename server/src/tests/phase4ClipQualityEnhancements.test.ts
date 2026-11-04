import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CaptionService } from '../services/captionService.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { ClipPromptService } from '../services/clipPromptService.js';
import { TranscriptWord, MultimodalTimeline, TimedCaptionCue } from '../types/index.js';

describe('Phase 4 — Clip Quality & Captioning Enhancements', () => {
  // ─────────────────────────────────────────────────────────────
  // 1. CaptionService: Character-Balanced Line Splitting
  // ─────────────────────────────────────────────────────────────
  describe('Character-Balanced Line Splitting (balanceLineSplit)', () => {
    it('does not split text that fits comfortably within maxCharsPerLine', () => {
      const words = ['Short', 'sentence.'];
      const result = CaptionService.balanceLineSplit(words, 30);
      assert.equal(result, 'Short sentence.');
      assert.ok(!result.includes('\\N'));
    });

    it('splits longer text into balanced two-line captions instead of leaving 1 dangling word', () => {
      // 5 words: "Building AI video apps is hard"
      // Total length: 30 chars. maxCharsPerLine = 20.
      const words = ['Building', 'AI', 'video', 'apps', 'is', 'hard'];
      const result = CaptionService.balanceLineSplit(words, 20);
      assert.ok(result.includes('\\N'), 'Should include line break');
      const [line1, line2] = result.split('\\N');
      assert.ok(line1.length > 5, 'Line 1 should be substantial');
      assert.ok(line2.length > 5, 'Line 2 should not be a single 2-letter word');
      // The difference between line lengths should be small
      const diff = Math.abs(line1.length - line2.length);
      assert.ok(diff <= 10, `Line split should be balanced (diff: ${diff})`);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. CaptionService: Override Word & Token Synchronization
  // ─────────────────────────────────────────────────────────────
  describe('Caption Override Synchronization (applyOverrides)', () => {
    it('preserves exact word and token timestamps when word count is unchanged', () => {
      const originalCue: TimedCaptionCue = {
        id: 'c1',
        start: 1.0,
        end: 2.0,
        text: 'original text here',
        words: [
          { text: 'original', start: 1.0, end: 1.3 },
          { text: 'text', start: 1.35, end: 1.6 },
          { text: 'here', start: 1.65, end: 2.0 },
        ],
        tokens: [
          { text: 'original', start: 1.0, end: 1.3 },
          { text: 'text', start: 1.35, end: 1.6 },
          { text: 'here', start: 1.65, end: 2.0 },
        ],
      };

      const overrides = { 0: 'updated copy now' };
      const [updated] = CaptionService.applyOverrides([originalCue], overrides);

      assert.equal(updated.text, 'updated copy now');
      assert.equal(updated.words?.[0].text, 'updated');
      assert.equal(updated.words?.[0].start, 1.0);
      assert.equal(updated.words?.[0].end, 1.3);
      assert.equal(updated.tokens?.[0].text, 'updated');
      assert.equal(updated.tokens?.[0].start, 1.0);
    });

    it('proportionally redistributes timing when text edit changes word count', () => {
      const originalCue: TimedCaptionCue = {
        id: 'c2',
        start: 2.0,
        end: 4.0,
        text: 'two words',
        words: [
          { text: 'two', start: 2.0, end: 2.8 },
          { text: 'words', start: 3.0, end: 4.0 },
        ],
      };

      // Changed from 2 words to 4 words
      const overrides = { 0: 'now there are four' };
      const [updated] = CaptionService.applyOverrides([originalCue], overrides);

      assert.equal(updated.words?.length, 4);
      assert.equal(updated.tokens?.length, 4);
      assert.equal(updated.words?.[0].start, 2.0);
      assert.equal(updated.words?.[3].end, 4.0);
      // Intermediate words should be monotonically ordered
      for (let i = 0; i < updated.words!.length - 1; i++) {
        assert.ok(updated.words![i].start < updated.words![i].end);
        assert.ok(updated.words![i].end <= updated.words![i + 1].start);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. CaptionService: Impactful Keyword Highlighting
  // ─────────────────────────────────────────────────────────────
  describe('Keyword Highlighting & Stopword Filtering (findImpactfulWordIndex)', () => {
    it('prioritizes tokens with digits, currency, or percentages', () => {
      const words = ['We', 'made', 'over', '$50,000', 'yesterday'];
      const index = CaptionService.findImpactfulWordIndex(words);
      assert.equal(index, 3, 'Should select "$50,000"');
    });

    it('prioritizes longest non-stopword token when no numbers exist', () => {
      const words = ['and', 'this', 'is', 'completely', 'unbelievable'];
      const index = CaptionService.findImpactfulWordIndex(words);
      assert.equal(index, 4, 'Should select "unbelievable" over stopwords and shorter words');
    });

    it('falls back to index 0 on empty or all-stopword cues', () => {
      const words = ['in', 'and', 'out'];
      const index = CaptionService.findImpactfulWordIndex(words);
      assert.equal(index, 0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. CaptionService: Sanitization & Zero-Overlap Clamping
  // ─────────────────────────────────────────────────────────────
  describe('Sanitization & Monotonic Zero-Overlap', () => {
    it('preserves \\N while stripping curly braces in sanitizeAssText', () => {
      const input = 'First Line\\NSecond Line {\\b1}attack{\\b0}';
      const sanitized = CaptionService.sanitizeAssText(input);
      assert.ok(sanitized.includes('\\N'), 'Must preserve ASS line break \\N');
      assert.ok(!sanitized.includes('{'), 'Must strip opening curly brace');
      assert.ok(!sanitized.includes('}'), 'Must strip closing curly brace');
    });

    it('enforces zero overlap across multi-word cues clamping end timestamps', () => {
      const overlappingCues: TimedCaptionCue[] = [
        {
          id: 'cue-1',
          start: 1.0,
          end: 3.5, // Overlaps with next cue
          text: 'cue one text',
          words: [
            { text: 'cue', start: 1.0, end: 1.5 },
            { text: 'one', start: 1.6, end: 2.5 },
            { text: 'text', start: 2.6, end: 3.5 },
          ],
        },
        {
          id: 'cue-2',
          start: 3.0,
          end: 5.0,
          text: 'cue two text',
          words: [
            { text: 'cue', start: 3.0, end: 3.5 },
            { text: 'two', start: 3.6, end: 4.2 },
            { text: 'text', start: 4.3, end: 5.0 },
          ],
        },
      ];

      const clamped = CaptionService.enforceZeroOverlap(overlappingCues);
      assert.ok(clamped[0].end <= clamped[1].start, 'Cue 1 end must be <= Cue 2 start');
      assert.equal(clamped[0].end, 3.0);
      // Words in cue 1 must not exceed 3.0
      for (const w of clamped[0].words!) {
        assert.ok(w.end <= 3.0, `Word end ${w.end} should not exceed clamped cue end 3.0`);
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. ClipAnalysisService: Acoustic Pre-Roll & Post-Roll Padding
  // ─────────────────────────────────────────────────────────────
  describe('Acoustic Edge Smoothing (Pre-Roll & Post-Roll Padding)', () => {
    const speechWords: TranscriptWord[] = [
      { word: 'Before', start: 5.0, end: 5.8 },
      // 200ms pause (5.8 to 6.0)
      { word: 'Action', start: 6.0, end: 6.6 },
      { word: 'Packed', start: 6.65, end: 7.2 },
      { word: 'Story', start: 7.25, end: 8.0 },
      // 500ms pause (8.0 to 8.5)
      { word: 'After', start: 8.5, end: 9.0 },
    ];

    it('adds 70ms pre-roll to start without crossing previous word end', () => {
      // Start is inside 'Action' (6.0 - 6.6)
      const result = ClipAnalysisService.refineWordBoundaries({
        start_seconds: 6.2,
        end_seconds: 7.8,
        words: speechWords,
        preRollMs: 70,
        postRollMs: 0,
      });

      // 'Action' starts at 6.0. 70ms pre-roll gives 6.0 - 0.07 = 5.93.
      // Previous word 'Before' ends at 5.8, so 5.93 > 5.8 is completely safe.
      assert.equal(result.snapped_start, true);
      assert.equal(result.start_seconds, 5.93);
    });

    it('clamps pre-roll so it does not collide into previous word', () => {
      const tightWords: TranscriptWord[] = [
        { word: 'Word1', start: 1.0, end: 1.98 },
        // Only 20ms pause between Word1 and Word2!
        { word: 'Word2', start: 2.0, end: 3.0 },
      ];

      const result = ClipAnalysisService.refineWordBoundaries({
        start_seconds: 2.1,
        end_seconds: 3.0,
        words: tightWords,
        preRollMs: 70, // 70ms would be 1.93, which collides with Word1 (end 1.98)
        postRollMs: 0,
      });

      // Must clamp to Word1's end (1.98)
      assert.equal(result.start_seconds, 1.98);
    });

    it('adds 150ms post-roll to end without crossing next word start', () => {
      // End is inside 'Story' (7.25 - 8.0)
      const result = ClipAnalysisService.refineWordBoundaries({
        start_seconds: 6.0,
        end_seconds: 7.8,
        words: speechWords,
        preRollMs: 0,
        postRollMs: 150,
      });

      // 'Story' ends at 8.0. 150ms post-roll gives 8.0 + 0.15 = 8.15.
      // Next word 'After' starts at 8.5, so 8.15 < 8.5 is safe.
      assert.equal(result.snapped_end, true);
      assert.equal(result.end_seconds, 8.15);
    });

    it('clamps post-roll so it does not collide into next word or video end', () => {
      const tightWords: TranscriptWord[] = [
        { word: 'LastWord', start: 10.0, end: 10.5 },
        // Only 50ms pause before next word
        { word: 'NextWord', start: 10.55, end: 11.0 },
      ];

      const result = ClipAnalysisService.refineWordBoundaries({
        start_seconds: 9.0,
        end_seconds: 10.4,
        words: tightWords,
        preRollMs: 0,
        postRollMs: 150, // 150ms would be 10.65, colliding with NextWord (start 10.55)
      });

      // Must clamp to NextWord's start (10.55)
      assert.equal(result.end_seconds, 10.55);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 6. Sentence-Terminal Lookahead Refinement
  // ─────────────────────────────────────────────────────────────
  describe('Sentence-Terminal Punctuation Lookahead', () => {
    const conversationalWords: TranscriptWord[] = [
      { word: 'This', start: 1.0, end: 1.3 },
      { word: 'is', start: 1.35, end: 1.5 },
      { word: 'the', start: 1.55, end: 1.7 },
      { word: 'secret', start: 1.75, end: 2.1 }, // Proposed end lands here without punctuation
      { word: 'weapon.', start: 2.2, end: 2.8 }, // Sentence terminator within +0.7s
      { word: 'Next', start: 3.5, end: 3.8 },
    ];

    it('looks ahead up to +1.5s to snap to sentence-terminal punctuation', () => {
      const result = ClipAnalysisService.refineWordBoundaries({
        start_seconds: 1.0,
        end_seconds: 2.0, // lands on 'secret' without punctuation
        words: conversationalWords,
        preRollMs: 0,
        postRollMs: 0,
        maxDurationLimit: 30.0,
      });

      assert.equal(result.matched_end_word, 'weapon.');
      assert.equal(result.end_seconds, 2.8);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 7. Minor Duration Overflow Recovery
  // ─────────────────────────────────────────────────────────────
  describe('Minor Duration Overflow Recovery', () => {
    it('steps back end boundary by word instead of discarding word snaps on minor overflow', () => {
      const words: TranscriptWord[] = [
        { word: 'Start', start: 10.0, end: 10.5 },
        { word: 'Middle', start: 50.0, end: 50.5 },
        { word: 'WordA', start: 68.0, end: 69.2 },
        { word: 'WordB', start: 69.5, end: 70.8 }, // 70.8 - 10.0 = 60.8s (> 60.0s max limit)
      ];

      const result = ClipAnalysisService.refineWordBoundaries({
        start_seconds: 10.0,
        end_seconds: 70.5, // Inside WordB
        words,
        maxDurationLimit: 60.0,
        minDurationLimit: 15.0,
        preRollMs: 0,
        postRollMs: 0,
      });

      // WordB overflowed (60.8s > 60.0s). It should step back to WordA (69.2s - 10.0s = 59.2s <= 60.0s)
      assert.equal(result.snapped_end, true);
      assert.equal(result.matched_end_word, 'WordA');
      assert.ok(result.duration_seconds <= 60.0);
      assert.ok(result.duration_seconds >= 15.0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 8. ClipPromptService: Inline Annotations & Chunking Offset
  // ─────────────────────────────────────────────────────────────
  describe('Prompt Generation & Multimodal Annotations', () => {
    it('enriches indexed transcript with inline [SCENE_CUT], [HIGH_ACTIVITY], and [OCR]', () => {
      const segments = [
        { id: 0, start: 1.0, end: 5.0, text: 'Look at this dashboard.' },
      ];

      const timeline: any = {
        project_id: 'test',
        duration_seconds: 10,
        scene_cuts: [{ timestamp: 2.5, score: 0.9 }],
        keyframes: [
          {
            timestamp: 3.0,
            frame_path: '/tmp/kf1.jpg',
            visual_activity_score: 85,
            ocr_text: 'REVENUE GROWTH',
          },
        ],
        silence_intervals: [],
        speech_intervals: [],
        audio_energy: [],
        pitch_contour: [],
        processed_at: new Date().toISOString(),
      };

      const formatted = ClipPromptService.formatIndexedTranscript(segments, timeline);
      assert.ok(formatted.includes('[SCENE_CUT]'), 'Must include scene cut tag');
      assert.ok(formatted.includes('[HIGH_ACTIVITY]'), 'Must include high visual activity tag');
      assert.ok(formatted.includes('[OCR: "REVENUE GROWTH"]'), 'Must include OCR text');
    });

    it('respects startIndexOffset for chunked sliding windows', () => {
      const segments = [
        { id: 0, start: 100.0, end: 105.0, text: 'Deep conversation continues.' },
      ];

      const formatted = ClipPromptService.formatIndexedTranscript(segments, null, 42);
      assert.ok(formatted.startsWith('[42]'), 'Must render global segment index 42');
    });
  });
});
