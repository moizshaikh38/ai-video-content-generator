import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
import ffmpegStatic from 'ffmpeg-static';

import {
  buildPresetAssScript,
  buildPresetCueEvents,
  resolveCaptionPreset,
  CAPTION_EMOJI_LEXICON,
  lookupCaptionEmoji,
  isHighlightKeyword,
  auditCaptionReadability,
  CAPTION_READABILITY,
  PresetTimedCue,
} from '../shared/captionPresets.js';

/**
 * Platform Quality Roadmap E-2 — caption competitive polish + parity gate:
 * auto-emoji and keyword highlighting (Opus/Vizard parity, flag-gated),
 * readability audit (warn-first), and a real-render gate proving burned
 * captions are visibly present in the correct screen region.
 */

const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

const word = (text: string, start: number, end: number) => ({ text, start, end });
const cue = (id: string, text: string, words: Array<{ text: string; start: number; end: number }>): PresetTimedCue =>
  ({ id, start: words[0].start, end: words[words.length - 1].end, text, words }) as PresetTimedCue;

describe('E2 — auto-emoji captions (Opus parity)', () => {
  it('lexicon maps common content keywords and lookups are punctuation-safe', () => {
    assert.equal(lookupCaptionEmoji('money'), '💰');
    assert.equal(lookupCaptionEmoji('Money!'), '💰');
    assert.equal(lookupCaptionEmoji('revenue'), '📈');
    assert.equal(lookupCaptionEmoji('unmapped-word'), null);
    assert.ok(Object.keys(CAPTION_EMOJI_LEXICON).length >= 20);
  });

  it('emoji renders appended to matching words only when the flag is on', () => {
    const c = cue('c1', 'we grew revenue fast', [
      word('we', 0, 0.3), word('grew', 0.3, 0.6), word('revenue', 0.6, 1.0), word('fast', 1.0, 1.3),
    ]);

    const withEmoji = resolveCaptionPreset('vireo_clean', { emoji: true }, '9:16');
    const events = buildPresetCueEvents(c, withEmoji).join('');
    assert.ok(events.includes('revenue 📈'), 'emoji must be appended to the rendered word');
    assert.ok(events.includes('fast ⚡'));
    assert.ok(!events.includes('we ⏰'));

    const without = resolveCaptionPreset('vireo_clean', {}, '9:16');
    const plainEvents = buildPresetCueEvents(c, without).join('');
    assert.ok(!plainEvents.includes('📈'), 'emoji must stay off by default (zero output change)');
    assert.ok(!plainEvents.includes('⚡'));
  });

  it('default preset resolution keeps emoji disabled (backward compatibility)', () => {
    const style = resolveCaptionPreset('vireo_clean', undefined, '9:16');
    assert.equal(style.emoji, false);
    assert.deepEqual(style.highlightKeywords, []);
  });
});

describe('E2 — keyword highlighting (Opus/Vizard parity)', () => {
  it('statically colours whole-word keyword matches with the configured colour', () => {
    const c = cue('c1', 'the revenue story continues', [
      word('the', 0, 0.25), word('revenue', 0.25, 0.7), word('story', 0.7, 1.1), word('continues', 1.1, 1.5),
    ]);
    const style = resolveCaptionPreset(
      'vireo_clean',
      { highlightKeywords: ['revenue'], highlightKeywordColor: '#FFE500' },
      '9:16'
    );
    const events = buildPresetCueEvents(c, style);
    const joined = events.join('');

    // Keyword piece: yellow + bold on the non-active slice containing it.
    assert.match(joined, /\{\\c&H0000E5FF&\\b1\}revenue\{\\c[^}]+\\b0\}/);
    // Non-keywords render plain (no forced keyword colour on 'story').
    assert.ok(!/\{\\c&H0000E5FF&\\b1\}story/.test(joined));
  });

  it('matcher is whole-word and case-insensitive, ignoring punctuation', () => {
    assert.equal(isHighlightKeyword('Revenue', ['revenue']), true);
    assert.equal(isHighlightKeyword('revenue!', ['revenue']), true);
    assert.equal(isHighlightKeyword('revenues', ['revenue']), false);
    assert.equal(isHighlightKeyword('anything', []), false);
  });
});

