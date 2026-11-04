/**
 * VireoClip Recipe Service
 *
 * Implements Phase 4: Declarative Style Recipes & Kinetic Captions.
 * Provides validation, loading, import/export, and ASS generation for .vrecipe.json specs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VireoStyleRecipe,
  RecipeFontWeight,
  RecipeTextCase,
  RecipeAnimationPreset,
  RecipeLineBreakMethod,
} from '../types/recipe.js';
import { TimedCaptionCue } from '../types/index.js';
import { CaptionService } from './captionService.js';
import { logger } from '../utils/logger.js';

// Pre-bundled fallback recipes in memory
import hormoziJson from '../recipes/hormozi-punchy.vrecipe.json' with { type: 'json' };
import mrbeastJson from '../recipes/mrbeast-hyper.vrecipe.json' with { type: 'json' };
import aliabdaalJson from '../recipes/aliabdaal-clean.vrecipe.json' with { type: 'json' };
import devTutorialJson from '../recipes/dev-tutorial.vrecipe.json' with { type: 'json' };

// Vireo Kinetic Caption Recipes
import vireoOneWordJson from '../recipes/vireo-oneword.vrecipe.json' with { type: 'json' };
import vireoPillVioletJson from '../recipes/vireo-pill-violet.vrecipe.json' with { type: 'json' };
import vireoLimePunchJson from '../recipes/vireo-lime-punch.vrecipe.json' with { type: 'json' };
import vireoHormoziRevealJson from '../recipes/vireo-hormozi-reveal.vrecipe.json' with { type: 'json' };
import vireoCleanMinimalJson from '../recipes/vireo-clean-minimal.vrecipe.json' with { type: 'json' };
import vireoSpringBounceJson from '../recipes/vireo-spring-bounce.vrecipe.json' with { type: 'json' };
import vireoGradientNeonJson from '../recipes/vireo-gradient-neon.vrecipe.json' with { type: 'json' };
import vireoJoinedCapsuleJson from '../recipes/vireo-joined-capsule.vrecipe.json' with { type: 'json' };
import vireoEditorialTrackJson from '../recipes/vireo-editorial-track.vrecipe.json' with { type: 'json' };
import vireoSubtleSweepJson from '../recipes/vireo-subtle-sweep.vrecipe.json' with { type: 'json' };

const BUILT_IN_RECIPES: Record<string, VireoStyleRecipe> = {
  // Classic Built-ins
  'hormozi-punchy': hormoziJson as VireoStyleRecipe,
  'mrbeast-hyper': mrbeastJson as VireoStyleRecipe,
  'aliabdaal-clean': aliabdaalJson as VireoStyleRecipe,
  'dev-tutorial': devTutorialJson as VireoStyleRecipe,

  // Vireo Kinetic Presets
  'vireo-oneword': (vireoOneWordJson as unknown) as VireoStyleRecipe,
  'vireo-pill-violet': (vireoPillVioletJson as unknown) as VireoStyleRecipe,
  'vireo-lime-punch': (vireoLimePunchJson as unknown) as VireoStyleRecipe,
  'vireo-hormozi-reveal': (vireoHormoziRevealJson as unknown) as VireoStyleRecipe,
  'vireo-clean-minimal': (vireoCleanMinimalJson as unknown) as VireoStyleRecipe,
  'vireo-spring-bounce': (vireoSpringBounceJson as unknown) as VireoStyleRecipe,
  'vireo-gradient-neon': (vireoGradientNeonJson as unknown) as VireoStyleRecipe,
  'vireo-joined-capsule': (vireoJoinedCapsuleJson as unknown) as VireoStyleRecipe,
  'vireo-editorial-track': (vireoEditorialTrackJson as unknown) as VireoStyleRecipe,
  'vireo-subtle-sweep': (vireoSubtleSweepJson as unknown) as VireoStyleRecipe,
};

export class RecipeService {
  /**
   * Converts a standard Hex color (#RGB, #RRGGBB, #AARRGGBB, or #RRGGBBAA)
   * into an ASS subtitle color string format: &HAABBGGRR&.
   * Note: In ASS, alpha &H00 is fully opaque, and &HFF is fully transparent.
   */
  public static hexToAssColor(hex: string, defaultAlpha = '00'): string {
    if (!hex || typeof hex !== 'string') return `&H${defaultAlpha}FFFFFF&`;

    let clean = hex.replace('#', '').trim();
    if (clean.length === 3) {
      // #RGB -> #RRGGBB
      clean = clean.split('').map((c) => c + c).join('');
    }

    let r = 'FF';
    let g = 'FF';
    let b = 'FF';
    let a = defaultAlpha;

    if (clean.length === 6) {
      // RRGGBB
      r = clean.substring(0, 2);
      g = clean.substring(2, 4);
      b = clean.substring(4, 6);
    } else if (clean.length === 8) {
      // Check if #AARRGGBB or #RRGGBBAA
      // If leading alpha is typically 00/FF, treat as RRGGBBAA if trailing alpha
      r = clean.substring(0, 2);
      g = clean.substring(2, 4);
      b = clean.substring(4, 6);
      const hexAlpha = parseInt(clean.substring(6, 8), 16);
      // ASS alpha is inverted: 00 = opaque, FF = transparent
      const assAlpha = Math.max(0, Math.min(255, 255 - hexAlpha));
      a = assAlpha.toString(16).padStart(2, '0').toUpperCase();
    }

    return `&H${a.toUpperCase()}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}&`;
  }

  /**
   * Formats seconds into ASS timestamp string: H:MM:SS.cc (centiseconds)
   */
  public static formatAssTimestamp(seconds: number): string {
    const s = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);
    const centis = Math.floor((s - Math.floor(s)) * 100);

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
  }

  /**
   * Applies recipe text casing
   */
  public static applyTextCase(text: string, textCase: RecipeTextCase): string {
    if (!text) return '';
    switch (textCase) {
      case 'uppercase':
        return text.toUpperCase();
      case 'lowercase':
        return text.toLowerCase();
      case 'titlecase':
        return text.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase());
      case 'none':
      default:
        return text;
    }
  }

  /**
   * Lists all available built-in style recipes
   */
  public static listBuiltInRecipes(): VireoStyleRecipe[] {
    return Object.values(BUILT_IN_RECIPES);
  }

  /**
   * Retrieves a recipe by ID (e.g. 'hormozi-punchy') or file path
   */
  public static async loadRecipe(idOrPath: string): Promise<VireoStyleRecipe> {
    if (BUILT_IN_RECIPES[idOrPath]) {
      return BUILT_IN_RECIPES[idOrPath];
    }

    // Try reading from file path
    const resolvedPath = path.isAbsolute(idOrPath)
      ? idOrPath
      : path.resolve(process.cwd(), idOrPath);

    if (fs.existsSync(resolvedPath)) {
      const content = await fs.promises.readFile(resolvedPath, 'utf-8');
      return RecipeService.importRecipe(content);
    }

    throw new Error(`Recipe not found: "${idOrPath}"`);
  }

  /**
   * Validates a JSON object against the VireoStyleRecipe specification
   */
  public static validateRecipe(json: unknown): {
    valid: boolean;
    errors?: string[];
    recipe?: VireoStyleRecipe;
  } {
    const errors: string[] = [];
    if (!json || typeof json !== 'object') {
      return { valid: false, errors: ['Recipe must be a non-null object'] };
    }

    const r = json as Record<string, any>;

    if (!r.id || typeof r.id !== 'string') errors.push('Missing or invalid recipe "id"');
    if (!r.name || typeof r.name !== 'string') errors.push('Missing or invalid recipe "name"');
    if (!r.version || typeof r.version !== 'string') errors.push('Missing or invalid recipe "version"');

    // Typography validation
    if (!r.typography || typeof r.typography !== 'object') {
      errors.push('Missing "typography" configuration');
    } else {
      if (!r.typography.fontFamily || typeof r.typography.fontFamily !== 'string') {
        errors.push('typography.fontFamily must be a string');
      }
      if (typeof r.typography.fontSize !== 'number' || r.typography.fontSize <= 0) {
        errors.push('typography.fontSize must be a positive number');
      }
    }

    // Positioning validation
    if (!r.positioning || typeof r.positioning !== 'object') {
      errors.push('Missing "positioning" configuration');
    } else {
      if (typeof r.positioning.alignment !== 'number' || r.positioning.alignment < 1 || r.positioning.alignment > 9) {
        errors.push('positioning.alignment must be an integer between 1 and 9 (numpad layout)');
      }
      if (typeof r.positioning.maxWordsPerLine !== 'number' || r.positioning.maxWordsPerLine <= 0) {
        errors.push('positioning.maxWordsPerLine must be a positive number');
      }
    }

    // Colors validation
    if (!r.colors || typeof r.colors !== 'object') {
      errors.push('Missing "colors" configuration');
    } else {
      if (!r.colors.primary || typeof r.colors.primary !== 'string') {
        errors.push('colors.primary must be a hex color string');
      }
      if (!r.colors.activeWordHighlight || typeof r.colors.activeWordHighlight !== 'string') {
        errors.push('colors.activeWordHighlight must be a hex color string');
      }
    }

    // Animation validation
    if (!r.animation || typeof r.animation !== 'object') {
      errors.push('Missing "animation" configuration');
    } else {
      const validPresets: RecipeAnimationPreset[] = ['pop', 'fade', 'bounce', 'karaoke', 'slide', 'none'];
      if (!validPresets.includes(r.animation.preset)) {
        errors.push(`animation.preset must be one of: ${validPresets.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true, recipe: r as VireoStyleRecipe };
  }

  /**
   * Serializes a recipe into a clean JSON string
   */
  public static exportRecipe(recipe: VireoStyleRecipe): string {
    const validation = RecipeService.validateRecipe(recipe);
    if (!validation.valid) {
      throw new Error(`Cannot export invalid recipe: ${validation.errors?.join(', ')}`);
    }
    return JSON.stringify(recipe, null, 2);
  }

  /**
   * Deserializes and validates a JSON string into a VireoStyleRecipe
   */
  public static importRecipe(jsonStr: string): VireoStyleRecipe {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(`Failed to parse recipe JSON: ${(e as Error).message}`);
    }

    const validation = RecipeService.validateRecipe(parsed);
    if (!validation.valid || !validation.recipe) {
      throw new Error(`Recipe validation failed: ${validation.errors?.join(', ')}`);
    }

    return validation.recipe;
  }

  /**
   * Generates the ASS [V4+ Styles] Style line for the recipe
   */
  public static recipeToAssStyle(recipe: VireoStyleRecipe, styleName = 'Default'): string {
    const fontName = CaptionService.validateFontFamily(recipe.typography.fontFamily);
    const fontSize = Math.round(recipe.typography.fontSize);
    const primaryColor = RecipeService.hexToAssColor(recipe.colors.primary);
    const secondaryColor = RecipeService.hexToAssColor(recipe.colors.secondary || '#CCCCCC');
    const outlineColor = RecipeService.hexToAssColor(recipe.colors.outline || '#000000');
    
    // Background / Shadow color
    const isPill = recipe.colors.backgroundPill?.enabled;
    const backColor = isPill
      ? RecipeService.hexToAssColor(recipe.colors.backgroundPill!.color)
      : RecipeService.hexToAssColor(recipe.colors.shadow || '#00000088');

    const bold = ['bold', 'extra-bold', 'black'].includes(recipe.typography.fontWeight) ? -1 : 0;
    const italic = 0;
    const underline = 0;
    const strikeOut = 0;
    const scaleX = 100;
    const scaleY = 100;
    const spacing = recipe.typography.letterSpacing ?? 0;
    const angle = 0;
    
    // BorderStyle: 1 = outline + drop shadow, 3 = opaque box (pill)
    const borderStyle = isPill ? 3 : 1;
    const outline = recipe.colors.outlineWidth ?? 2;
    const shadow = isPill ? 0 : (recipe.colors.shadowOffset ?? 2);
    const alignment = recipe.positioning.alignment ?? 2;
    const marginL = recipe.positioning.horizontalMargin ?? 60;
    const marginR = recipe.positioning.horizontalMargin ?? 60;
    const marginV = recipe.positioning.verticalMargin ?? 240;

    return `Style: ${styleName},${fontName},${fontSize},${primaryColor},${secondaryColor},${outlineColor},${backColor},${bold},${italic},${underline},${strikeOut},${scaleX},${scaleY},${spacing},${angle},${borderStyle},${outline},${shadow},${alignment},${marginL},${marginR},${marginV},1`;
  }

  /**
   * Generates a complete ASS subtitle script adhering to the declarative recipe
   */
  public static generateAssScriptFromRecipe(params: {
    cues: TimedCaptionCue[];
    recipe: VireoStyleRecipe;
    playResX?: number;
    playResY?: number;
  }): string {
    const { cues, recipe, playResX = 1080, playResY = 1920 } = params;

    const highlightColorAss = RecipeService.hexToAssColor(recipe.colors.activeWordHighlight);
    const primaryColorAss = RecipeService.hexToAssColor(recipe.colors.primary);

    const styleLine = RecipeService.recipeToAssStyle(recipe, 'Default');

    const lines: string[] = [
      '[Script Info]',
      `Title: VireoClip Recipe - ${recipe.name}`,
      'ScriptType: v4.00+',
      `PlayResX: ${playResX}`,
      `PlayResY: ${playResY}`,
      'ScaledBorderAndShadow: yes',
      'WrapStyle: 2',
      '',
      '[V4+ Styles]',
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
      styleLine,
      '',
      '[Events]',
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ];

    for (const cue of cues) {
      const start = RecipeService.formatAssTimestamp(cue.start);
      const end = RecipeService.formatAssTimestamp(cue.end);

      let dialogueText = '';

      if (recipe.animation.preset === 'karaoke' && cue.tokens && cue.tokens.length > 0) {
        // Karaoke timing mode with {\k<centiseconds>}
        dialogueText = cue.tokens
          .map((token) => {
            const durationCentis = Math.max(1, Math.round((token.end - token.start) * 100));
            const casedText = RecipeService.applyTextCase(token.text, recipe.typography.textCase);
            const sanitized = CaptionService.sanitizeAssText(casedText);
            return `{\\k${durationCentis}}${sanitized}`;
          })
          .join(' ');
      } else if (
        (recipe.animation.preset === 'pop' || recipe.animation.preset === 'bounce') &&
        cue.tokens &&
        cue.tokens.length > 0
      ) {
        // Active word kinetic emphasis
        dialogueText = cue.tokens
          .map((token) => {
            const casedText = RecipeService.applyTextCase(token.text, recipe.typography.textCase);
            const sanitized = CaptionService.sanitizeAssText(casedText);
            // Highlight active word tag
            const scale = recipe.animation.activeWordScale
              ? `\\fscx${Math.round(recipe.animation.activeWordScale * 100)}\\fscy${Math.round(recipe.animation.activeWordScale * 100)}`
              : '';
            return `{\\c${highlightColorAss}${scale}}${sanitized}{\\c${primaryColorAss}\\fscx100\\fscy100}`;
          })
          .join(' ');
      } else {
        // Standard formatted text
        const casedText = RecipeService.applyTextCase(cue.text, recipe.typography.textCase);
        dialogueText = CaptionService.sanitizeAssText(casedText);
      }

      lines.push(`Dialogue: 0,${start},${end},Default,,0,0,0,,${dialogueText}`);
    }

    return lines.join('\n');
  }
}
