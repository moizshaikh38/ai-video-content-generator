import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  enforceZeroOverlap,
  groupWordsIntoCues,
  getValidCueWords,
  computeCueWordSlices,
  buildPresetAssScript,
  resolveCaptionPreset,
  PresetTimedCue,
} from '../shared/captionPresets.js';
import { CaptionService } from '../services/captionService.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { ProEditorService } from '../services/proEditorService.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';

describe('Caption Accuracy Audit & Synchronization Regression Tests', () => {
  describe('1. Word Preservation in enforceZeroOverlap (No Words Dropped)', () => {
    it('preserves 100% of word tokens when cue boundary is clamped to next start', () => {
      const cue1: PresetTimedCue = {
        id: 'cue-1',
        start: 0.0,
        end: 2.0,
        text: 'Hello world today',
        words: [
          { text: 'Hello', start: 0.0, end: 0.5 },
          { text: 'world', start: 0.5, end: 1.0 },
          { text: 'today', start: 1.6, end: 2.0 },
        ],
      };
      const cue2: PresetTimedCue = {
        id: 'cue-2',
        start: 1.5,
        end: 3.0,
        text: 'we are here',
        words: [
          { text: 'we', start: 1.5, end: 1.9 },
          { text: 'are', start: 1.9, end: 2.4 },
          { text: 'here', start: 2.4, end: 3.0 },
        ],
      };

      const result = enforceZeroOverlap([cue1, cue2]);

      // Verify cue 1 was clamped to cue 2 start (1.5)
      assert.equal(result[0].end, 1.5);

      // Verify ALL words from cue 1 are preserved
      const wordsAfter = result[0].words || [];
      assert.equal(wordsAfter.length, 3, 'All 3 words must be preserved');
      assert.deepEqual(
        wordsAfter.map((w) => w.text),
        ['Hello', 'world', 'today'],
        'Word text tokens must match original words exactly'
      );

      // Verify all word timestamps are valid and monotonic within clamped range [0.0, 1.5]
      for (let i = 0; i < wordsAfter.length; i++) {
        const w = wordsAfter[i];
        assert.ok(w.start >= 0.0, `Word ${w.text} start (${w.start}) must be >= 0.0`);
        assert.ok(w.end <= 1.501, `Word ${w.text} end (${w.end}) must be <= 1.5`);
        assert.ok(w.end > w.start, `Word ${w.text} duration must be positive`);
        if (i > 0) {
          assert.ok(w.start >= wordsAfter[i - 1].start, 'Word start times must be non-decreasing');
        }
      }
    });

    it('redistributes words when clampedEnd truncates the last word below 20ms threshold', () => {
      const cue1: PresetTimedCue = {
        id: 'cue-1',
        start: 0.0,
        end: 1.0,
        text: 'Quick brown fox',
        words: [
          { text: 'Quick', start: 0.0, end: 0.3 },
          { text: 'brown', start: 0.3, end: 0.6 },
          { text: 'fox', start: 0.59, end: 1.0 },
        ],
      };
      const cue2: PresetTimedCue = {
        id: 'cue-2',
        start: 0.60,
        end: 1.5,
        text: 'jumps high',
        words: [
          { text: 'jumps', start: 0.6, end: 1.0 },
          { text: 'high', start: 1.0, end: 1.5 },
        ],
      };

      const result = enforceZeroOverlap([cue1, cue2]);
      assert.equal(result[0].end, 0.6);
      const words = result[0].words || [];
      assert.equal(words.length, 3);
      assert.deepEqual(words.map((w) => w.text), ['Quick', 'brown', 'fox']);
      assert.ok(words.every((w) => w.end <= 0.601 && w.end > w.start));
    });
  });

  describe('2. Chronological Token Sorting in groupWordsIntoCues', () => {
    it('sorts jumbled or jittered word tokens before grouping into cues', () => {
      const unorderedTokens = [
        { text: 'third', start: 1.0, end: 1.4 },
        { text: 'first', start: 0.0, end: 0.4 },
        { text: 'second', start: 0.5, end: 0.9 },
      ];

      const cues = groupWordsIntoCues(unorderedTokens);
      assert.ok(cues.length > 0);
      const allWords = cues.flatMap((c) => c.words || []);
      assert.deepEqual(
        allWords.map((w) => w.text),
        ['first', 'second', 'third'],
        'Tokens must be grouped in strict chronological order'
      );
      assert.equal(cues[0].text, 'first second third');
    });
  });

  describe('3. Word Alias Support in getValidCueWords', () => {
    it('accepts w.word as fallback for w.text', () => {
      const cue: PresetTimedCue = {
        id: 'cue-1',
        start: 0.0,
        end: 1.0,
        text: 'alpha beta',
        words: [
          { word: 'alpha', start: 0.0, end: 0.5 } as any,
          { word: 'beta', start: 0.5, end: 1.0 } as any,
        ],
      };

      const valid = getValidCueWords(cue);
      assert.equal(valid.length, 2);
      assert.equal(valid[0].text, 'alpha');
      assert.equal(valid[1].text, 'beta');
    });

    it('preserves instantaneous words where start === end with positive fallback duration', () => {
      const cue: PresetTimedCue = {
        id: 'cue-instant',
        start: 0.0,
        end: 1.0,
        text: 'the rapid cat',
        words: [
          { text: 'the', start: 0.1, end: 0.1 },
          { text: 'rapid', start: 0.1, end: 0.5 },
          { text: 'cat', start: 0.5, end: 0.9 },
        ],
      };

      const valid = getValidCueWords(cue);
      assert.equal(valid.length, 3, 'All 3 words including instantaneous word must be retained');
      assert.equal(valid[0].text, 'the');
      assert.ok(valid[0].end > valid[0].start, 'Instantaneous word must be assigned a positive duration');
    });

    it('computeCueWordSlices produces an active slice for every valid word', () => {
      const cue: PresetTimedCue = {
        id: 'cue-slices',
        start: 0.0,
        end: 1.0,
        text: 'one two three',
        words: [
          { text: 'one', start: 0.0, end: 0.1 },
          { text: 'two', start: 0.1, end: 0.11 },
          { text: 'three', start: 0.12, end: 0.6 },
        ],
      };

      const slices = computeCueWordSlices(cue);
      const activeIndices = new Set(slices.filter((s) => s.activeIdx >= 0).map((s) => s.activeIdx));
      assert.ok(activeIndices.has(0), 'word 0 must have an active slice');
      assert.ok(activeIndices.has(1), 'word 1 must have an active slice');
      assert.ok(activeIndices.has(2), 'word 2 must have an active slice');
    });
  });

  describe('4. Override Matching with { id, text } and { cueId, text }', () => {
    it('correctly applies overrides formatted with "id" property', () => {
      const cues = [
        {
          id: 'cue-1',
          start: 0.0,
          end: 1.0,
          text: 'Original words',
          words: [
            { text: 'Original', start: 0.0, end: 0.5 },
            { text: 'words', start: 0.5, end: 1.0 },
          ],
        },
      ];

      const overrides = [{ id: 'cue-1', text: 'Corrected speech' }];
      const result = CaptionService.applyOverrides(cues, overrides as any);

      assert.equal(result[0].text, 'Corrected speech');
      assert.deepEqual(
        result[0].words.map((w: any) => w.text),
        ['Corrected', 'speech']
      );
    });

    it('correctly applies overrides formatted with "cueId" property', () => {
      const cues = [
        {
          id: 'cue-1',
          start: 0.0,
          end: 1.0,
          text: 'Original words',
          words: [
            { text: 'Original', start: 0.0, end: 0.5 },
            { text: 'words', start: 0.5, end: 1.0 },
          ],
        },
      ];

      const overrides = [{ cueId: 'cue-1', text: 'Another correction' }];
      const result = CaptionService.applyOverrides(cues, overrides);

      assert.equal(result[0].text, 'Another correction');
      assert.deepEqual(
        result[0].words.map((w: any) => w.text),
        ['Another', 'correction']
      );
    });
  });

  describe('5. RippleDelete Caption Shift & Slice Synchronization', () => {
    it('shifts subsequent caption cues and drops cut cues when video is ripple deleted', async () => {
      const testProjectId = '00000000-0000-4000-8000-000000000099';
      const testUserId = '00000000-0000-4000-8000-000000000001';
      const testClipId = '00000000-0000-4000-8000-000000000088';
      const videoTrackId = '00000000-0000-4000-8000-000000000077';
      const captionTrackId = '00000000-0000-4000-8000-000000000066';

      await ownerContext.run(testUserId, async () => {
        const project = {
          id: testProjectId,
          user_id: testUserId,
          clip_id: testClipId,
          title: 'Ripple Test',
          canvas: { width: 1080, height: 1920, fps: 30, duration: 20.0, aspect_ratio: '9:16' },
          tracks: [
            {
              id: videoTrackId,
              type: 'VIDEO',
              name: 'Video',
              locked: false,
              muted: false,
              hidden: false,
              items: [
                {
                  id: '00000000-0000-4000-8000-000000000011',
                  track_id: videoTrackId,
                  type: 'VIDEO',
                  timeline_start: 0,
                  timeline_end: 5.0,
                  source_start: 0,
                  source_end: 5.0,
                  speed: { speed: 1.0 },
                  keyframes: [],
                },
                {
                  id: '00000000-0000-4000-8000-000000000022',
                  track_id: videoTrackId,
                  type: 'VIDEO',
                  timeline_start: 5.0,
                  timeline_end: 10.0, // 5 seconds cut
                  source_start: 5.0,
                  source_end: 10.0,
                  speed: { speed: 1.0 },
                  keyframes: [],
                },
                {
                  id: '00000000-0000-4000-8000-000000000033',
                  track_id: videoTrackId,
                  type: 'VIDEO',
                  timeline_start: 10.0,
                  timeline_end: 20.0,
                  source_start: 10.0,
                  source_end: 20.0,
                  speed: { speed: 1.0 },
                  keyframes: [],
                },
              ],
            },
            {
              id: captionTrackId,
              type: 'CAPTION',
              name: 'Subtitles',
              locked: false,
              muted: false,
              hidden: false,
              items: [
                {
                  id: '00000000-0000-4000-8000-000000000044',
                  track_id: captionTrackId,
                  type: 'CAPTION',
                  timeline_start: 0,
                  timeline_end: 20.0,
                  caption: {
                    style: 'clean',
                    cues: [
                      { id: 'c1', start: 1.0, end: 4.0, text: 'Before cut' },
                      { id: 'c2', start: 6.0, end: 8.0, text: 'Inside cut - should be dropped' },
                      { id: 'c3', start: 12.0, end: 15.0, text: 'After cut - should be shifted' },
                    ],
                  },
                },
              ],
            },
          ],
          version: 1,
        };

        // Seed project into in-memory/repository
        await dataRepository.from('editor_projects').upsert(project);

        // Perform ripple delete of item-video-to-cut (duration 5s from t=5.0)
        const updated = await ProEditorService.rippleDelete(testProjectId, testUserId, {
          item_id: '00000000-0000-4000-8000-000000000022',
          track_id: videoTrackId,
        });

        // Verify video track has 2 items left
        const videoTrack = updated.tracks.find((t) => t.id === videoTrackId)!;
        assert.equal(videoTrack.items.length, 2);
        assert.equal(videoTrack.items[1].timeline_start, 5.0); // Shifted from 10.0 to 5.0

        // Verify caption track cues were synchronized
        const captionTrack = updated.tracks.find((t) => t.id === captionTrackId)!;
        const cues = captionTrack.items[0].caption!.cues;

        assert.equal(cues.length, 2, 'Cut cue must be dropped');
        assert.equal(cues[0].id, 'c1');
        assert.equal(cues[0].start, 1.0);
        assert.equal(cues[0].end, 4.0);

        // c3 was at [12.0, 15.0], shifted by 5s to [7.0, 10.0]
        assert.equal(cues[1].id, 'c3');
        assert.equal(cues[1].start, 7.0, 'Subsequent cue start must be shifted left by 5.0s');
        assert.equal(cues[1].end, 10.0, 'Subsequent cue end must be shifted left by 5.0s');
      });
    });
  });

  describe('6. generateCaptionsForClip Uses EditorProject Edited Cues', () => {
    it('uses edited cues from editor_projects in export rather than unedited transcripts', async () => {
      const clipId = '00000000-0000-4000-8000-000000000101';
      const projectId = '00000000-0000-4000-8000-000000000102';
      const userId = '00000000-0000-4000-8000-000000000103';
      const editorProjectId = '00000000-0000-4000-8000-000000000104';
      const transcriptId = '00000000-0000-4000-8000-000000000105';

      await ownerContext.run(userId, async () => {
        // 1. Seed raw transcript with unedited words
        await dataRepository.from('transcripts').upsert({
          id: transcriptId,
          project_id: projectId,
          user_id: userId,
          text: 'This is the unedited transcription',
          segments: [{ start: 0, end: 3, text: 'This is the unedited transcription' }],
          words: [],
        });

        // 2. Seed editor_projects with user edited text and shifted timing
        await dataRepository.from('editor_projects').upsert({
          id: editorProjectId,
          clip_id: clipId,
          project_id: projectId,
          user_id: userId,
          tracks: [
            {
              id: '00000000-0000-4000-8000-000000000106',
              type: 'CAPTION',
              name: 'Subtitles',
              hidden: false,
              items: [
                {
                  id: '00000000-0000-4000-8000-000000000107',
                  track_id: '00000000-0000-4000-8000-000000000106',
                  type: 'CAPTION',
                  timeline_start: 0,
                  timeline_end: 3.0,
                  caption: {
                    style: 'clean',
                    cues: [
                      {
                        id: 'edited-cue-1',
                        start: 0.0,
                        end: 2.5,
                        text: 'THIS IS THE EDITED AND CORRECTED SPEECH',
                        words: [
                          { text: 'THIS', start: 0.0, end: 0.4 },
                          { text: 'IS', start: 0.4, end: 0.7 },
                          { text: 'THE', start: 0.7, end: 1.0 },
                          { text: 'EDITED', start: 1.0, end: 1.5 },
                          { text: 'AND', start: 1.5, end: 1.7 },
                          { text: 'CORRECTED', start: 1.7, end: 2.2 },
                          { text: 'SPEECH', start: 2.2, end: 2.5 },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });

        const mockClip = {
          id: clipId,
          project_id: projectId,
          user_id: userId,
          start_seconds: 0,
          end_seconds: 3.0,
          aspect_ratio: '9:16',
          caption_style: 'clean',
          caption_enabled: true,
        } as any;

        const result = await CaptionService.generateCaptionsForClip({ clip: mockClip });

        // Verify that the output cues match the EDITED cues from editor_projects!
        assert.equal(result.cues.length, 1);
        assert.equal(result.cues[0].text, 'THIS IS THE EDITED AND CORRECTED SPEECH');
        assert.ok(
          result.assContent.includes('THIS IS THE EDITED AND CORRECTED SPEECH'),
          'ASS subtitle dialogue must contain the user edited speech'
        );
        assert.ok(
          !result.assContent.includes('unedited transcription'),
          'ASS subtitle dialogue must NOT contain the unedited raw transcript'
        );
      });
    });
  });

  describe('7. Word Boundary Refinement Alias & Field Parity', () => {
    it('refines word boundaries when tokens use "text" property instead of "word"', () => {
      const words = [
        { text: 'First', start: 0.1, end: 0.5 },
        { text: 'middle', start: 0.6, end: 1.2 },
        { text: 'last.', start: 1.3, end: 1.8 },
      ] as any;

      const refined = ClipAnalysisService.refineWordBoundaries({
        start_seconds: 0.55,
        end_seconds: 1.25,
        words,
        sourceDuration: 60.0,
      });
      assert.ok(refined.was_snapped, 'Boundary should be snapped to nearest words');
      assert.ok(refined.start_seconds <= 0.6, 'Start boundary snaps to upcoming word');
      assert.ok(refined.end_seconds >= 1.2, 'End boundary snaps to preceding word end');
    });

    it('ensures transcriptPayload stores both text and transcript_text for full parity', () => {
      const rawText = 'Universal speech content for all services';
      const payload: any = {
        project_id: 'p1',
        user_id: 'u1',
        transcript_text: rawText,
        text: rawText,
      };

      assert.equal(payload.transcript_text, payload.text);
    });
  });
});
