/**
 * VireoClip Declarative Style Recipe Schema (.vrecipe.json)
 *
 * Clean-room TypeScript specification for portable, deterministic caption styling
 * compatible with native C-binary FFmpeg/ASS rendering.
 */

import { SafeFontFamily } from './index.js';

export type RecipeFontWeight = 'normal' | 'medium' | 'bold' | 'extra-bold' | 'black';
export type RecipeTextCase = 'uppercase' | 'lowercase' | 'titlecase' | 'none';
export type RecipeLineBreakMethod = 'balanced' | 'greedy' | 'single';
export type RecipeAnimationPreset = 'pop' | 'fade' | 'bounce' | 'karaoke' | 'slide' | 'none';
export type RecipeKaraokeEffect = 'fill' | 'sweep' | 'jump';

export interface RecipeTypography {
  fontFamily: SafeFontFamily | string;
  fontSize: number; // ASS script points (PlayRes-scaled, typically 50-95 for 1080x1920)
  fontWeight: RecipeFontWeight;
  letterSpacing?: number;
  textCase: RecipeTextCase;
}

export interface RecipePositioning {
  alignment: number; // ASS numpad alignment: 1..9 (2 = bottom-center, 5 = middle-center, 8 = top-center)
  verticalMargin: number; // ASS margin V from edge
  horizontalMargin: number; // ASS margin L/R
  maxWordsPerLine: number;
  maxCharsPerLine: number;
  lineBreakMethod: RecipeLineBreakMethod;
}

export interface RecipeBackgroundPill {
  enabled: boolean;
  color: string; // Hex color (#RRGGBB or #AARRGGBB)
  paddingX?: number;
  paddingY?: number;
  borderRadius?: number;
}

export interface RecipeColors {
  primary: string; // Main text color (hex #RRGGBB)
  secondary?: string; // Secondary / inactive word color
  activeWordHighlight: string; // Active spoken word color
  outline: string; // Outline / border color
  outlineWidth: number; // Outline thickness in ASS pixels
  shadow: string; // Drop shadow color
  shadowBlur?: number;
  shadowOffset: number;
  backgroundPill?: RecipeBackgroundPill;
}

export interface RecipeAnimation {
  preset: RecipeAnimationPreset;
  durationMs: number;
  activeWordScale?: number; // Scale multiplier for currently spoken word (e.g. 1.15)
  karaokeEffect?: RecipeKaraokeEffect;
}

export interface RecipeDecorations {
  emojisEnabled: boolean;
  autoHighlightKeywords: boolean;
  soundEffectCue?: string;
}

export interface VireoStyleRecipe {
  $schema?: string;
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  typography: RecipeTypography;
  positioning: RecipePositioning;
  colors: RecipeColors;
  animation: RecipeAnimation;
  decorations: RecipeDecorations;
}
