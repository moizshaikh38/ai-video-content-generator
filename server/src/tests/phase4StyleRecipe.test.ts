import { describe, it } from 'node:test';
import assert from 'node:assert';
import { RecipeService } from '../services/recipeService.js';
import { VireoStyleRecipe } from '../types/recipe.js';
import { TimedCaptionCue } from '../types/index.js';

describe('Phase 4: Declarative Style Recipes & Kinetic Captions', () => {
  describe('Built-in Recipes & Loading', () => {
    it('1. loads all built-in style recipes successfully', async () => {
      const builtIns = RecipeService.listBuiltInRecipes();
      assert.ok(builtIns.length >= 4, 'Should have at least 4 built-in recipes');

      const hormozi = await RecipeService.loadRecipe('hormozi-punchy');
      assert.strictEqual(hormozi.id, 'hormozi-punchy');
      assert.strictEqual(hormozi.typography.fontFamily, 'Arial Black');
      assert.strictEqual(hormozi.typography.textCase, 'uppercase');

      const mrbeast = await RecipeService.loadRecipe('mrbeast-hyper');
      assert.strictEqual(mrbeast.id, 'mrbeast-hyper');
      assert.strictEqual(mrbeast.animation.preset, 'bounce');

      const aliabdaal = await RecipeService.loadRecipe('aliabdaal-clean');
      assert.strictEqual(aliabdaal.id, 'aliabdaal-clean');
      assert.strictEqual(aliabdaal.colors.backgroundPill?.enabled, true);

      const devTutorial = await RecipeService.loadRecipe('dev-tutorial');
      assert.strictEqual(devTutorial.id, 'dev-tutorial');
      assert.strictEqual(devTutorial.typography.fontFamily, 'DejaVu Sans');
    });

    it('2. throws an error for non-existent recipes', async () => {
      await assert.rejects(
        async () => {
          await RecipeService.loadRecipe('non-existent-recipe-xyz');
        },
        /Recipe not found/
      );
    });
  });

  describe('Validation & Serialization', () => {
    it('1. validates a structurally compliant recipe', () => {
      const validMock: VireoStyleRecipe = {
        id: 'test-recipe',
        name: 'Test Recipe',
        description: 'Test recipe description',
        version: '1.0.0',
        typography: {
          fontFamily: 'Inter',
          fontSize: 70,
          fontWeight: 'bold',
          textCase: 'none',
        },
        positioning: {
          alignment: 2,
          verticalMargin: 220,
          horizontalMargin: 50,
          maxWordsPerLine: 4,
          maxCharsPerLine: 25,
          lineBreakMethod: 'balanced',
        },
        colors: {
          primary: '#FFFFFF',
          activeWordHighlight: '#FFFF00',
          outline: '#000000',
          outlineWidth: 3,
          shadow: '#00000088',
          shadowOffset: 2,
        },
        animation: {
          preset: 'pop',
          durationMs: 150,
        },
        decorations: {
          emojisEnabled: true,
          autoHighlightKeywords: true,
        },
      };

      const result = RecipeService.validateRecipe(validMock);
      assert.strictEqual(result.valid, true);
      assert.ok(result.recipe);
    });

    it('2. rejects recipes with invalid typography, alignment, or animation', () => {
      const invalidMock = {
        id: 'broken-recipe',
        // missing name, version
        typography: {
          fontFamily: 'Inter',
          fontSize: -10, // invalid
        },
        positioning: {
          alignment: 99, // invalid ASS alignment
        },
        colors: {},
        animation: {
          preset: 'unsupported-dance-preset',
        },
      };

      const result = RecipeService.validateRecipe(invalidMock);
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors && result.errors.length >= 4);
    });

    it('3. roundtrips export and import correctly', () => {
      const original = RecipeService.listBuiltInRecipes()[0];
      const exportedJson = RecipeService.exportRecipe(original);
      assert.ok(typeof exportedJson === 'string');

      const imported = RecipeService.importRecipe(exportedJson);
      assert.strictEqual(imported.id, original.id);
      assert.strictEqual(imported.typography.fontSize, original.typography.fontSize);
      assert.strictEqual(imported.colors.activeWordHighlight, original.colors.activeWordHighlight);
    });
  });

  describe('ASS Color Conversion & Style Generation', () => {
    it('1. converts Hex colors to ASS &HAABBGGRR& format accurately', () => {
      // #FFFFFF -> &H00FFFFFF&
      const whiteAss = RecipeService.hexToAssColor('#FFFFFF');
      assert.strictEqual(whiteAss, '&H00FFFFFF&');

      // #FF0000 (Pure Red) -> ASS is BBGGRR so BB=00, GG=00, RR=FF -> &H000000FF&
      const redAss = RecipeService.hexToAssColor('#FF0000');
      assert.strictEqual(redAss, '&H000000FF&');

      // #00FF00 (Pure Green) -> BB=00, GG=FF, RR=00 -> &H0000FF00&
      const greenAss = RecipeService.hexToAssColor('#00FF00');
      assert.strictEqual(greenAss, '&H0000FF00&');

      // #0000FF (Pure Blue) -> BB=FF, GG=00, RR=00 -> &H00FF0000&
      const blueAss = RecipeService.hexToAssColor('#0000FF');
      assert.strictEqual(blueAss, '&H00FF0000&');
    });

    it('2. generates compliant ASS [V4+ Styles] Style line', async () => {
      const recipe = await RecipeService.loadRecipe('hormozi-punchy');
      const styleLine = RecipeService.recipeToAssStyle(recipe, 'Default');

      assert.ok(styleLine.startsWith('Style: Default,Arial Black,82,'));
      assert.ok(styleLine.includes(',-1,0,0,0,100,100,1,0,1,5,3,2,60,60,260,1'));
    });

    it('3. enables BorderStyle 3 when background pill is configured', async () => {
      const pillRecipe = await RecipeService.loadRecipe('aliabdaal-clean');
      const styleLine = RecipeService.recipeToAssStyle(pillRecipe, 'Default');

      // BorderStyle is the 16th field, which should be 3 for opaque box/pill
      assert.ok(styleLine.includes(',3,2,0,2,80,80,240,1'));
    });
  });

  describe('ASS Script Generation with Kinetic Tags', () => {
    const mockCues: TimedCaptionCue[] = [
      {
        id: 'cue_1',
        start: 1.25,
        end: 2.75,
        text: 'Stop wasting time',
        tokens: [
          { text: 'Stop', start: 1.25, end: 1.65 },
          { text: 'wasting', start: 1.65, end: 2.15 },
          { text: 'time', start: 2.15, end: 2.75 },
        ],
      },
    ];

    it('1. formats karaoke script with {\\k<centis>} tags', async () => {
      const recipe = await RecipeService.loadRecipe('aliabdaal-clean');
      const script = RecipeService.generateAssScriptFromRecipe({
        cues: mockCues,
        recipe,
        playResX: 1080,
        playResY: 1920,
      });

      assert.ok(script.includes('[Script Info]'));
      assert.ok(script.includes('PlayResX: 1080'));
      assert.ok(script.includes('PlayResY: 1920'));
      assert.ok(script.includes('[Events]'));
      assert.ok(script.includes('Dialogue: 0,0:00:01.25,0:00:02.75,Default,,0,0,0,,'));
      // Expect {\k40}Stop {\k50}wasting {\k60}time
      assert.ok(script.includes('{\\k40}Stop {\\k50}wasting {\\k60}time'));
    });

    it('2. formats kinetic pop/bounce script with active word highlight tags', async () => {
      const recipe = await RecipeService.loadRecipe('hormozi-punchy');
      const script = RecipeService.generateAssScriptFromRecipe({
        cues: mockCues,
        recipe,
      });

      assert.ok(script.includes('Dialogue: 0,0:00:01.25,0:00:02.75,Default,,0,0,0,,'));
      // In hormozi punchy: text is uppercased, with yellow active word highlight & scale
      assert.ok(script.includes('STOP'));
      assert.ok(script.includes('WASTING'));
      assert.ok(script.includes('TIME'));
      assert.ok(script.includes('\\fscx118\\fscy118'));
    });
  });
});
