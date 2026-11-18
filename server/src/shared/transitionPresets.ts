/**
 * Canonical video-transition registry (Platform Quality Roadmap E-1).
 *
 * Single source of truth shared by the server render graph (FFmpeg xfade) and
 * the editor's animated transition picker — the caption-preset pattern applied
 * to transitions, so preview presets and export effects cannot drift.
 *
 * `xfadeBase` values map to FFmpeg's xfade transition names; directional
 * presets resolve per-direction at render time (resolveXfadeName).
 */

export type TransitionDirection = 'left' | 'right' | 'up' | 'down';

export interface TransitionPreset {
  id: string;
  label: string;
  /** Picker grouping (CapCut-style categories). */
  group: 'basic' | 'flash' | 'slide' | 'shape' | 'effect';
  description: string;
  /** FFmpeg xfade transition base name; null for the hard cut. */
  xfadeBase: string | null;
  /** Direction replaces `{dir}`/`{Dir}` in the base name. */
  supportsDirection: boolean;
  defaultDurationSec: number;
}

export const TRANSITION_PRESETS: readonly TransitionPreset[] = [
  { id: 'cut',            label: 'Cut',            group: 'basic',  description: 'Direct frame cut', xfadeBase: null, supportsDirection: false, defaultDurationSec: 0 },
  { id: 'cross_dissolve', label: 'Dissolve',       group: 'basic',  description: 'Smooth cross-blend', xfadeBase: 'fade', supportsDirection: false, defaultDurationSec: 0.5 },
  { id: 'dip_to_black',   label: 'Dip to Black',   group: 'flash',  description: 'Fade through black', xfadeBase: 'fadeblack', supportsDirection: false, defaultDurationSec: 0.6 },
  { id: 'dip_to_white',   label: 'Flash White',    group: 'flash',  description: 'Bright flash blend', xfadeBase: 'fadewhite', supportsDirection: false, defaultDurationSec: 0.4 },
  { id: 'fade',           label: 'Soft Fade',      group: 'basic',  description: 'Gentle luminance fade', xfadeBase: 'fade', supportsDirection: false, defaultDurationSec: 0.5 },
  { id: 'slide',          label: 'Slide',          group: 'slide',  description: 'Incoming clip slides in', xfadeBase: 'slide{dir}', supportsDirection: true, defaultDurationSec: 0.5 },
  { id: 'push',           label: 'Push',           group: 'slide',  description: 'Pushes the previous clip out', xfadeBase: 'slide{dir}', supportsDirection: true, defaultDurationSec: 0.5 },
  { id: 'smooth_slide',   label: 'Smooth Slide',   group: 'slide',  description: 'Eased slide with soft edge', xfadeBase: 'smooth{dir}', supportsDirection: true, defaultDurationSec: 0.6 },
  { id: 'wipe',           label: 'Wipe',           group: 'slide',  description: 'Hard-edge wipe reveal', xfadeBase: 'wipe{dir}', supportsDirection: true, defaultDurationSec: 0.5 },
  { id: 'zoom_lite',      label: 'Zoom',           group: 'effect', description: 'Quick zoom-through blend', xfadeBase: 'zoomin', supportsDirection: false, defaultDurationSec: 0.4 },
  { id: 'blur',           label: 'Blur',           group: 'effect', description: 'Defocus morph between clips', xfadeBase: 'hblur', supportsDirection: false, defaultDurationSec: 0.5 },
  { id: 'pixelate',       label: 'Pixelate',       group: 'effect', description: 'Pixel-dissolve blend', xfadeBase: 'pixelize', supportsDirection: false, defaultDurationSec: 0.5 },
  { id: 'radial',         label: 'Radial Sweep',   group: 'shape',  description: 'Radial angle sweep reveal', xfadeBase: 'radial', supportsDirection: false, defaultDurationSec: 0.6 },
  { id: 'circle_open',    label: 'Iris Open',      group: 'shape',  description: 'Circle grows to reveal', xfadeBase: 'circleopen', supportsDirection: false, defaultDurationSec: 0.5 },
  { id: 'circle_crop',    label: 'Iris Warp',      group: 'shape',  description: 'Dual-circle warp blend', xfadeBase: 'circlecrop', supportsDirection: false, defaultDurationSec: 0.5 },
  { id: 'squeeze_h',      label: 'Squeeze H',      group: 'shape',  description: 'Horizontal squeeze blend', xfadeBase: 'squeezeh', supportsDirection: false, defaultDurationSec: 0.4 },
  { id: 'squeeze_v',      label: 'Squeeze V',      group: 'shape',  description: 'Vertical squeeze blend', xfadeBase: 'squeezev', supportsDirection: false, defaultDurationSec: 0.4 },
] as const;

export const TRANSITION_PRESET_IDS: readonly string[] = TRANSITION_PRESETS.map((p) => p.id);

const PRESET_BY_ID = new Map(TRANSITION_PRESETS.map((p) => [p.id, p]));

export function getTransitionPreset(id: string | null | undefined): TransitionPreset | null {
  if (!id) return null;
  return PRESET_BY_ID.get(id) ?? null;
}

/** Legacy type ids that predate this registry stay valid (rendered as their base). */
const LEGACY_ALIASES: Record<string, { xfadeBase: string; label?: string }> = {
  fade: { xfadeBase: 'fade' },
};

/**
 * Resolves the concrete FFmpeg xfade transition name for a preset + direction.
 * Returns null for the hard cut (no xfade needed).
 */
export function resolveXfadeName(id: string, direction?: TransitionDirection): string | null {
  const preset = getTransitionPreset(id);
  if (preset) {
    if (!preset.xfadeBase) return null;
    const dir = (preset.supportsDirection ? direction : undefined) ?? 'left';
    return preset.xfadeBase.replace('{dir}', dir);
  }
  const legacy = LEGACY_ALIASES[id];
  return legacy ? legacy.xfadeBase : null;
}

export function isDirectionalTransition(id: string): boolean {
  return getTransitionPreset(id)?.supportsDirection ?? false;
}

/** UI-safe duration bounds shared by picker and validation. */
export const TRANSITION_DURATION_MIN = 0.2;
export const TRANSITION_DURATION_MAX = 2.0;

export function clampTransitionDuration(value: unknown, fallback = 0.5): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(TRANSITION_DURATION_MAX, Math.max(TRANSITION_DURATION_MIN, n));
}
