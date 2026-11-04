/**
 * VireoClip Caption Preset Normalization & Conversion Service
 *
 * Converts external caption dictionary presets and fine-caption animation rules
 * into native VireoClip .vrecipe.json specs and shared/captionPresets.ts definitions.
 */

import { VireoStyleRecipe, RecipeAnimationPreset } from '../types/recipe.js';
import { CaptionService } from './captionService.js';

export interface VireoRawCaptionPreset {
  font_name: string;
  font_size: number;
  font_color?: string;
  highlight_color?: string;
  border_width?: number;
  border_color?: string;
  shadow?: number;
  effect?: 'pop' | 'highlight' | 'none';
  uppercase?: boolean;
  max_chars?: number;
  reveal?: boolean;
  base_opacity?: number;
  bg_opacity?: number;
  max_duration?: number;
}

export interface VireoRawAnimationRule {
  fontFamily?: string;
  size: number;
  fill: string;
  'active-fill'?: string;
  'active-box'?: 'off' | 'current' | 'trail';
  'active-box-background'?: string;
  'active-box-border-color'?: string;
  'active-box-border-width'?: number;
  'active-box-radius'?: number;
  'stroke-color'?: string;
  'stroke-width'?: number;
  'shadow-color'?: string;
  'shadow-blur'?: number;
  'active-scale'?: number;
  'active-response'?: string;
  'text-transform'?: 'none' | 'uppercase' | 'lowercase';
  'max-words-per-line'?: number;
  align?: 'left' | 'center' | 'right';
  karaoke?: 'off' | 'current' | 'trail';
  'gradient-from'?: string;
  'gradient-to'?: string;
  'letter-spacing'?: number;
}

// Type aliases for seamless compatibility
export type OpenShortsRawPreset = VireoRawCaptionPreset;
export type HypitFineCaptionRule = VireoRawAnimationRule;

export class PresetImportService {
  /**
   * Normalizes arbitrary font family strings to supported SafeFontFamily
   */
  public static mapFont(rawFont: string): string {
    const clean = (rawFont || '').trim();
    if (clean.includes('Montserrat') || clean.includes('Arial Black') || clean.includes('Anton') || clean.includes('Impact')) {
      return 'Arial Black';
    }
    if (clean.includes('Inter') || clean.includes('Roboto') || clean.includes('Verdana')) {
      return 'Inter';
    }
    return CaptionService.validateFontFamily(clean);
  }

  /**
   * Converts dictionary preset to native VireoStyleRecipe
   */
  public static convertDictionaryPreset(
    id: string,
    name: string,
    description: string,
    raw: VireoRawCaptionPreset
  ): VireoStyleRecipe {
    const fontName = this.mapFont(raw.font_name);
    const isOneWord = raw.max_chars === 1;

    let animPreset: RecipeAnimationPreset = 'pop';
    if (raw.effect === 'highlight') animPreset = 'karaoke';
    else if (raw.effect === 'none') animPreset = 'none';

    const isPill = raw.effect === 'highlight' && raw.highlight_color;

    return {
      $schema: 'https://vireoclip.ai/schemas/vrecipe-v1.json',
      id: `vireo-${id}`,
      name: `Vireo ${name}`,
      description,
      version: '1.0.0',
      author: 'VireoClip Native',
      typography: {
        fontFamily: fontName,
        fontSize: Math.round(raw.font_size * 1.8), // Scale from 720p base to 1080p ASS
        fontWeight: isOneWord || raw.font_name.includes('ExtraBold') ? 'black' : 'bold',
        letterSpacing: isOneWord ? 2 : 0,
        textCase: raw.uppercase ? 'uppercase' : 'none',
      },
      positioning: {
        alignment: 2,
        verticalMargin: isOneWord ? 320 : 260,
        horizontalMargin: 60,
        maxWordsPerLine: isOneWord ? 1 : Math.max(2, Math.round((raw.max_chars || 12) / 4)),
        maxCharsPerLine: raw.max_chars || 16,
        lineBreakMethod: isOneWord ? 'single' : 'balanced',
      },
      colors: {
        primary: raw.font_color || '#FFFFFF',
        secondary: raw.base_opacity && raw.base_opacity < 1 ? '#B0B0B0' : '#CCCCCC',
        activeWordHighlight: raw.highlight_color || '#FFE500',
        outline: raw.border_color || '#000000',
        outlineWidth: raw.border_width ?? 4,
        shadow: raw.shadow ? '#00000099' : '#00000000',
        shadowOffset: raw.shadow ?? 0,
        backgroundPill: isPill
          ? {
              enabled: true,
              color: raw.highlight_color!,
              paddingX: 18,
              paddingY: 8,
              borderRadius: 8,
            }
          : undefined,
      },
      animation: {
        preset: animPreset,
        durationMs: 140,
        activeWordScale: isOneWord ? 1.05 : 1.15,
        karaokeEffect: raw.reveal ? 'sweep' : 'jump',
      },
      decorations: {
        emojisEnabled: true,
        autoHighlightKeywords: true,
      },
    };
  }

