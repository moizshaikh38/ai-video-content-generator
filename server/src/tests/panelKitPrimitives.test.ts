/**
 * Panel kit invariants.
 *
 * Two things this guards:
 *  1. panelTokens.ts stays dependency-free, so it remains the single importable home for every
 *     panel class recipe (and stays testable from this runner).
 *  2. The caption preset groups partition CAPTION_PRESET_IDS exactly once — adding a preset
 *     upstream without grouping it would otherwise make it silently unreachable in the gallery.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { CAPTION_PRESET_IDS } from '../shared/captionPresets.js';
import {
  CAPTION_PRESET_GROUPS,
  GROUPED_PRESET_ORDER,
  NO_CAPTION_PRESET_ID,
  defaultOpenGroupId,
  findPresetGroupId,
} from '../../../src/lib/captionPresetGroups.js';
import * as tokens from '../../../src/components/editor/panelKit/panelTokens.js';

const projectRoot = path.resolve(process.cwd(), process.cwd().endsWith('server') ? '..' : '.');
const tokensPath = path.join(projectRoot, 'src/components/editor/panelKit/panelTokens.ts');

describe('panelTokens', () => {
  it('is dependency-free so it stays the single shared source of class recipes', () => {
    const src = fs.readFileSync(tokensPath, 'utf8');
    const importLines = src.split('\n').filter((l) => /^\s*import\s/.test(l));
    assert.deepEqual(importLines, [], 'panelTokens.ts must not import anything');
  });

  it('exports the recipes every panel needs', () => {
    for (const name of [
      'PANEL_SHELL', 'PANEL_SURFACE', 'PANEL_HEADER', 'PANEL_BODY', 'PANEL_TOOLBAR',
      'CARD', 'CARD_HOVER', 'CARD_SELECTED',
      'TILE', 'TILE_MEDIA', 'TILE_CAPTION', 'TILE_SKELETON',
      'ROW', 'ROW_ACTIVE', 'ROW_ICON',
      'SECTION_LABEL', 'SECTION_TRIGGER', 'SECTION_SUMMARY',
      'FIELD', 'FIELD_HEADER', 'FIELD_INPUT',
      'SEGMENTED_GROUP', 'SWATCH', 'TONE', 'BADGE',
      'STATE_WRAP', 'ACTION_PRIMARY', 'ACTION_GHOST',
    ]) {
      assert.ok(name in tokens, `missing export: ${name}`);
    }
  });

  it('keeps the radius scale to two container values', () => {
    const all = Object.values(tokens)
      .filter((v): v is string => typeof v === 'string')
      .join(' ');
    // `rounded-full` is allowed for dots/pills; `rounded-md`/`rounded-2xl`/bare `rounded` are not.
    assert.ok(!/\brounded-md\b/.test(all), 'rounded-md is outside the scale');
    assert.ok(!/\brounded-2xl\b/.test(all), 'rounded-2xl is outside the scale');
    assert.ok(!/\brounded(?![-a-z])/.test(all), 'bare `rounded` is outside the scale');
  });

  it('uses literal tone classes (Tailwind JIT cannot see interpolated names)', () => {
    const src = fs.readFileSync(tokensPath, 'utf8');
    assert.ok(!/\$\{[^}]*\}/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'no template interpolation in class strings');
    for (const tone of ['neutral', 'ai', 'success', 'warning']) {
      assert.ok(tone in tokens.TONE, `TONE missing ${tone}`);
    }
  });

  it('uses the vc-* token scale, not hardcoded panel hexes', () => {
    const all = Object.values(tokens)
      .filter((v): v is string => typeof v === 'string')
      .join(' ');
    assert.ok(/bg-vc-surface2/.test(all), 'cards should sit on the vc surface scale');
    assert.ok(!/#0E1017|#07080D|#0B0D14/.test(all), 'must not reintroduce legacy panel hexes');
  });
});

describe('caption preset groups', () => {
  const renderable = CAPTION_PRESET_IDS.filter((id) => id !== NO_CAPTION_PRESET_ID);

  it('partitions every renderable preset exactly once', () => {
    const grouped = [...GROUPED_PRESET_ORDER].sort();
    const expected = [...renderable].sort();
    assert.deepEqual(grouped, expected, 'every renderable preset must appear in exactly one group');
    assert.equal(new Set(GROUPED_PRESET_ORDER).size, GROUPED_PRESET_ORDER.length, 'no duplicates');
  });

  it('excludes the "none" preset from the style groups', () => {
    assert.ok(!GROUPED_PRESET_ORDER.includes(NO_CAPTION_PRESET_ID));
  });

  it('gives every group a label and a hint', () => {
    for (const g of CAPTION_PRESET_GROUPS) {
      assert.ok(g.label && g.hint && g.presetIds.length > 0, `group ${g.id} incomplete`);
    }
  });

  it('resolves a preset back to its group', () => {
    assert.equal(findPresetGroupId('beasty'), 'high_energy');
    assert.equal(findPresetGroupId('karaoke'), 'word_by_word');
    assert.equal(findPresetGroupId('nope'), undefined);
  });

  it('opens the group containing the active preset, else the first', () => {
    assert.equal(defaultOpenGroupId('vireo_neon'), 'neon');
    assert.equal(defaultOpenGroupId(null), CAPTION_PRESET_GROUPS[0].id);
    assert.equal(defaultOpenGroupId('unknown'), CAPTION_PRESET_GROUPS[0].id);
  });
});
