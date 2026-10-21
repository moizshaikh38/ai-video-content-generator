import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PresetImportService } from '../services/presetImportService.js';
import { RecipeService } from '../services/recipeService.js';
import {
  CAPTION_PRESET_IDS,
  CAPTION_PRESETS,
  resolveCaptionPreset,
} from '../shared/captionPresets.js';
import { TimedCaptionCue } from '../types/index.js';

describe('Vireo Caption Preset Normalization & Integration Tests', () => {
  describe('Preset Conversion Engine', () => {
    it('1. converts dictionary preset to native VireoStyleRecipe', () => {
      const converted = PresetImportService.convertDictionaryPreset(
        'pill-test',
        'Violet Pill Test',
        'Test pill caption',
        {
          font_name: 'Montserrat ExtraBold',
          font_size: 44,
          highlight_color: '#7C3AED',
          border_width: 3,
          effect: 'highlight',
          uppercase: true,
          max_chars: 9,
        }
      );

      assert.strictEqual(converted.id, 'vireo-pill-test');
      assert.strictEqual(converted.name, 'Vireo Violet Pill Test');
      assert.strictEqual(converted.typography.fontFamily, 'Arial Black');
      assert.strictEqual(converted.typography.textCase, 'uppercase');
      assert.strictEqual(converted.colors.backgroundPill?.enabled, true);
      assert.strictEqual(converted.colors.backgroundPill?.color, '#7C3AED');
    });

    it('2. converts animation rule to native VireoStyleRecipe', () => {
      const converted = PresetImportService.convertAnimationRule(
        'spring-test',
        'Spring Bounce Test',
        'Test bounce caption',
        {
          fontFamily: 'Arial Black',
          size: 52,
          fill: '#FFFFFF',
          'active-fill': '#FFDF00',
          'active-scale': 1.25,
          'active-response': 'bounce',
          'text-transform': 'uppercase',
          'max-words-per-line': 3,
        }
      );

      assert.strictEqual(converted.id, 'vireo-spring-test');
      assert.strictEqual(converted.name, 'Vireo Spring Bounce Test');
      assert.strictEqual(converted.typography.textCase, 'uppercase');
      assert.strictEqual(converted.animation.preset, 'bounce');
      assert.strictEqual(converted.animation.activeWordScale, 1.25);
      assert.strictEqual(converted.colors.activeWordHighlight, '#FFDF00');
    });
  });

  describe('Recipe Registration (14 Presets)', () => {
    it('1. registers 14 total built-in recipes', () => {
      const recipes = RecipeService.listBuiltInRecipes();
      assert.strictEqual(recipes.length, 14, `Expected 14 recipes, got ${recipes.length}`);
    });

    it('2. loads first batch of 5 Vireo kinetic recipes', async () => {
      const oneword = await RecipeService.loadRecipe('vireo-oneword');
      assert.strictEqual(oneword.id, 'vireo-oneword');
      assert.strictEqual(oneword.positioning.maxWordsPerLine, 1);

      const pillViolet = await RecipeService.loadRecipe('vireo-pill-violet');
      assert.strictEqual(pillViolet.colors.backgroundPill?.enabled, true);

      const limePunch = await RecipeService.loadRecipe('vireo-lime-punch');
      assert.strictEqual(limePunch.colors.activeWordHighlight, '#CCFF00');

      const hormozi = await RecipeService.loadRecipe('vireo-hormozi-reveal');
      assert.strictEqual(hormozi.colors.activeWordHighlight, '#FFE500');

      const clean = await RecipeService.loadRecipe('vireo-clean-minimal');
      assert.strictEqual(clean.positioning.lineBreakMethod, 'balanced');
      assert.strictEqual(clean.colors.outlineWidth, 0);
    });

    it('3. loads second batch of 5 Vireo kinetic recipes', async () => {
      const spring = await RecipeService.loadRecipe('vireo-spring-bounce');
      assert.strictEqual(spring.animation.preset, 'bounce');

      const neon = await RecipeService.loadRecipe('vireo-gradient-neon');
      assert.strictEqual(neon.colors.activeWordHighlight, '#FF007F');

      const capsule = await RecipeService.loadRecipe('vireo-joined-capsule');
      assert.strictEqual(capsule.colors.backgroundPill?.enabled, true);

      const editorial = await RecipeService.loadRecipe('vireo-editorial-track');
      assert.strictEqual(editorial.typography.letterSpacing, 2.5);

      const sweep = await RecipeService.loadRecipe('vireo-subtle-sweep');
      assert.strictEqual(sweep.animation.preset, 'karaoke');
    });
  });

  describe('Shared Preset Gallery & Resolution', () => {
    it('1. includes all 10 Vireo kinetic presets in CAPTION_PRESET_IDS', () => {
      const ids = CAPTION_PRESET_IDS as readonly string[];
      assert.ok(ids.includes('vireo_oneword'));
      assert.ok(ids.includes('vireo_pill'));
      assert.ok(ids.includes('vireo_lime'));
      assert.ok(ids.includes('vireo_hormozi'));
      assert.ok(ids.includes('vireo_clean'));
      assert.ok(ids.includes('vireo_spring'));
      assert.ok(ids.includes('vireo_neon'));
      assert.ok(ids.includes('vireo_capsule'));
      assert.ok(ids.includes('vireo_editorial'));
      assert.ok(ids.includes('vireo_sweep'));
    });

    it('2. resolves styling parameters cleanly for gallery previews', () => {
      const resolved = resolveCaptionPreset('vireo_pill', undefined, '9:16');
      assert.strictEqual(resolved.presetId, 'vireo_pill');
      assert.strictEqual(resolved.fontFamily, 'Arial Black');
      assert.ok(resolved.activeWordBox);
      assert.strictEqual(resolved.activeColor, '#7C3AED');
      assert.strictEqual(resolved.activeWordBox.padding, 16);
    });

    it('3. generates valid ASS script from Vireo kinetic recipe', async () => {
      const recipe = await RecipeService.loadRecipe('vireo-spring-bounce');
      const mockCues: TimedCaptionCue[] = [
        {
          id: 'cue_1',
          start: 0.5,
          end: 1.8,
          text: 'SCALE YOUR CONTENT',
          tokens: [
            { text: 'SCALE', start: 0.5, end: 0.9 },
            { text: 'YOUR', start: 0.9, end: 1.3 },
            { text: 'CONTENT', start: 1.3, end: 1.8 },
          ],
        },
      ];

      const script = RecipeService.generateAssScriptFromRecipe({ cues: mockCues, recipe });
      assert.ok(script.includes('[V4+ Styles]'));
      assert.ok(script.includes('Style: Default,Arial Black,90,'));
      assert.ok(script.includes('\\fscx122\\fscy122'));
    });
  });
});
