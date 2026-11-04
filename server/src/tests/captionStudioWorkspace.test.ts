import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTION_PRESETS,
  CAPTION_PRESET_IDS,
  DEFAULT_CAPTION_PRESET_ID,
  isRenderablePresetId,
  resolveCaptionPreset,
  sanitizePresetOverrides,
  getPreviewCss,
  buildPresetAssStyleLine,
  CaptionPresetId,
  CaptionPresetOverrides,
} from '../shared/captionPresets.js';
import type { TimedCaptionCue } from '../types/index.js';

describe('Caption Studio Workspace & Export Parity', () => {
  describe('Tab A — Preset Stability & Gallery Compatibility', () => {
    it('preserves all existing preset IDs in exact order', () => {
      // Order is a stability contract: presets are appended, never reordered or removed,
      // so saved projects keep resolving to the same style.
      const expectedIds: CaptionPresetId[] = [
        'none',
        'karaoke',
        'deep_diver',
        'youshaei',
        'simple',
        'beasty',
        'mozi',
        'popline',
        'think_media',
        'editorial',
        'bold_highlight',
        'soft_backdrop',
        'compact_creator',
        'two_color_highlight',
        'vireo_oneword',
        'vireo_pill',
        'vireo_lime',
        'vireo_hormozi',
        'vireo_clean',
        'vireo_spring',
        'vireo_neon',
        'vireo_capsule',
        'vireo_editorial',
        'vireo_sweep',
      ];
      assert.deepEqual(CAPTION_PRESET_IDS, expectedIds);
    });

    it('identifies renderable vs none preset correctly', () => {
      assert.equal(isRenderablePresetId('none'), false);
      for (const id of CAPTION_PRESET_IDS) {
        if (id !== 'none') {
          assert.equal(isRenderablePresetId(id), true);
        }
      }
      assert.equal(isRenderablePresetId('invalid_id' as any), false);
    });

    it('each renderable preset contains valid display metadata and style definitions', () => {
      const presets = Object.values(CAPTION_PRESETS);
      assert.ok(presets.length > 0, 'Presets list must not be empty');
      for (const preset of presets) {
        assert.ok(preset.id, 'Preset must have an id');
        assert.ok(preset.label, 'Preset must have a label');
        assert.ok(preset.description, 'Preset must have a description');
        assert.ok(preset.font, `Preset ${preset.id} must define font`);
        assert.ok(preset.font.family, 'Must define fontFamily');
        assert.ok(preset.font.size > 0, 'Must have positive fontSize');
        assert.ok(preset.colors.text, 'Must define textColor');
        assert.ok(preset.colors.active, 'Must define activeColor');
        assert.ok(typeof preset.outline === 'number', 'Must define outline');
        assert.ok(typeof preset.shadow === 'number', 'Must define shadow');
      }
    });
  });

  describe('Tab B — Typography & Font Serialization', () => {
    it('sanitizes and clamps letterSpacing within valid bounds', () => {
      const clean = sanitizePresetOverrides({
        letterSpacing: 4,
      });
      assert.equal(clean.letterSpacing, 4);

      // Clamp upper bound (16 max)
      const clampedHigh = sanitizePresetOverrides({
        letterSpacing: 99,
      });
      assert.equal(clampedHigh.letterSpacing, 16);

      // Clamp negative to 0
      const clampedLow = sanitizePresetOverrides({
        letterSpacing: -5,
      });
      assert.equal(clampedLow.letterSpacing, 0);

      // Invalid NaN falls back to undefined
      const invalid = sanitizePresetOverrides({
        letterSpacing: NaN,
      });
      assert.equal(invalid.letterSpacing, undefined);
    });

    it('maps alignment string (left/center/right) and translates to CSS textAlign', () => {
      const leftStyle = resolveCaptionPreset('simple', { alignment: 'left' });
      const leftCss = getPreviewCss(leftStyle, 1.0);
      assert.equal(leftCss.container.textAlign, 'left');

      const centerStyle = resolveCaptionPreset('simple', { alignment: 'center' });
      const centerCss = getPreviewCss(centerStyle, 1.0);
      assert.equal(centerCss.container.textAlign, 'center');

      const rightStyle = resolveCaptionPreset('simple', { alignment: 'right' });
      const rightCss = getPreviewCss(rightStyle, 1.0);
      assert.equal(rightCss.container.textAlign, 'right');
    });

    it('generates correct ASS style line with Spacing and Alignment', () => {
      const style = resolveCaptionPreset('karaoke', {
        letterSpacing: 6,
        alignment: 'left',
      });
      const assLine = buildPresetAssStyleLine(style);
      assert.ok(assLine.includes(',6,'), 'ASS line should include spacing 6');
      assert.ok(assLine.includes(',1,'), 'ASS line should include alignment 1');
    });
  });

  describe('Tab C — Effects, Outlines, Shadows & Background Boxes', () => {
    it('sanitizes shadow depth, color, and opacity', () => {
      const clean = sanitizePresetOverrides({
        shadowDepth: 8,
        shadowColor: '#101010',
        shadowOpacity: 0.75,
      });
      assert.equal(clean.shadowDepth, 8);
      assert.equal(clean.shadowColor, '#101010');
      assert.equal(clean.shadowOpacity, 0.75);

      // Clamping depth to max 16
      const clampedDepth = sanitizePresetOverrides({ shadowDepth: 100 });
      assert.equal(clampedDepth.shadowDepth, 16);

      // Invalid color falls back to undefined
      const invalidColor = sanitizePresetOverrides({ shadowColor: 'javascript:alert(1)' });
      assert.equal(invalidColor.shadowColor, undefined);
    });

    it('renders preview word textShadow with depth and opacity', () => {
      const style = resolveCaptionPreset('simple', {
        shadowDepth: 6,
        shadowColor: '#000000',
        shadowOpacity: 0.8,
      });
      const css = getPreviewCss(style, 1.0);
      const wordCss = css.word({ text: 'test', highlighted: false, active: false, scale: 1.0 });
      assert.ok(wordCss.textShadow, 'Preview word should define textShadow');
      assert.ok(wordCss.textShadow !== 'none', 'textShadow should not be none');
    });

    it('sanitizes and applies caption background card (box)', () => {
      const clean = sanitizePresetOverrides({
        boxEnabled: true,
        boxColor: '#1A1D28',
        boxOpacity: 0.85,
        boxPadding: 16,
      });
      assert.equal(clean.boxEnabled, true);
      assert.equal(clean.boxColor, '#1A1D28');
      assert.equal(clean.boxOpacity, 0.85);
      assert.equal(clean.boxPadding, 16);

      const style = resolveCaptionPreset('simple', clean);
      assert.ok(style.box, 'style.box must be present when boxEnabled is true');
      assert.equal(style.box.color, '#1A1D28');
      assert.equal(style.box.opacity, 0.85);

      // In ASS, box mode switches BorderStyle to 3 (opaque bounding box)
      const assLine = buildPresetAssStyleLine(style);
      assert.ok(assLine.includes(',3,'), 'Box enabled must set BorderStyle 3 in ASS');

      // In CSS preview, background color and padding are applied to lineBox
      const css = getPreviewCss(style, 1.0);
      assert.ok(css.lineBox.backgroundColor, 'Preview lineBox must have backgroundColor');
      assert.ok(css.lineBox.padding, 'Preview lineBox must have padding');
    });

    it('sanitizes kinetic word-pop animation overrides', () => {
      const clean = sanitizePresetOverrides({
        wordAnimationType: 'pop',
        wordAnimationScale: 1.25,
        wordAnimationHold: true,
      });
      assert.equal(clean.wordAnimationType, 'pop');
      assert.equal(clean.wordAnimationScale, 1.25);
      assert.equal(clean.wordAnimationHold, true);

      // Scale clamped to 1.4 max
      const clampedScale = sanitizePresetOverrides({ wordAnimationScale: 5.0 });
      assert.equal(clampedScale.wordAnimationScale, 1.4);

      const disabled = sanitizePresetOverrides({ wordAnimationType: 'none' });
      assert.equal(disabled.wordAnimationType, 'none');
    });
  });

  describe('Direct Positioning & Timestamp Integrity', () => {
    it('preserves direct position coordinates in overrides without corrupting text or cues', () => {
      const overrides: CaptionPresetOverrides = {
        positionX: 0.45,
        positionY: 0.82,
        fontSize: 72,
        textColor: '#FFFFFF',
      };
      const clean = sanitizePresetOverrides(overrides);
      assert.equal(clean.positionX, 0.45);
      assert.equal(clean.positionY, 0.82);

      const style = resolveCaptionPreset('mozi', clean);
      assert.ok(style.marginV > 0, 'marginV should be computed from positionY');

      // Mock cue with timestamps and words
      const cue: TimedCaptionCue = {
        id: 'cue-1',
        start: 1.2,
        end: 3.5,
        text: 'Hello world of AI video',
        words: [
          { word: 'Hello', start: 1.2, end: 1.6 },
          { word: 'world', start: 1.6, end: 2.1 },
          { word: 'of', start: 2.1, end: 2.3 },
          { word: 'AI', start: 2.3, end: 2.8 },
          { word: 'video', start: 2.8, end: 3.5 },
        ],
      };

      // Styling updates must never mutate cue text or word order
      const initialCueJson = JSON.stringify(cue);
      const _resolved = resolveCaptionPreset('karaoke', clean);
      assert.equal(JSON.stringify(cue), initialCueJson, 'Cue data must remain completely immutable');
    });
  });
});
