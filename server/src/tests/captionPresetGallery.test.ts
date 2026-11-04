/**
 * Caption Presets Gallery — preset config, preview/export parity, persistence and real renders.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import {
  ALL_CAPTION_STYLES,
  CAPTION_PRESET_IDS,
  CAPTION_PRESETS,
  CAPTION_RENDER_FONTS,
  DEFAULT_CAPTION_PRESET_ID,
  FONT_EM_PER_ASS_SIZE,
  PRESET_FONT_CHOICES,
  buildPresetAssScript,
  buildPresetCueEvents,
  computeCueWordSlices,
  escapeAssText,
  getActiveWordScaleAt,
  getPopTiming,
  getPreviewCss,
  getPreviewFrame,
  regroupCuesForPreset,
  resolveCaptionPreset,
  resolveRenderPresetId,
  sanitizePresetOverrides,
  type PresetTimedCue,
  type RenderableCaptionPresetId,
} from '../shared/captionPresets.js';
import {
  applyPresetToEditorCaption,
  editorCaptionToPresetOverrides,
  getEditorCaptionPresetId,
  resolveEditorCaptionStyle,
} from '../../../src/lib/captionPresets.js';
import { CaptionService } from '../services/captionService.js';
import { ClipRenderService } from '../services/clipRenderService.js';
import { ProEditorService } from '../services/proEditorService.js';
import { dataRepository } from '../db/repositories/dataRepository.js';
import type { ClipRecord, EditorCaptionItem } from '../types/index.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

const HEX = /^#[0-9A-F]{6}$/;

function wordCue(words: Array<[string, number, number]>, text?: string): PresetTimedCue {
  const w = words.map(([t, s, e]) => ({ text: t, start: s, end: e }));
  return { id: 'cue-1', start: w[0].start, end: w[w.length - 1].end, text: text ?? w.map((x) => x.text).join(' '), words: w };
}

const transcript = {
  segments: [{ start: 10, end: 14, text: 'We made one million dollars today' }],
  words: [
    { word: 'We', start: 10.0, end: 10.3 },
    { word: 'made', start: 10.3, end: 10.7 },
    { word: 'one', start: 10.7, end: 11.0 },
    { word: 'million', start: 11.0, end: 11.5 },
    { word: 'dollars', start: 11.5, end: 12.0 },
    { word: 'today', start: 12.0, end: 12.6 },
  ],
};

function baseClip(overrides: Partial<ClipRecord> = {}): ClipRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    user_id: 'user-1',
    project_id: 'proj-1',
    candidate_id: 'cand-1',
    title: 'Clip',
    start_seconds: 10,
    end_seconds: 20,
    duration_seconds: 10,
    aspect_ratio: '9:16',
    crop_mode: 'center',
    render_status: 'ready',
    source_storage_path: 'x',
    created_at: '',
    updated_at: '',
    caption_enabled: true,
    caption_style: 'clean',
    caption_position: 'bottom',
    caption_config: {},
    ...overrides,
  } as ClipRecord;
}

describe('Caption presets: configuration and stable IDs', () => {
  it('exposes the exact gallery IDs in display order', () => {
    assert.deepEqual([...CAPTION_PRESET_IDS], [
      'none', 'karaoke', 'deep_diver', 'youshaei', 'simple', 'beasty', 'mozi', 'popline', 'think_media',
      'editorial', 'bold_highlight', 'soft_backdrop', 'compact_creator', 'two_color_highlight',
      'vireo_oneword', 'vireo_pill', 'vireo_lime', 'vireo_hormozi', 'vireo_clean',
      'vireo_spring', 'vireo_neon', 'vireo_capsule', 'vireo_editorial', 'vireo_sweep',
    ]);
  });

  it('keeps every legacy style ID valid and reuses karaoke', () => {
    for (const legacy of ['clean', 'bold', 'minimal', 'podcast', 'highlight', 'karaoke']) {
      assert.ok((ALL_CAPTION_STYLES as readonly string[]).includes(legacy), legacy);
    }
    assert.ok(CAPTION_PRESETS.karaoke);
  });

  it('defines complete, renderer-safe values for every preset', () => {
    for (const id of CAPTION_PRESET_IDS.filter((i) => i !== 'none') as RenderableCaptionPresetId[]) {
      const p = CAPTION_PRESETS[id];
      assert.equal(p.id, id);
      assert.ok(PRESET_FONT_CHOICES.includes(p.font.family), `${id} font ${p.font.family} must be export-verified`);
      for (const c of [p.colors.text, p.colors.active, p.colors.activeText, p.colors.outline, p.colors.shadow]) {
        assert.match(c, HEX, `${id} color ${c}`);
      }
      assert.ok(p.font.size >= 48 && p.font.size <= 110, `${id} size`);
      assert.ok(p.layout.maxWordsPerCue >= 1 && p.layout.maxWordsPerCue <= 6, `${id} words`);
      assert.ok(p.wordAnimation.scale >= 1 && p.wordAnimation.scale <= 1.3, `${id} scale`);
      assert.ok(p.sampleText.split(' ').length >= 2);
    }
  });

  it('has a metric ratio for every render font', () => {
    for (const f of CAPTION_RENDER_FONTS) assert.ok(FONT_EM_PER_ASS_SIZE[f] > 0.5 && FONT_EM_PER_ASS_SIZE[f] < 1);
  });
});

describe('Caption presets: resolution, fallback and sanitization', () => {
  it('routes only preset styles to the preset engine; karaoke needs an explicit presetId', () => {
    assert.equal(resolveRenderPresetId('mozi', {}), 'mozi');
    assert.equal(resolveRenderPresetId('karaoke', {}), null, 'legacy karaoke keeps \\k behavior');
    assert.equal(resolveRenderPresetId('karaoke', { presetId: 'karaoke' }), 'karaoke');
    assert.equal(resolveRenderPresetId('clean', { presetId: 'mozi' }), null, 'stale presetId never hijacks a legacy style');
    assert.equal(resolveRenderPresetId('active_word_pop', {}), null);
    assert.equal(resolveRenderPresetId(undefined, {}), null);
  });

  it('falls back to the default preset for unknown IDs', () => {
    assert.equal(resolveCaptionPreset('totally_unknown').presetId, DEFAULT_CAPTION_PRESET_ID);
    assert.equal(resolveCaptionPreset('none').presetId, DEFAULT_CAPTION_PRESET_ID);
    assert.equal(resolveCaptionPreset(42).presetId, DEFAULT_CAPTION_PRESET_ID);
  });

  it('replaces unsupported fonts with Arial and flags the fallback', () => {
    const r = resolveCaptionPreset('mozi', { fontFamily: 'Comic Sans MS' });
    assert.equal(r.fontFamily, 'Arial');
    assert.equal(r.fontFallback, true);
    assert.equal(r.requestedFontFamily, 'Comic Sans MS');
    const ok = resolveCaptionPreset('mozi', { fontFamily: 'Arial' });
    assert.equal(ok.fontFallback, false);
  });

  it('ignores invalid override values instead of throwing', () => {
    const clean = sanitizePresetOverrides({
      textColor: 'red', activeColor: '#12345', outlineWidth: 'NaN', maxLines: 'two', position: 'side',
      positionY: 'x', bold: 'yes', fontFamily: 123, extra: { evil: true },
    });
    assert.deepEqual(clean, {});
    assert.deepEqual(sanitizePresetOverrides(null), {});
    assert.deepEqual(sanitizePresetOverrides('{"x":1}'), {});
    assert.deepEqual(sanitizePresetOverrides({ maxLines: 7, outlineWidth: -3 }), { maxLines: 2, outlineWidth: 0 }, 'out-of-range numbers are clamped');

    const r = resolveCaptionPreset('beasty', { textColor: 'javascript:alert(1)', outlineWidth: 999 });
    assert.equal(r.textColor, CAPTION_PRESETS.beasty.colors.text);
    assert.equal(r.outlineWidth, 12, 'outline is clamped');
  });

  it('applies valid overrides and aspect-aware geometry', () => {
    const r = resolveCaptionPreset('mozi', { activeColor: '#ff0000', uppercase: false, maxLines: 1 }, '16:9');
    assert.equal(r.activeColor, '#FF0000');
    assert.equal(r.uppercase, false);
    assert.equal(r.maxLines, 1);
    assert.equal(r.playResX, 1920);
    assert.equal(r.playResY, 1080);
    assert.equal(r.marginV, Math.round(CAPTION_PRESETS.mozi.layout.marginV * (1080 / 1920)));

    const top = resolveCaptionPreset('simple', { position: 'top' });
    assert.equal(top.alignment, 8);
    const pinned = resolveCaptionPreset('simple', { positionY: 0.75 });
    assert.equal(pinned.alignment, 2);
    assert.equal(pinned.marginV, 480);
  });

  it('box presets use the box padding as outline and drop shadows', () => {
    const r = resolveCaptionPreset('think_media', { outlineWidth: 2, shadowEnabled: true });
    assert.ok(r.box);
    assert.equal(r.outlineWidth, r.box!.padding);
    assert.equal(r.shadowDepth, 0);
  });
});

describe('Caption presets: ASS generation', () => {
  const cue = wordCue([['MAKE', 0, 0.4], ['MORE', 0.4, 0.8], ['MONEY', 0.8, 1.3]]);

  it('emits one sequential event per spoken word with the active word highlighted', () => {
    const style = resolveCaptionPreset('mozi');
    const events = buildPresetCueEvents(cue, style);
    assert.equal(events.length, 3);
    const green = '&H0014FF39&';
    events.forEach((ev, i) => {
      const highlighted = ['MAKE', 'MORE', 'MONEY'].filter((w) => ev.includes(`\\c${green}`) && ev.includes(`\\fscy112)}${w}`));
      assert.deepEqual(highlighted, [['MAKE', 'MORE', 'MONEY'][i]], `event ${i}: ${ev}`);
    });
    const v = CaptionService.validateNoOverlappingDialogueLines(events);
    assert.ok(v.valid, v.overlaps.join('\n'));
  });

  it('karaoke preset keeps earlier words filled (progressive)', () => {
    const style = resolveCaptionPreset('karaoke');
    const events = buildPresetCueEvents(cue, style);
    const last = events[events.length - 1];
    const yellow = '&H000AD6FF&';
    assert.equal((last.match(new RegExp(yellow.replace(/[&]/g, '\\&'), 'g')) || []).length, 3, last);
  });

  it('simple preset never fakes a highlight', () => {
    const events = buildPresetCueEvents(cue, resolveCaptionPreset('simple'));
    for (const ev of events) assert.ok(!/\\c&H/.test(ev), ev);
  });

  it('popline draws the active pill as a thick outline and restores the normal outline after it', () => {
    const style = resolveCaptionPreset('popline');
    const [first] = buildPresetCueEvents(cue, style);
    assert.ok(first.includes(`\\3c&H009948EC&\\bord14`), first);
    assert.ok(first.includes(`\\3c&H00000000&\\bord5`), first);
  });

  it('applies the entrance fade only to the first event of each cue', () => {
    const events = buildPresetCueEvents(cue, resolveCaptionPreset('deep_diver'));
    assert.ok(events[0].includes('{\\fad(120,0)}'));
    assert.ok(!events[1].includes('\\fad'));
  });

  it('falls back to static text without word timestamps (segment timing)', () => {
    const seg: PresetTimedCue = { id: 'cue-1', start: 1, end: 3, text: 'NO WORD\\NTIMING HERE' };
    const style = resolveCaptionPreset('mozi');
    const events = buildPresetCueEvents(seg, style);
    assert.equal(events.length, 1);
    assert.ok(events[0].endsWith(',NO WORD\\NTIMING HERE'), events[0]);
    assert.ok(!events[0].includes('\\c'), 'no highlight without word timing');

    const frame = getPreviewFrame(seg, 2, style);
    assert.equal(frame.wordTiming, false);
    assert.ok(frame.words.every((w) => !w.highlighted && !w.active && w.scale === 1));
    assert.equal(frame.words.findIndex((w) => w.breakAfter), 1);
  });

  it('escapes override braces/backslashes and preserves intended line breaks', () => {
    assert.equal(escapeAssText('{\\pos(0,0)}hack\\N'), '/pos(0,0)hack/N');
    const nasty = wordCue([['{\\b1}BIG', 0, 0.5], ['LINE', 0.5, 1], ['TWO', 1, 1.5]], '{\\b1}BIG LINE\\NTWO');
    const events = buildPresetCueEvents(nasty, resolveCaptionPreset('youshaei'));
    for (const ev of events) {
      const text = ev.split(',,0,0,0,,')[1];
      assert.ok(!text.includes('{\\b1}'), ev);
      assert.equal((text.match(/\\N/g) || []).length, 1, `exactly one break: ${ev}`);
      assert.ok(/LINE(\{[^}]*\})?\\N/.test(text), `break after LINE: ${ev}`);
    }
  });

  it('writes a complete script with the preset style line', () => {
    const style = resolveCaptionPreset('think_media', undefined, '1:1');
    const script = buildPresetAssScript([cue], style);
    assert.ok(script.includes('PlayResX: 1080\nPlayResY: 1080'));
    assert.ok(script.includes('; VireoPreset: think_media'));
    const styleLine = script.split('\n').find((l) => l.startsWith('Style: Default,'))!;
    const fields = styleLine.replace('Style: ', '').split(',');
    assert.equal(fields[1], 'Arial');
    assert.equal(fields[15], '3', 'BorderStyle 3 box');
    assert.equal(fields[5], '&H26271811&', 'box colour lives in OutlineColour with alpha');
  });

  it('CaptionService.buildAssScript: preset karaoke vs legacy karaoke', () => {
    const legacy = CaptionService.buildAssScript([cue as any], { style: 'karaoke', timingMode: 'word' });
    assert.ok(legacy.includes('{\\k'), 'legacy karaoke unchanged');
    const preset = CaptionService.buildAssScript([cue as any], { style: 'karaoke', timingMode: 'word', customConfig: { presetId: 'karaoke' } });
    assert.ok(!preset.includes('{\\k'));
    assert.ok(preset.includes('; VireoPreset: karaoke'));
  });
});

describe('Caption presets: preview ↔ export mapping', () => {
  it('preview frame matches the ASS event active at every sampled time', () => {
    const cue = wordCue([['ONE', 0, 0.3], ['TWO', 0.32, 0.7], ['THREE', 1.2, 1.6]]);
    for (const id of ['mozi', 'karaoke', 'popline', 'deep_diver'] as const) {
      const style = resolveCaptionPreset(id);
      const events = buildPresetCueEvents(cue, style);
      const slices = computeCueWordSlices(cue);
      assert.equal(events.length, slices.filter((s) => Math.round(s.start * 100) !== Math.round(s.end * 100)).length);
      for (let t = 0.01; t < 1.6; t += 0.05) {
        const frame = getPreviewFrame(cue, t, style);
        const idx = slices.findIndex((s) => t >= s.start && t < s.end);
        const ev = events[idx];
        const highlightedInAss = frame.words.map((w) =>
          new RegExp(`\\\\c&H00${style.activeColor.slice(5, 7)}${style.activeColor.slice(3, 5)}${style.activeColor.slice(1, 3)}&[^}]*\\}${w.text}`).test(ev) ||
          new RegExp(`\\\\3c&H00${style.activeColor.slice(5, 7)}${style.activeColor.slice(3, 5)}${style.activeColor.slice(1, 3)}&[^}]*\\}${w.text}`).test(ev)
        );
        assert.deepEqual(frame.words.map((w) => w.highlighted || (w.active && !!style.activeWordBox)), highlightedInAss, `${id} t=${t.toFixed(2)} ${ev}`);
      }
    }
  });

  it('pop scale follows the same \\t curve the ASS uses', () => {
    const style = resolveCaptionPreset('youshaei');
    const timing = getPopTiming(style.wordAnimation, 400)!;
    assert.equal(getActiveWordScaleAt(timing, 0), 1);
    assert.ok(Math.abs(getActiveWordScaleAt(timing, timing.upMs - 0.001) - 1.1) < 0.01);
    assert.equal(getActiveWordScaleAt(timing, timing.downMs + 1), 1);
    const [ev] = buildPresetCueEvents(wordCue([['A', 0, 0.4], ['B', 0.4, 0.8]]), style);
    assert.ok(ev.includes(`\\t(0,${timing.upMs},0.5,\\fscx110\\fscy110)\\t(${timing.upMs},${timing.downMs},1.5,\\fscx100\\fscy100)`), ev);

    const hold = getPopTiming(resolveCaptionPreset('beasty').wordAnimation, 400)!;
    assert.equal(getActiveWordScaleAt(hold, 5000), 1.2, 'held pop stays at peak');
  });

  it('CSS uses ASS geometry: em ratio, line height, 2x stroke, hard shadow, margins', () => {
    const style = resolveCaptionPreset('beasty');
    const scale = 360 / 1080;
    const css = getPreviewCss(style, scale);
    const px = (v: number) => `${Number((v * scale).toFixed(3))}px`;
    assert.equal(css.line.fontSize, px(104 * FONT_EM_PER_ASS_SIZE['Arial Black']));
    assert.equal(css.line.lineHeight, px(104));
    assert.equal(css.container.bottom, px(style.marginV));
    assert.equal(css.container.left, px(style.marginL));
    const word = css.word({ text: 'X', highlighted: true, active: true, scale: 1.2, breakAfter: false });
    assert.equal(word.color, '#FFE600');
    assert.equal(word.WebkitTextStroke, `${px(18)} #000000`);
    assert.equal(word.paintOrder, 'stroke fill');
    assert.equal(word.textShadow, `${px(5)} ${px(5)} 0 rgba(0, 0, 0, 0.85)`);
    assert.equal(word.fontSize, px(104 * FONT_EM_PER_ASS_SIZE['Arial Black'] * 1.2));

    const box = getPreviewCss(resolveCaptionPreset('think_media'), scale);
    assert.equal(box.lineBox.padding, px(18));
    assert.equal(box.lineBox.backgroundColor, 'rgba(17, 24, 39, 0.85)');
  });

  it('preview regrouping equals export grouping for the same transcript', () => {
    for (const id of ['beasty', 'mozi', 'simple', 'popline'] as const) {
      const clip = baseClip({ caption_style: id, caption_config: { presetId: id } });
      const exportSide = CaptionService.extractCuesForClipSettings(transcript, clip);
      const previewSource = CaptionService.extractCuesForClipSettings(transcript, clip, undefined, { preserveCase: true });
      const previewSide = regroupCuesForPreset(previewSource.cues, exportSide.preset!);
      assert.deepEqual(
        previewSide.cues.map((c) => [c.start, c.end, c.text]),
        exportSide.cues.map((c) => [c.start, c.end, c.text]),
        id
      );
    }
    const beasty = CaptionService.extractCuesForClipSettings(transcript, baseClip({ caption_style: 'beasty' }));
    assert.ok(beasty.cues.every((c) => (c.words?.length || 0) <= 2));
    assert.equal(beasty.cues[0].text, 'WE MADE');
  });

  it('switching to a sentence-case preset restores original casing in preview cues', () => {
    const clip = baseClip({ caption_style: 'mozi', caption_config: { presetId: 'mozi' } });
    const previewSource = CaptionService.extractCuesForClipSettings(transcript, clip, undefined, { preserveCase: true });
    const simple = regroupCuesForPreset(previewSource.cues, resolveCaptionPreset('simple'));
    assert.equal(simple.cues[0].text.replace('\\N', ' '), 'We made one million dollars today'.split(' ').slice(0, simple.cues[0].words!.length).join(' '));
    assert.ok(simple.cues[0].text.includes('\\N'), 'simple wraps long cues onto two lines');
  });

  it('editor caption settings resolve identically on both sides of the save', () => {
    const item: EditorCaptionItem = {
      ...applyPresetToEditorCaption(undefined, 'popline'),
      highlight_color: '#00AAFF',
      font_family: 'Impact',
      max_lines: 2,
      position: 'top',
    };
    const preview = resolveEditorCaptionStyle(item, '9:16')!;
    const saved = sanitizePresetOverrides(JSON.parse(JSON.stringify(editorCaptionToPresetOverrides(item))));
    const exported = CaptionService.resolveClipPreset('popline', { presetId: 'popline', presetOverrides: saved }, '9:16')!;
    assert.deepEqual(preview, exported);
    assert.equal(exported.fontFamily, 'Arial', 'unsupported editor font falls back the same way in both');
    assert.equal(exported.alignment, 8);
  });

  it('identifies gallery vs legacy editor styles', () => {
    assert.equal(getEditorCaptionPresetId({ style: 'deep_diver' }), 'deep_diver');
    assert.equal(getEditorCaptionPresetId({ style: 'clean' }), null);
    const fresh = applyPresetToEditorCaption({ cues: [], style: 'clean', position: 'center', primary_color: '#000000', highlight_color: '#000000', font_family: 'Impact' }, 'mozi');
    assert.equal(fresh.position, 'center', 'position preference preserved');
    assert.equal(fresh.font_family, undefined, 'stale typography cleared');
    assert.equal(fresh.highlight_color, CAPTION_PRESETS.mozi.colors.active);
  });
});

describe('Caption presets: persistence through updateClipEditorConfig', () => {
  const originalGetClip = ClipRenderService.getClip;
  const originalFrom = dataRepository.from;
  let stored: ClipRecord;

  before(() => {
    stored = baseClip({
      caption_style: 'mozi',
      caption_config: {
        presetId: 'mozi',
        presetOverrides: { fontFamily: 'Arial Black', activeColor: '#111111' },
        caption_overrides: [{ cueId: 'cue-1', text: 'Fixed text' }],
      },
    });
    (ClipRenderService as any).getClip = async () => stored;
    (dataRepository as any).from = (table: string) => {
      assert.equal(table, 'clips');
      let payload: any;
      const q: any = {
        update(p: any) { payload = p; return q; },
        eq() { return q; },
        select() { return q; },
        async single() { stored = { ...stored, ...payload }; return { data: stored, error: null }; },
      };
      return q;
    };
  });

  after(() => {
    (ClipRenderService as any).getClip = originalGetClip;
    (dataRepository as any).from = originalFrom;
  });

  it('saves the stable preset ID, replaces stale preset adjustments and keeps cue corrections', async () => {
    const saved = await ClipRenderService.updateClipEditorConfig(stored.id, 'user-1', {
      captionStyle: 'deep_diver',
      captionEnabled: true,
      captionConfig: { presetId: 'deep_diver', presetOverrides: { textColor: '#ABCDEF', bogus: 1, outlineWidth: 'big' } as any },
    });
    assert.equal(saved.caption_style, 'deep_diver');
    assert.equal(saved.caption_config?.presetId, 'deep_diver');
    assert.deepEqual(saved.caption_config?.presetOverrides, { textColor: '#ABCDEF' });
    assert.deepEqual(saved.caption_config?.caption_overrides, [{ cueId: 'cue-1', text: 'Fixed text' }]);
    const ass = CaptionService.buildAssScript([], { style: saved.caption_style, customConfig: saved.caption_config });
    assert.ok(ass.includes('; VireoPreset: deep_diver'));
  });

  it('drops unknown preset IDs but keeps a valid style', async () => {
    const saved = await ClipRenderService.updateClipEditorConfig(stored.id, 'user-1', {
      captionStyle: 'simple',
      captionConfig: { presetId: 'mrbeast_9000' as any },
    });
    assert.equal(saved.caption_config?.presetId, undefined);
    assert.equal(CaptionService.resolveClipPreset(saved.caption_style, saved.caption_config)?.presetId, 'simple');
  });

  it('still rejects unknown caption styles (existing API behavior)', async () => {
    await assert.rejects(
      ClipRenderService.updateClipEditorConfig(stored.id, 'user-1', { captionStyle: 'sparkles' as any }),
      (err: any) => err.code === 'INVALID_CAPTION_STYLE'
    );
  });

  it('No Caption: captionEnabled=false is saved without touching style or other settings', async () => {
    const before = { ...stored };
    const saved = await ClipRenderService.updateClipEditorConfig(stored.id, 'user-1', { captionEnabled: false });
    assert.equal(saved.caption_enabled, false);
    assert.equal(saved.caption_style, before.caption_style);
    assert.deepEqual(saved.caption_config, before.caption_config);
    assert.equal(saved.aspect_ratio, before.aspect_ratio);
  });

  it('restores the saved preset and No Caption state into a new editor project', () => {
    const project = (ProEditorService as any).buildInitialProject(
      { ...stored, caption_enabled: false, caption_style: 'popline', caption_position: 'top' },
      'user-1',
      null,
      transcript,
      {}
    );
    const track = project.tracks.find((t: any) => t.type === 'CAPTION');
    assert.equal(track.hidden, true);
    assert.equal(track.items[0].caption.style, 'popline');
    assert.equal(track.items[0].caption.position, 'top');
  });
});

describe('Caption presets: real FFmpeg renders', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-presets-'));
  const W = 540;
  const H = 960;

  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  async function renderFrame(ass: string | null, t: number, name: string): Promise<Buffer> {
    const out = path.join(tmp, `${name}.rgb`);
    const vf: string[] = [];
    if (ass) {
      const assPath = path.join(tmp, `${name}.ass`);
      fs.writeFileSync(assPath, ass, 'utf8');
      vf.push(`ass=${assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:')}`);
    }
    vf.push('format=rgb24');
    await execFileAsync(ffmpegBin, [
      '-y', '-f', 'lavfi', '-i', `color=c=0x203040:s=${W}x${H}:d=2:r=25`,
      '-ss', t.toFixed(2), '-vf', vf.join(','), '-frames:v', '1', '-f', 'rawvideo', out,
    ]);
    return fs.readFileSync(out);
  }

  function countNear(buf: Buffer, hex: string, tol = 40): number {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    let n = 0;
    for (let i = 0; i < buf.length; i += 3) {
      if (Math.abs(buf[i] - r) < tol && Math.abs(buf[i + 1] - g) < tol && Math.abs(buf[i + 2] - b) < tol) n++;
    }
    return n;
  }

  const cue = wordCue([['MAKE', 0.1, 0.6], ['MORE', 0.6, 1.1], ['MONEY', 1.1, 1.8]]);

  for (const id of ['mozi', 'popline', 'deep_diver', 'karaoke'] as const) {
    it(`${id}: highlight color is burned in only while a word is active`, async () => {
      const style = resolveCaptionPreset(id);
      const ass = buildPresetAssScript([cue], style);
      const active = await renderFrame(ass, 0.85, `${id}-active`);
      const highlightPx = countNear(active, style.activeColor);
      assert.ok(highlightPx > 150, `${id}: expected highlight pixels, got ${highlightPx}`);
      const textPx = countNear(active, style.textColor, 30);
      assert.ok(textPx > 150, `${id}: expected base text pixels, got ${textPx}`);
      const after = await renderFrame(ass, 1.95, `${id}-after`);
      assert.equal(countNear(after, style.activeColor), 0, `${id}: nothing after the cue ends`);
    });
  }

  it('segment fallback renders text with no highlight color', async () => {
    const style = resolveCaptionPreset('mozi');
    const ass = buildPresetAssScript([{ id: 'c', start: 0, end: 2, text: 'PLAIN SEGMENT' }], style);
    const frame = await renderFrame(ass, 1, 'segment');
    assert.ok(countNear(frame, '#FFFFFF', 30) > 150);
    assert.equal(countNear(frame, style.activeColor), 0);
  });

  it('No Caption renders a clean frame', async () => {
    const frame = await renderFrame(null, 1, 'none');
    assert.equal(countNear(frame, '#FFFFFF', 30), 0);
  });
});
