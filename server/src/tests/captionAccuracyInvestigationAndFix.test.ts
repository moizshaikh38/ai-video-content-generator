import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { CaptionService } from '../services/captionService.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { ProEditorService } from '../services/proEditorService.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { getClipCaptions } from '../controllers/clipController.js';
import { AuthenticatedRequest } from '../types/index.js';
import { Response } from 'express';
import { closeMongo } from '../db/mongoClient.js';

// Helper to mock Express req, res
function mockReqRes(reqOverrides: any = {}) {
  const req = {
    headers: {},
    ip: '127.0.0.1',
    params: {},
    query: {},
    body: {},
    requestId: 'test-req-id-caption-fix',
    ...reqOverrides,
  } as unknown as AuthenticatedRequest;

  let statusCode = 200;
  let responseData: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
  } as unknown as Response;

  return {
    req,
    res,
    getStatusCode: () => statusCode,
    getResponseData: () => responseData,
  };
}

describe('VireoClip — Critical Caption Accuracy Investigation & Fix Verification Suite', () => {
  const testUserId = '00000000-0000-4000-8000-000000000001';
  const testProjectId = '00000000-0000-4000-8000-000000000010';
  const testClipId = '00000000-0000-4000-8000-000000000020';

  describe('1. Endpoint Parity: getClipCaptions respects EditorProject canonical cues', () => {
    it('returns custom edited cues from editor_projects so editor preview matches export', async () => {
      await ownerContext.run(testUserId, async () => {
        // Seed clip
        await dataRepository.from('clips').upsert({
          id: testClipId,
          project_id: testProjectId,
          user_id: testUserId,
          start_seconds: 60.0,
          end_seconds: 90.0,
          duration_seconds: 30.0,
          caption_style: 'clean',
          caption_enabled: true,
        });

        // Seed raw transcript
        await dataRepository.from('transcripts').upsert({
          id: '00000000-0000-4000-8000-000000000030',
          project_id: testProjectId,
          user_id: testUserId,
          text: 'Raw unedited speech transcript',
          segments: [{ start: 60, end: 90, text: 'Raw unedited speech transcript' }],
          words: [
            { word: 'Raw', start: 60.0, end: 65.0 },
            { word: 'unedited', start: 65.0, end: 75.0 },
            { word: 'speech', start: 75.0, end: 85.0 },
            { word: 'transcript', start: 85.0, end: 90.0 },
          ],
        });

        // Seed editor_projects with user edited text
        await dataRepository.from('editor_projects').upsert({
          id: '00000000-0000-4000-8000-000000000040',
          clip_id: testClipId,
          project_id: testProjectId,
          user_id: testUserId,
          tracks: [
            {
              id: '00000000-0000-4000-8000-000000000041',
              type: 'CAPTION',
              name: 'Subtitles',
              hidden: false,
              items: [
                {
                  id: '00000000-0000-4000-8000-000000000042',
                  track_id: '00000000-0000-4000-8000-000000000041',
                  type: 'CAPTION',
                  timeline_start: 0,
                  timeline_end: 30.0,
                  caption: {
                    style: 'bold_stroke',
                    cues: [
                      {
                        id: 'custom-cue-1',
                        start: 0.0,
                        end: 5.0,
                        text: 'USER EDITED ACCURATE CAPTION TEXT',
                        words: [
                          { text: 'USER', start: 0.0, end: 1.0 },
                          { text: 'EDITED', start: 1.0, end: 2.0 },
                          { text: 'ACCURATE', start: 2.0, end: 3.5 },
                          { text: 'CAPTION', start: 3.5, end: 4.2 },
                          { text: 'TEXT', start: 4.2, end: 5.0 },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        });

        const { req, res, getStatusCode, getResponseData } = mockReqRes({
          user: { id: testUserId },
          params: { clipId: testClipId },
        });

        await getClipCaptions(req, res);
        assert.equal(getStatusCode(), 200);
        const data = getResponseData();
        assert.equal(data.status, 'ok');
        assert.equal(data.cues.length, 1);
        assert.equal(data.cues[0].text, 'USER EDITED ACCURATE CAPTION TEXT');
        assert.equal(data.cues[0].id, 'custom-cue-1');
        assert.equal(data.timingMode, 'word');
      });
    });

    it('falls back to raw transcript extraction when no custom editor_projects cues exist', async () => {
      const freshClipId = '00000000-0000-4000-8000-000000000050';
      await ownerContext.run(testUserId, async () => {
        await dataRepository.from('clips').upsert({
          id: freshClipId,
          project_id: testProjectId,
          user_id: testUserId,
          start_seconds: 60.0,
          end_seconds: 90.0,
          duration_seconds: 30.0,
          caption_style: 'clean',
          caption_enabled: true,
        });

        const { req, res, getStatusCode, getResponseData } = mockReqRes({
          user: { id: testUserId },
          params: { clipId: freshClipId },
        });

        await getClipCaptions(req, res);
        assert.equal(getStatusCode(), 200);
        const data = getResponseData();
        assert.equal(data.status, 'ok');
        assert.ok(data.cues.length > 0);
        assert.equal(data.cues[0].start, 0.0, 'First cue must be clip-relative starting at 0');
      });
    });
  });

  describe('2. Isolation: Different clips cannot reuse each other transcripts or cues', () => {
    it('returns 404 for clip from different user due to strict ownerContext isolation', async () => {
      const otherUserId = '00000000-0000-4000-8000-000000000002';
      await ownerContext.run(otherUserId, async () => {
        const { req, res, getStatusCode } = mockReqRes({
          user: { id: otherUserId },
          params: { clipId: testClipId }, // Belonging to testUserId
        });

        await getClipCaptions(req, res);
        assert.equal(getStatusCode(), 404);
      });
    });
  });

  describe('3. Clip-Relative Timing: Source-time vs Clip-relative Offset Mathematics', () => {
    it('accurately offsets word timestamps when clip starts at non-zero source offset', () => {
      const transcript = {
        words: [
          { word: 'Before', start: 50.0, end: 55.0 },
          { word: 'First', start: 60.5, end: 61.2 },
          { word: 'Middle', start: 70.0, end: 71.0 },
          { word: 'Last', start: 89.0, end: 89.8 },
          { word: 'After', start: 95.0, end: 98.0 },
        ],
      };

      const clip = {
        start_seconds: 60.0,
        end_seconds: 90.0,
        trim_start_offset: 0,
        trim_end_offset: 0,
        caption_style: 'clean',
      } as any;

      const extracted = CaptionService.extractCuesForClipSettings(transcript, clip);
      const allWords = extracted.cues.flatMap((c) => c.words || []);

      assert.equal(allWords.length, 3, 'Words outside [60, 90] must be excluded');
      // Word 'First' at source 60.5 -> local 0.5
      assert.equal(allWords[0].text, 'First');
      assert.ok(Math.abs(allWords[0].start - 0.5) < 0.001);
      assert.ok(Math.abs(allWords[0].end - 1.2) < 0.001);

      // Word 'Middle' at source 70.0 -> local 10.0
      assert.equal(allWords[1].text, 'Middle');
      assert.ok(Math.abs(allWords[1].start - 10.0) < 0.001);
      assert.ok(Math.abs(allWords[1].end - 11.0) < 0.001);

      // Word 'Last' at source 89.0 -> local 29.0
      assert.equal(allWords[2].text, 'Last');
      assert.ok(Math.abs(allWords[2].start - 29.0) < 0.001);
      assert.ok(Math.abs(allWords[2].end - 29.8) < 0.001);
    });

    it('accurately incorporates trim_start_offset and trim_end_offset', () => {
      const transcript = {
        words: [
          { word: 'TrimmedOut', start: 60.5, end: 61.0 }, // Cut by trim_start_offset = 2.0
          { word: 'KeptFirst', start: 62.5, end: 63.5 },
          { word: 'KeptSecond', start: 68.0, end: 69.0 },
          { word: 'TrimmedOutEnd', start: 78.5, end: 79.5 }, // Cut by trim_end_offset = 2.0 (end=78.0)
        ],
      };

      const clip = {
        start_seconds: 60.0,
        end_seconds: 80.0,
        trim_start_offset: 2.0, // effective start = 62.0
        trim_end_offset: 2.0,   // effective end = 78.0
        caption_style: 'clean',
      } as any;

      const extracted = CaptionService.extractCuesForClipSettings(transcript, clip);
      const words = extracted.cues.flatMap((c) => c.words || []);

      assert.equal(words.length, 2);
      assert.equal(words[0].text, 'KeptFirst');
      // 62.5 - 62.0 = 0.5s local
      assert.ok(Math.abs(words[0].start - 0.5) < 0.001);
      assert.ok(Math.abs(words[0].end - 1.5) < 0.001);

      assert.equal(words[1].text, 'KeptSecond');
      // 68.0 - 62.0 = 6.0s local
      assert.ok(Math.abs(words[1].start - 6.0) < 0.001);
      assert.ok(Math.abs(words[1].end - 7.0) < 0.001);
    });
  });

  describe('4. ASS Subtitle Timestamp Formatting and Monotonicity', () => {
    it('formats centisecond timestamps correctly for ASS export', () => {
      assert.equal(CaptionService.formatAssTime(0), '0:00:00.00');
      assert.equal(CaptionService.formatAssTime(1.25), '0:00:01.25');
      assert.equal(CaptionService.formatAssTime(65.5), '0:01:05.50');
      assert.equal(CaptionService.formatAssTime(3661.08), '1:01:01.08');
    });

    it('generates non-overlapping dialogue events in ASS script for segment cues', () => {
      const cues = [
        {
          id: 'c1',
          start: 0.0,
          end: 2.0,
          text: 'First caption cue',
          words: [],
        },
        {
          id: 'c2',
          start: 2.0,
          end: 4.0,
          text: 'Second caption cue',
          words: [],
        },
      ];

      const assScript = CaptionService.buildAssScript(cues, {
        style: 'clean',
        position: 'bottom',
        aspectRatio: '9:16',
      });

      assert.ok(assScript.includes('Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,First caption cue'));
      assert.ok(assScript.includes('Dialogue: 0,0:00:02.00,0:00:04.00,Default,,0,0,0,,Second caption cue'));
    });

    it('generates accurate word-timed events for kinetic cues', () => {
      const cues = [
        {
          id: 'c1',
          start: 0.0,
          end: 2.0,
          text: 'First caption cue',
          words: [
            { text: 'First', start: 0.0, end: 0.6 },
            { text: 'caption', start: 0.6, end: 1.3 },
            { text: 'cue', start: 1.3, end: 2.0 },
          ],
        },
      ];

      const assScript = CaptionService.buildAssScript(cues, {
        style: 'clean',
        position: 'bottom',
        aspectRatio: '9:16',
        kinetic: true,
        timingMode: 'word',
      });

      assert.ok(assScript.includes('Dialogue: 0,0:00:00.00,0:00:00.60,Default'));
      assert.ok(assScript.includes('First'));
    });
  });

  after(async () => {
    await closeMongo();
  });
});