  /** Alias for backward compatibility */
  public static convertOpenShortsPreset(
    id: string,
    name: string,
    description: string,
    raw: VireoRawCaptionPreset
  ): VireoStyleRecipe {
    return this.convertDictionaryPreset(id, name, description, raw);
  }

  /**
   * Converts fine-caption animation rule to native VireoStyleRecipe
   */
  public static convertAnimationRule(
    id: string,
    name: string,
    description: string,
    raw: VireoRawAnimationRule
  ): VireoStyleRecipe {
    const fontName = this.mapFont(raw.fontFamily || 'Inter');
    const isPill = raw['active-box'] === 'current' || raw['active-box'] === 'trail';

    let animPreset: RecipeAnimationPreset = 'pop';
    if (raw['active-response'] === 'bounce' || raw['active-response'] === 'spring') {
      animPreset = 'bounce';
    } else if (raw.karaoke === 'current' || raw.karaoke === 'trail') {
      animPreset = 'karaoke';
    }

    return {
      $schema: 'https://vireoclip.ai/schemas/vrecipe-v1.json',
      id: `vireo-${id}`,
      name: `Vireo ${name}`,
      description,
      version: '1.0.0',
      author: 'VireoClip Native',
      typography: {
        fontFamily: fontName,
        fontSize: Math.round(raw.size * 1.6),
        fontWeight: 'bold',
        letterSpacing: raw['letter-spacing'] ?? 0,
        textCase: raw['text-transform'] === 'uppercase' ? 'uppercase' : 'none',
      },
      positioning: {
        alignment: raw.align === 'left' ? 1 : raw.align === 'right' ? 3 : 2,
        verticalMargin: 240,
        horizontalMargin: 70,
        maxWordsPerLine: raw['max-words-per-line'] || 4,
        maxCharsPerLine: (raw['max-words-per-line'] || 4) * 6,
        lineBreakMethod: 'balanced',
      },
      colors: {
        primary: raw.fill,
        secondary: '#94A3B8',
        activeWordHighlight: raw['active-fill'] || raw['gradient-from'] || '#FFE600',
        outline: raw['stroke-color'] || '#000000',
        outlineWidth: raw['stroke-width'] ?? 3,
        shadow: raw['shadow-color'] || '#00000066',
        shadowOffset: raw['shadow-blur'] ? Math.round(raw['shadow-blur'] / 2) : 2,
        backgroundPill: isPill
          ? {
              enabled: true,
              color: raw['active-box-background'] || '#0F172AEE',
              paddingX: 16,
              paddingY: 8,
              borderRadius: raw['active-box-radius'] || 8,
            }
          : undefined,
      },
      animation: {
        preset: animPreset,
        durationMs: 160,
        activeWordScale: raw['active-scale'] ?? 1.15,
        karaokeEffect: raw.karaoke === 'trail' ? 'sweep' : 'jump',
      },
      decorations: {
        emojisEnabled: true,
        autoHighlightKeywords: true,
      },
    };
  }

  /** Alias for backward compatibility */
  public static convertHypitRecipe(
    id: string,
    name: string,
    description: string,
    raw: VireoRawAnimationRule
  ): VireoStyleRecipe {
    return this.convertAnimationRule(id, name, description, raw);
  }
}
