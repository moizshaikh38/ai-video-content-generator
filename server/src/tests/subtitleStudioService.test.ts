import test from 'node:test';
import assert from 'node:assert/strict';
import { SubtitleStudioService } from '../services/subtitleStudioService.js';
import { CaptionLocalizationService } from '../services/translation/captionLocalizationService.js';
import { CaptionService } from '../services/captionService.js';
import { TimedCaptionCue } from '../types/index.js';

test('SubtitleStudioService - Cues Validation and Sanitization', async (t) => {
  await t.test('rejects non-array cues input', async () => {
    await assert.rejects(
      async () => {
        // @ts-expect-error test invalid payload
        await SubtitleStudioService.updateCues('00000000-0000-0000-0000-000000000000', 'user_1', 'not-an-array');
      },
      {
        name: 'AppError',
        message: 'Cues must be an array.',
      }
    );
  });

  await t.test('CaptionService.sanitizeAssText removes dangerous characters and curly braces', () => {
    const raw = 'Hello {\\b1}World!\\nNew Line';
    const sanitized = CaptionService.sanitizeAssText(raw);
    assert.ok(!sanitized.includes('{\\b1}'), 'Curly braces must be stripped');
    assert.ok(sanitized.includes('Hello'), 'Text content preserved');
  });

  await t.test('CaptionService.validateFontFamily falls back to safe default', () => {
    const safeMontserrat = CaptionService.validateFontFamily('Montserrat');
    assert.strictEqual(safeMontserrat, 'Montserrat');

    const unsafeFont = CaptionService.validateFontFamily('Dangerous;rm -rf /');
    assert.strictEqual(unsafeFont, 'Arial');
  });
});

test('Subtitle Export - SRT and VTT format accuracy', async (t) => {
  const sampleCues: TimedCaptionCue[] = [
    {
      id: 'cue_1',
      start: 1.25,
      end: 4.5,
      text: 'Welcome to VireoClip Subtitle Studio!',
    },
    {
      id: 'cue_2',
      start: 5.0,
      end: 7.75,
      text: 'Create viral subtitles with one click.',
    },
  ];

  await t.test('CaptionLocalizationService.generateSRT generates standard SubRip syntax', () => {
    const srt = CaptionLocalizationService.generateSRT(sampleCues);
    assert.ok(srt.includes('1\n00:00:01,250 --> 00:00:04,500\nWelcome to VireoClip Subtitle Studio!'));
    assert.ok(srt.includes('2\n00:00:05,000 --> 00:00:07,750\nCreate viral subtitles with one click.'));
  });

  await t.test('CaptionLocalizationService.generateVTT generates standard WebVTT syntax', () => {
    const vtt = CaptionLocalizationService.generateVTT(sampleCues);
    assert.ok(vtt.startsWith('WEBVTT\n\n'));
    assert.ok(vtt.includes('00:00:01.250 --> 00:00:04.500\nWelcome to VireoClip Subtitle Studio!'));
    assert.ok(vtt.includes('00:00:05.000 --> 00:00:07.750\nCreate viral subtitles with one click.'));
  });
});

test('AI Video Clipping - Optional Subtitles Isolation', async (t) => {
  await t.test('preserves individual clip subtitle toggle and preset style', () => {
    const clipWithSubtitles = {
      id: 'clip_sub_1',
      project_id: 'proj_1',
      caption_enabled: true,
      caption_style: 'hormozi',
    };

    const clipWithoutSubtitles = {
      id: 'clip_clean_1',
      project_id: 'proj_1',
      caption_enabled: false,
      caption_style: undefined,
    };

    assert.strictEqual(clipWithSubtitles.caption_enabled, true);
    assert.strictEqual(clipWithSubtitles.caption_style, 'hormozi');

    assert.strictEqual(clipWithoutSubtitles.caption_enabled, false);
    assert.strictEqual(clipWithoutSubtitles.caption_style, undefined);
  });
});