describe('E2 — readability audit (warn-first)', () => {
  it('flags dense cues by chars-per-second', () => {
    const denseText = 'a'.repeat(60);
    const c = cue('c1', denseText, [word(denseText, 0, 1.0)]);
    const style = resolveCaptionPreset('vireo_clean', {}, '9:16');
    const report = auditCaptionReadability([c], style);
    assert.equal(report.maxCps, 60);
    assert.ok(report.warnings.some((w) => w.includes('60 cps')));

    const script = buildPresetAssScript([c], style);
    assert.match(script, /; VireoWarning: .*cps/);
  });

  it('flags undersized effective fonts', () => {
    const style = resolveCaptionPreset('vireo_clean', { fontSize: CAPTION_READABILITY.minEffectiveFontSizePx - 1 }, '9:16');
    const report = auditCaptionReadability([], style);
    assert.ok(report.warnings.some((w) => w.includes('below 42px')));
  });

  it('clean cues emit no warnings', () => {
    const c = cue('c1', 'a normal paced caption line', [
      word('a', 0, 0.3), word('normal', 0.3, 0.7), word('paced', 0.7, 1.1), word('caption', 1.1, 1.6), word('line', 1.6, 2.0),
    ]);
    const style = resolveCaptionPreset('vireo_clean', {}, '9:16');
    const report = auditCaptionReadability([c], style);
    assert.equal(report.warnings.length, 0);
  });
});

describe('E2 — burned-caption render gate (presence + placement)', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'e2-captions-'));
  const style = resolveCaptionPreset('vireo_clean', {}, '9:16');
  const c = cue(
    'c1',
    'this revenue grew fast',
    [word('this', 0.2, 0.5), word('revenue', 0.5, 0.9), word('grew', 0.9, 1.2), word('fast', 1.2, 1.6)]
  );
  const assPath = path.join(tmpRoot, 'captions.ass');
  fs.writeFileSync(assPath, buildPresetAssScript([c], style), 'utf8');

  const framePath = (name: string) => path.join(tmpRoot, name);

  const renderFrame = async (out: string, withSubs: boolean) => {
    const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
    const args = [
      '-y',
      '-f', 'lavfi', '-i', 'color=c=0x101828:s=540x960:r=30:d=2',
      '-ss', '1.0', '-frames:v', '1',
    ];
    if (withSubs) args.push('-vf', `subtitles='${safeAss}'`);
    else args.push('-vf', 'null');
    args.push('-pix_fmt', 'gray', out);
    await execFileAsync(ffmpegBin, args, { timeout: 60000 });
  };

  const regionPsnr = async (fileA: string, fileB: string, cropFilter: string): Promise<number> => {
    try {
      const { stderr } = await execFileAsync(
        ffmpegBin,
        ['-i', fileA, '-i', fileB,
         '-lavfi', `[0:v]${cropFilter}[a];[1:v]${cropFilter}[b];[a][b]psnr`,
         '-f', 'null', '-'],
        { timeout: 60000 }
      );
      const m = [...stderr.matchAll(/average:([0-9.]+)/g)].pop();
      return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
    } catch (err: any) {
      // psnr prints to stderr and exits nonzero on inf (identical frames): parse it anyway.
      const m = [...String(err.stderr || '').matchAll(/average:([0-9.]+|inf)/g)].pop();
      if (m && m[1] === 'inf') return Number.POSITIVE_INFINITY;
      if (m) return Number(m[1]);
      throw err;
    }
  };

  it('burned captions are visibly present in the caption region and absent elsewhere', async () => {
    const withSubs = framePath('with.png');
    const noSubs = framePath('without.png');
    await renderFrame(withSubs, true);
    await renderFrame(noSubs, false);

    // Bottom quarter = caption zone for the default bottom placement.
    const bottomPsnr = await regionPsnr(withSubs, noSubs, 'crop=iw:ih/4:0:3*ih/4');
    // Top half must be the untouched background.
    const topPsnr = await regionPsnr(withSubs, noSubs, 'crop=iw:ih/2:0:0');

    assert.ok(
      bottomPsnr < 40,
      `captions must visibly alter the caption region (bottom PSNR ${bottomPsnr} < 40dB)`
    );
    assert.ok(
      topPsnr === Number.POSITIVE_INFINITY || topPsnr > 45,
      `top region must remain identical (top PSNR ${topPsnr})`
    );
  });
});
