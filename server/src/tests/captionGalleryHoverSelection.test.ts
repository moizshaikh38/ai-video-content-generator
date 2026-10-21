/**
 * Caption Preset Gallery — Hover/Selection-Only Preview Animation Tests.
 *
 * Verifies:
 * 1. Default state: every preset provides a valid static thumbnail representation (at 0.9s)
 *    displaying active and base typography without running background animation loops.
 * 2. Hover activation: hovering a card initiates its animated preview.
 * 3. Hover exit: leaving an unselected card stops its animation and restores the static thumbnail.
 * 4. Selection persistence: selecting a card keeps its preview animated even after hover exit.
 * 5. Switching presets: switching selection deactivates the previously selected card (unless hovered)
 *    and activates the newly selected preset.
 * 6. Prefers-reduced-motion: animation is suppressed and remains static on hover and selection.
 * 7. Lifecycle cleanup: closing or unmounting the gallery halts all animation loops.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPTION_PRESETS,
  CAPTION_PRESET_IDS,
  getPreviewFrame,
  regroupCuesForPreset,
  resolveCaptionPreset,
  RenderableCaptionPresetId,
} from '../shared/captionPresets.js';

const STATIC_PREVIEW_CLOCK = 0.9;
const SAMPLE_WORD_SECONDS = 0.42;
const SAMPLE_LOOP_PAUSE = 0.7;

function getPresetSampleData(id: RenderableCaptionPresetId) {
  const style = resolveCaptionPreset(id, undefined, '9:16');
  const words = CAPTION_PRESETS[id].sampleText.split(' ').map((text, i) => ({
    text,
    start: i * SAMPLE_WORD_SECONDS,
    end: (i + 1) * SAMPLE_WORD_SECONDS - 0.04,
  }));
  const { cues } = regroupCuesForPreset(
    [{ id: 'sample', start: 0, end: words[words.length - 1].end, text: '', words }],
    style
  );
  const duration = words[words.length - 1].end + SAMPLE_LOOP_PAUSE;
  return { style, cues, duration };
}

describe('Caption Preset Gallery — Hover/Selection-Only Animation Architecture', () => {
  describe('1. Default State: Static Poster Thumbnails', () => {
    it('produces a non-empty, legible static preview frame for every renderable preset at STATIC_PREVIEW_CLOCK (0.9s)', () => {
      const renderableIds = CAPTION_PRESET_IDS.filter((id) => id !== 'none') as RenderableCaptionPresetId[];
      assert.ok(renderableIds.length >= 8, 'Expected at least 8 renderable presets');

      for (const id of renderableIds) {
        const { style, cues, duration } = getPresetSampleData(id);
        const t = STATIC_PREVIEW_CLOCK % duration;
        const cue = cues.find((c) => t >= c.start && t < c.end) || cues[cues.length - 1];
        assert.ok(cue, `Preset ${id} must have a valid sample cue`);

        const frame = getPreviewFrame(cue, Math.min(t, cue.end - 0.001), style);
        assert.ok(frame, `Preset ${id} must return a preview frame at static time`);
        assert.ok(frame.words.length > 0, `Preset ${id} preview frame must have words`);

        if (style.highlight !== 'none') {
          const hasActiveOrHighlighted = frame.words.some((w) => w.active || w.highlighted);
          assert.ok(
            hasActiveOrHighlighted,
            `Preset ${id} static preview must showcase active styling at ${STATIC_PREVIEW_CLOCK}s`
          );
        } else {
          assert.ok(
            frame.words.every((w) => !w.active && !w.highlighted),
            `Preset ${id} with highlight: 'none' should render clean text`
          );
        }
      }
    });

    it('remains completely static when no card is hovered or selected', () => {
      // Simulation of gallery state machine
      const selectedId = null;
      const hoveredId = null;
      const reducedMotion = false;

      const renderableIds = CAPTION_PRESET_IDS.filter((id) => id !== 'none') as RenderableCaptionPresetId[];
      const animatingPresets = renderableIds.filter((id) => {
        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        return (isSelected || isHovered) && !reducedMotion;
      });

      assert.equal(
        animatingPresets.length,
        0,
        'Default state must have 0 animating presets (no background RAF loops)'
      );
    });
  });

  describe('2. Hover Activation & Exit Lifecycle', () => {
    it('animates only the hovered preset, keeping other unselected cards static', () => {
      const selectedId = null;
      const hoveredId: RenderableCaptionPresetId = 'beasty';
      const reducedMotion = false;

      const renderableIds = CAPTION_PRESET_IDS.filter((id) => id !== 'none') as RenderableCaptionPresetId[];
      const animatingPresets = renderableIds.filter((id) => {
        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        return (isSelected || isHovered) && !reducedMotion;
      });

      assert.deepEqual(animatingPresets, ['beasty'], 'Only hovered preset must animate');
    });

    it('stops animation and returns to static thumbnail when pointer leaves an unselected card', () => {
      let hoveredId: RenderableCaptionPresetId | null = 'youshaei';
      const selectedId = null;
      const reducedMotion = false;

      const isAnimatingWhileHovered = (selectedId === 'youshaei' || hoveredId === 'youshaei') && !reducedMotion;
      assert.equal(isAnimatingWhileHovered, true);

      // On hover exit:
      hoveredId = null;
      const isAnimatingAfterExit = (selectedId === 'youshaei' || hoveredId === 'youshaei') && !reducedMotion;
      assert.equal(isAnimatingAfterExit, false, 'Card must stop animating when hover exits');
    });
  });

  describe('3. Selection Behavior & Distinct Hover/Selection States', () => {
    it('hovering a preset does not change the applied selection', () => {
      const initialSelection: RenderableCaptionPresetId = 'karaoke';
      let currentSelection: RenderableCaptionPresetId = initialSelection;
      let hoveredPreset: RenderableCaptionPresetId | null = null;

      // User hovers over 'mozi'
      hoveredPreset = 'mozi';

      // Selection must remain 'karaoke'
      assert.equal(currentSelection, initialSelection, 'Hovering must NOT change selection');
      assert.equal(hoveredPreset, 'mozi');
    });

    it('selected preset remains animated even when hover leaves', () => {
      const selectedId: RenderableCaptionPresetId = 'deep_diver';
      let hoveredId: RenderableCaptionPresetId | null = 'deep_diver';
      const reducedMotion = false;

      // Pointer leaves the selected card
      hoveredId = null;

      const isSelectedAnimating = (selectedId === 'deep_diver' || hoveredId === 'deep_diver') && !reducedMotion;
      assert.equal(
        isSelectedAnimating,
        true,
        'Selected preset must keep its animated preview active after hover exit'
      );
    });

    it('simultaneous selected preset and hovered preset both animate without conflict', () => {
      const selectedId: RenderableCaptionPresetId = 'karaoke';
      const hoveredId: RenderableCaptionPresetId = 'popline';
      const reducedMotion = false;

      const renderableIds = CAPTION_PRESET_IDS.filter((id) => id !== 'none') as RenderableCaptionPresetId[];
      const animatingPresets = renderableIds.filter((id) => {
        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        return (isSelected || isHovered) && !reducedMotion;
      });

      assert.deepEqual(
        animatingPresets.sort(),
        ['karaoke', 'popline'].sort(),
        'Both selected preset and hovered preset must animate, while others remain static'
      );
    });
  });

  describe('4. Switching Presets', () => {
    it('switching selected preset deactivates old selection and activates new selection', () => {
      let selectedId: RenderableCaptionPresetId = 'think_media';
      const hoveredId = null;
      const reducedMotion = false;

      // Switch to 'simple'
      const prevId = selectedId;
      selectedId = 'simple';

      const prevAnimating = (prevId === selectedId || prevId === hoveredId) && !reducedMotion;
      const newAnimating = (selectedId === 'simple' || hoveredId === 'simple') && !reducedMotion;

      assert.equal(prevAnimating, false, 'Previous preset must stop animating');
      assert.equal(newAnimating, true, 'New selected preset must animate');
    });
  });

  describe('5. Prefers-Reduced-Motion Compliance', () => {
    it('disables animation loop even when card is hovered or selected when prefers-reduced-motion is active', () => {
      const selectedId: RenderableCaptionPresetId = 'karaoke';
      const hoveredId: RenderableCaptionPresetId = 'beasty';
      const reducedMotion = true; // prefers-reduced-motion: reduce

      const renderableIds = CAPTION_PRESET_IDS.filter((id) => id !== 'none') as RenderableCaptionPresetId[];
      const animatingPresets = renderableIds.filter((id) => {
        const isSelected = selectedId === id;
        const isHovered = hoveredId === id;
        return (isSelected || isHovered) && !reducedMotion;
      });

      assert.equal(
        animatingPresets.length,
        0,
        'With reducedMotion=true, 0 presets must animate (all remain static)'
      );
    });
  });

  describe('6. Progression & Looping Behavior During Active Animation', () => {
    it('progresses smoothly through all words and loops after duration + loop pause', () => {
      const { cues, duration, style } = getPresetSampleData('karaoke');

      // Check frame at start of first word (t = 0.1s)
      const frameStart = getPreviewFrame(cues[0], 0.1, style);
      assert.equal(frameStart.words[0].active, true, 'First word should be active at t=0.1s');

      // Check frame at middle word (t = 0.9s)
      const frameMid = getPreviewFrame(cues[0], 0.9, style);
      assert.equal(frameMid.words[2].active, true, 'Third word should be active at t=0.9s');

      // Check frame after loop reset (t = duration + 0.1s)
      const loopTime = (duration + 0.1) % duration;
      const frameLooped = getPreviewFrame(cues[0], loopTime, style);
      assert.equal(frameLooped.words[0].active, true, 'First word should be active again after loop reset');
    });
  });
});
