import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { CaptionService } from '../services/captionService.js';
import {
  TimedCaptionCue,
  TimedCaptionToken,
  CaptionStyle,
  CaptionConfig,
} from '../types/index.js';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
}

describe('Phase 2 — Kinetic Word-Pop Captions Unit & Integration Tests', () => {
  // ── 1. ACTIVE-WORD TIMING WITH REAL WORD TIMESTAMPS ────────────
  describe('Active-Word Timing Resolution', () => {
    it('times active word using real word timestamps instead of uniform distribution', () => {
      const cue: TimedCaptionCue = {
        id: 'cue-1',
        start: 0.0,
        end: 2.5,
        text: 'LOOK AT THE AERIAL GOAL',
        words: [
          { text: 'LOOK', start: 0.2, end: 0.5 },     // 0.3s duration
          { text: 'AT', start: 0.5, end: 0.7 },       // 0.2s duration
          { text: 'THE', start: 0.7, end: 0.9 },      // 0.2s duration
          { text: 'AERIAL', start: 0.9, end: 1.6 },   // 0.7s duration (much longer)
          { text: 'GOAL', start: 1.6, end: 2.2 },     // 0.6s duration
        ],
      };

      const events = CaptionService.buildKineticCueEvents(cue, {
        primaryColour: '&H00FFFFFF&',
        secondaryColour: '&H00356BFF&',
        animation: 'word_pop',
        activeWordScale: 1.12,
      });

      assert.ok(events.length >= 5, `Expected at least 5 dialogue events, got ${events.length}`);

      // Parse start and end timestamps from dialogue events
      const parsed = events.map((line) => {
        const parts = line.split(',');
        return {
          start: parts[1],
          end: parts[2],
          text: parts.slice(9).join(','),
        };
      });

      // Event 0: initial silence before first word (0.00 -> 0.20)
      assert.strictEqual(parsed[0].start, '0:00:00.00');
      assert.strictEqual(parsed[0].end, '0:00:00.20');
      assert.ok(!parsed[0].text.includes('\\fscx112'), 'Pre-silence slice must have no pop scale');

      // Event 1: "LOOK" active (starts at 0.20s)
      assert.strictEqual(parsed[1].start, '0:00:00.20');
      assert.ok(parsed[1].text.includes('\\fscx112') && parsed[1].text.includes('LOOK'), 'LOOK must be active');

      // Event 4: "AERIAL" active (starts at 0.90s, duration 0.7s)
      const aerialEvent = parsed.find((p) => p.start === '0:00:00.90');
      assert.ok(aerialEvent, 'Expected dialogue event starting at 0:00:00.90 for AERIAL');
      assert.ok(aerialEvent?.text.includes('AERIAL'), 'AERIAL must be highlighted in this slice');

      // Verify no overlap across dialogue lines
      const validation = CaptionService.validateNoOverlappingDialogueLines(events);
      assert.strictEqual(validation.valid, true, `Overlaps detected: ${validation.overlaps.join('\n')}`);
    });
  });

  // ── 2. PUNCTUATION & ASS OVERRIDE INJECTION ESCAPING ────────────
  describe('Punctuation & Adversarial Input Escaping', () => {
    it('handles punctuation attached to words without breaking ASS formatting', () => {
      const cue: TimedCaptionCue = {
        id: 'cue-punc',
        start: 0.0,
        end: 2.0,
        text: "Wait, don't go!",
        words: [
          { text: 'Wait,', start: 0.0, end: 0.6 },
          { text: "don't", start: 0.6, end: 1.2 },
          { text: 'go!', start: 1.2, end: 1.8 },
        ],
      };

      const events = CaptionService.buildKineticCueEvents(cue, {
        primaryColour: '&H00FFFFFF&',
        secondaryColour: '&H00FF6B35&',
      });

      assert.strictEqual(events.length, 3);
      assert.ok(events[0].includes('Wait,'), 'Punctuation must be preserved on first word');
      assert.ok(events[1].includes("don't"), 'Apostrophe must be preserved on second word');
      assert.ok(events[2].includes('go!'), 'Exclamation mark must be preserved on third word');

      // Every line must have balanced curly braces (ASS overrides)
      for (const line of events) {
        const opens = (line.match(/{/g) || []).length;
        const closes = (line.match(/}/g) || []).length;
        assert.strictEqual(opens, closes, `Unmatched override braces in line: ${line}`);
      }
    });

    it('strips malicious curly braces and backslashes to prevent ASS command injection', () => {
      const cue: TimedCaptionCue = {
        id: 'cue-malicious',
        start: 0.0,
        end: 1.5,
        text: 'Clean text',
        words: [
          { text: '{b1}Exploit{\\b0}', start: 0.0, end: 0.7 },
          { text: 'Normal\\Tag', start: 0.7, end: 1.4 },
        ],
      };

      const events = CaptionService.buildKineticCueEvents(cue, {
        primaryColour: '&H00FFFFFF&',
        secondaryColour: '&H00FF6B35&',
      });

      // The text inside the line should not have unescaped command injection
      for (const line of events) {
        const textPart = line.split(',').slice(9).join(',');
        // Extract override blocks {...}
        const overrideBlocks = textPart.match(/{[^}]+}/g) || [];
        for (const block of overrideBlocks) {
          // All override blocks must strictly be our generated tags (\c, \fscx, \fscy, \t)
          assert.ok(
            block.startsWith('{\\') || block.startsWith('{\\c'),
            `Unexpected override block structure: ${block}`
          );
          assert.ok(!block.includes('Exploit'), 'Malicious token must not inject into ASS override block');
        }
      }
    });
  });

  // ── 3. MISSING, EMPTY, UNORDERED, AND INVALID WORD TIMESTAMPS ──
  describe('Safe Handling of Missing, Unordered, & Invalid Timestamps', () => {
    it('falls back gracefully on empty words array', () => {
      const cue: TimedCaptionCue = {
        id: 'cue-empty',
        start: 1.0,
        end: 3.0,
        text: 'EMPTY WORDS FALLBACK',
        words: [],
      };

      const events = CaptionService.buildKineticCueEvents(cue, {
        primaryColour: '&H00FFFFFF&',
        secondaryColour: '&H00FF6B35&',
      });

      assert.strictEqual(events.length, 0, 'Should return empty array so caller falls back to cue-level event');

      const ass = CaptionService.buildAssScript([cue], {
        kinetic: true,
        timingMode: 'word',
      });

      assert.ok(ass.includes('EMPTY WORDS FALLBACK'), 'ASS must contain cue text even if words array is empty');
      assert.ok(ass.includes('Dialogue: 0,0:00:01.00,0:00:03.00,Default'), 'Must render standard cue dialogue');
    });

    it('safely sorts unordered words and filters inverted or NaN timestamps', () => {
      const cue: TimedCaptionCue = {
        id: 'cue-unordered',
        start: 0.0,
        end: 3.0,
        text: 'WORD ONE WORD TWO WORD THREE',
        words: [
          { text: 'WORD TWO', start: 1.0, end: 1.8 },
          { text: 'INVERTED', start: 2.0, end: 1.5 },       // end < start (invalid)
          { text: 'NAN WORD', start: NaN, end: 2.2 },        // NaN (invalid)
          { text: 'WORD ONE', start: 0.2, end: 0.8 },        // earlier than word two
          { text: 'WORD THREE', start: 2.0, end: 2.7 },
        ],
      };

      const events = CaptionService.buildKineticCueEvents(cue, {
        primaryColour: '&H00FFFFFF&',
        secondaryColour: '&H00FF6B35&',
      });

      assert.ok(events.length >= 3, 'Must process valid words');
      // Verify chronological order: WORD ONE comes before WORD TWO, and WORD THREE comes last
      const order = events.map((l) => l.split(',')[1]);
      for (let i = 0; i < order.length - 1; i++) {
        assert.ok(order[i] <= order[i + 1], `Timestamp ${order[i]} should precede ${order[i + 1]}`);
      }

      // Inverted and NaN words must be excluded
      for (const line of events) {
        assert.ok(!line.includes('INVERTED'), 'Inverted timestamp word must not appear');
        assert.ok(!line.includes('NAN WORD'), 'NaN timestamp word must not appear');
      }
    });
  });

  // ── 4. SEGMENT-LEVEL TIMING FALLBACK ───────────────────────────
  describe('Segment-Level Timing Mode', () => {
    it('bypasses kinetic word-level rendering when timingMode is segment', () => {
      const cue: TimedCaptionCue = {
        id: 'cue-seg',
        start: 1.5,
        end: 4.5,
        text: 'SEGMENT ONLY CAPTION CUE',
      };

      const ass = CaptionService.buildAssScript([cue], {
        kinetic: true,
        timingMode: 'segment',
      });

      // Must produce single dialogue event spanning entire segment
      const dialogueLines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
      assert.strictEqual(dialogueLines.length, 1);
      assert.ok(dialogueLines[0].includes('0:00:01.50,0:00:04.50'));
      assert.ok(dialogueLines[0].includes('SEGMENT ONLY CAPTION CUE'));
      assert.ok(!dialogueLines[0].includes('\\fscx112'), 'Must not have word-pop tags in segment mode');
    });
  });

  // ── 5. STRICT NON-OVERLAPPING & MONOTONIC CUE TIMING ───────────
  describe('Zero-Overlap & Monotonic Timing', () => {
    it('produces strictly non-overlapping and contiguous dialogue events', () => {
      const cue: TimedCaptionCue = {
        id: 'cue-overlap-check',
        start: 0.0,
        end: 3.0,
        text: 'FAST PACED CONVERSATION HERE TODAY',
        words: [
          { text: 'FAST', start: 0.1, end: 0.4 },
          { text: 'PACED', start: 0.4, end: 0.8 },
          { text: 'CONVERSATION', start: 0.8, end: 1.7 },
          { text: 'HERE', start: 1.7, end: 2.1 },
          { text: 'TODAY', start: 2.1, end: 2.8 },
        ],
      };

      const events = CaptionService.buildKineticCueEvents(cue, {
        primaryColour: '&H00FFFFFF&',
        secondaryColour: '&H00356BFF&',
      });

      const validation = CaptionService.validateNoOverlappingDialogueLines(events, 0);
      assert.strictEqual(validation.valid, true, `Detected overlap: ${validation.overlaps.join('\n')}`);

      // Verify that every line's end equals the next line's start
      for (let i = 0; i < events.length - 1; i++) {
        const curEnd = events[i].split(',')[2];
        const nextStart = events[i + 1].split(',')[1];
        assert.strictEqual(
          curEnd,
          nextStart,
          `Event ${i} end (${curEnd}) must equal Event ${i + 1} start (${nextStart})`
        );
      }
    });
  });

  // ── 6. BACKWARD COMPATIBILITY OF SIX EXISTING CAPTION STYLES ────
  describe('Backward Compatibility with Existing Styles', () => {
    const testCues: TimedCaptionCue[] = [
      {
        id: 'cue-legacy',
        start: 1.0,
        end: 2.5,
        text: 'HELLO BEAUTIFUL WORLD',
        words: [
          { text: 'HELLO', start: 1.0, end: 1.4 },
          { text: 'BEAUTIFUL', start: 1.4, end: 1.9 },
          { text: 'WORLD', start: 1.9, end: 2.5 },
        ],
      },
    ];

    const styles: CaptionStyle[] = ['clean', 'bold', 'minimal', 'podcast', 'highlight', 'karaoke'];

    for (const style of styles) {
      it(`preserves legacy output for "${style}" style when kinetic mode is not requested`, () => {
        const ass = CaptionService.buildAssScript(testCues, {
          style,
          timingMode: 'word',
          kinetic: false,
          customConfig: { animation: 'none' },
        });

        const dialogueLines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
        assert.strictEqual(
          dialogueLines.length,
          1,
          `Style "${style}" without kinetic mode must emit exactly 1 dialogue line`
        );

        if (style === 'karaoke') {
          assert.ok(dialogueLines[0].includes('{\\k'), 'Karaoke style must retain \\k tags');
        } else if (style === 'podcast') {
          assert.ok(dialogueLines[0].includes('&H000B9EF5&'), 'Podcast style must highlight first word in amber');
        } else if (style === 'highlight') {
          assert.ok(dialogueLines[0].includes('&H0081B910&'), 'Highlight style must highlight first word in emerald');
        }
      });
    }
  });

  // ── 7. OPT-IN BEHAVIOR & CONFIGURATION ENABLING ────────────────
  describe('Opt-In Configuration Behavior', () => {
    const cue: TimedCaptionCue = {
      id: 'cue-optin',
      start: 0.0,
      end: 2.0,
      text: 'TESTING OPT IN CAPTIONS',
      words: [
        { text: 'TESTING', start: 0.0, end: 0.6 },
        { text: 'OPT', start: 0.6, end: 1.1 },
        { text: 'IN', start: 1.1, end: 1.4 },
        { text: 'CAPTIONS', start: 1.4, end: 2.0 },
      ],
    };

    it('enables kinetic captions when animation is "word_pop"', () => {
      const ass = CaptionService.buildAssScript([cue], {
        timingMode: 'word',
        customConfig: { animation: 'word_pop' },
      });

      const dialogueLines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
      assert.ok(dialogueLines.length >= 4, 'Expected multiple word dialogue events for word_pop');
      assert.ok(dialogueLines[0].includes('\\fscx112'), 'Expected pop scale tag \\fscx112');
    });

    it('enables kinetic captions when kinetic: true is explicitly passed', () => {
      const ass = CaptionService.buildAssScript([cue], {
        timingMode: 'word',
        kinetic: true,
      });

      const dialogueLines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
      assert.ok(dialogueLines.length >= 4, 'Expected multiple word dialogue events for kinetic: true');
    });

    it('enables kinetic captions when customConfig.kinetic is true', () => {
      const ass = CaptionService.buildAssScript([cue], {
        timingMode: 'word',
        customConfig: { kinetic: true },
      });

      const dialogueLines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
      assert.ok(dialogueLines.length >= 4, 'Expected multiple word dialogue events for customConfig.kinetic: true');
    });

    it('does NOT enable kinetic mode by default when not configured', () => {
      const ass = CaptionService.buildAssScript([cue], {
        timingMode: 'word',
      });

      const dialogueLines = ass.split('\n').filter((l) => l.startsWith('Dialogue:'));
      assert.strictEqual(dialogueLines.length, 1, 'Default mode must produce exactly 1 dialogue event');
    });
  });

  // ── 8. MULTI-LINE BREAK (\N) PRESERVATION ──────────────────────
  describe('Multi-Line Break Preservation', () => {
    it('maintains \\N at the exact word split across all kinetic events', () => {
      const cue: TimedCaptionCue = {
        id: 'cue-multiline',
        start: 0.0,
        end: 1.6,
        text: 'LOOK AT\\nTHE SHOT'.replace('\\n', '\\N'),
        words: [
          { text: 'LOOK', start: 0.0, end: 0.4 },
          { text: 'AT', start: 0.4, end: 0.8 },
          { text: 'THE', start: 0.8, end: 1.2 },
          { text: 'SHOT', start: 1.2, end: 1.6 },
        ],
      };

      const events = CaptionService.buildKineticCueEvents(cue, {
        primaryColour: '&H00FFFFFF&',
        secondaryColour: '&H00356BFF&',
      });

      assert.strictEqual(events.length, 4);
      for (const eventLine of events) {
        assert.ok(
          eventLine.includes('\\N'),
          `Dialogue line missing line break \\N: ${eventLine}`
        );
      }
    });
  });

  // ── 9. REAL FFMPEG RENDER SMOKE TEST ───────────────────────────
  describe('FFmpeg Kinetic Subtitles Render Smoke Test', () => {
    const tmpDir = path.join(os.tmpdir(), `vireo-p2-kinetic-${Date.now()}`);
    const sourceVideoPath = path.join(tmpDir, 'source.mp4');
    const assSubtitlePath = path.join(tmpDir, 'kinetic_subs.ass');
    const outputVideoPath = path.join(tmpDir, 'output_kinetic.mp4');

    it('burns kinetic word-pop captions into 9:16 video using FFmpeg and verifies success', async () => {
      fs.mkdirSync(tmpDir, { recursive: true });

      // 1. Generate 2-second synthetic 9:16 vertical video
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input('color=c=navy:s=720x1280:r=25:d=2.0')
          .inputFormat('lavfi')
          .input('anullsrc=r=44100:cl=stereo')
          .inputFormat('lavfi')
          .outputOptions(['-t 2.0', '-pix_fmt yuv420p', '-c:v libx264', '-c:a aac', '-preset ultrafast'])
          .output(sourceVideoPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      assert.ok(fs.existsSync(sourceVideoPath), 'Source synthetic video was not generated');

      // 2. Generate kinetic ASS subtitle file
      const cues: TimedCaptionCue[] = [
        {
          id: 'cue-smoke',
          start: 0.2,
          end: 1.8,
          text: 'DYNAMIC KINETIC SUBTITLES',
          words: [
            { text: 'DYNAMIC', start: 0.2, end: 0.7 },
            { text: 'KINETIC', start: 0.7, end: 1.2 },
            { text: 'SUBTITLES', start: 1.2, end: 1.8 },
          ],
        },
      ];

      const assContent = CaptionService.buildAssScript(cues, {
        style: 'bold',
        aspectRatio: '9:16',
        timingMode: 'word',
        kinetic: true,
        customConfig: {
          animation: 'word_pop',
          activeWordColor: '#FF6B35',
          textColor: '#FFFFFF',
          strokeColor: '#000000',
          strokeWidth: 4,
          positionY: 0.75,
        },
      });

      fs.writeFileSync(assSubtitlePath, assContent, 'utf8');
      assert.ok(fs.existsSync(assSubtitlePath), 'Kinetic ASS file was written');

      // 3. Burn into video via FFmpeg libass filter
      const safeAss = assSubtitlePath.replace(/\\/g, '/').replace(':', '\\\\:');
      await new Promise<void>((resolve, reject) => {
        ffmpeg(sourceVideoPath)
          .videoFilters([`ass=${safeAss}`])
          .outputOptions(['-pix_fmt yuv420p', '-c:v libx264', '-c:a copy', '-preset ultrafast'])
          .output(outputVideoPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run();
      });

      assert.ok(fs.existsSync(outputVideoPath), 'Output captioned video file was not generated');
      const stats = fs.statSync(outputVideoPath);
      assert.ok(stats.size > 15000, `Rendered video too small: ${stats.size} bytes`);

      // Cleanup
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    });
  });
});
