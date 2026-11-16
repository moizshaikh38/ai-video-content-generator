import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Bundled editor fonts (OFL-licensed, committed under server/assets/fonts).
 *
 * Why: drawtext `font='Montserrat'` resolves through fontconfig, which falls
 * back to DejaVu on hosts without the font installed (Render) - so the export
 * rendered different letterforms than the preview. Bundling the exact files
 * and emitting `fontfile=` removes the host dependency, and picking the file
 * by the item's font_weight lets the export honor weight the way the preview
 * does (fontWeight 400/600/700/900).
 *
 * Licenses: SIL Open Font License 1.1, OFL.txt beside each family.
 *   Montserrat - (c) 2024 The Montserrat.Git Project Authors
 *   Inter      - (c) 2016 The Inter Project Authors
 * Adding a family: drop static TTFs + OFL.txt here and extend the map.
 */

type BundledWeight = 'regular' | 'medium' | 'bold' | 'black';

const BUNDLED_FONTS: Record<string, Record<BundledWeight, string>> = {
  Montserrat: {
    regular: 'montserrat/Montserrat-Regular.ttf',
    medium: 'montserrat/Montserrat-Medium.ttf',
    bold: 'montserrat/Montserrat-Bold.ttf',
    black: 'montserrat/Montserrat-Black.ttf',
  },
  Inter: {
    regular: 'inter/Inter-Regular.ttf',
    medium: 'inter/Inter-SemiBold.ttf',
    bold: 'inter/Inter-Bold.ttf',
    black: 'inter/Inter-Black.ttf',
  },
};

export function normalizeTextWeight(weight?: string | number | null): BundledWeight {
  if (weight === 'medium' || weight === 600) return 'medium';
  if (weight === 'bold' || weight === 700) return 'bold';
  if (weight === 'black' || weight === 900 || weight === 800) return 'black';
  return 'regular';
}

/** Absolute path to the bundled file for family+weight, or null when not bundled/missing. */
export function resolveBundledFontFile(fontFamily?: string, weight?: string | number | null): string | null {
  if (!fontFamily) return null;
  const family = BUNDLED_FONTS[fontFamily.trim()];
  if (!family) return null;
  const rel = family[normalizeTextWeight(weight)];
  // Works from both server/src/services (tsx) and server/dist/services (compiled).
  const abs = path.resolve(HERE, '..', '..', 'assets', 'fonts', rel);
  return fs.existsSync(abs) ? abs : null;
}

/**
 * The drawtext font argument for an item: `fontfile='<abs>'` when bundled
 * (exact letterforms + weight, host-independent), else the previous
 * `font='<family>'` fontconfig behavior. Paths are repo-controlled, so no
 * user input reaches the filter string here.
 */
export function drawtextFontArg(fontFamily: string, weight?: string | number | null): string {
  const file = resolveBundledFontFile(fontFamily, weight);
  if (file) return `fontfile='${file}'`;
  return `font='${fontFamily.replace(/'/g, '')}'`;
}
