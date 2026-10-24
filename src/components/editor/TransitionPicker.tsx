import React, { useMemo } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Timer } from 'lucide-react';
import {
  TRANSITION_PRESETS,
  TransitionPreset,
  TransitionDirection,
  TRANSITION_DURATION_MIN,
  TRANSITION_DURATION_MAX,
} from '../../lib/transitionPresets';
import type { EditorTransition, EditorTransitionType } from '../../types';

/**
 * CapCut-style transition picker: every preset renders as a small looping
 * CSS animation of clip A → clip B performing the transition, grouped by
 * category, with duration + direction controls. Applies `transition_in` to
 * the selected timeline item (the boundary between it and the previous item).
 */

type AnimName =
  | 'cut' | 'fadeIn' | 'flash' | 'slide' | 'wipe' | 'zoom'
  | 'blur' | 'pixelate' | 'circle' | 'circleWarp' | 'radial'
  | 'squeezeH' | 'squeezeV';

const PRESET_ANIM: Record<string, { b: AnimName; a?: AnimName; overlay?: boolean }> = {
  cut: { b: 'cut' },
  cross_dissolve: { b: 'fadeIn' },
  fade: { b: 'fadeIn' },
  dip_to_black: { b: 'fadeIn', a: 'fadeIn' },
  dip_to_white: { b: 'flash' },
  slide: { b: 'slide' },
  push: { b: 'slide' },
  smooth_slide: { b: 'slide' },
  wipe: { b: 'wipe' },
  zoom_lite: { b: 'zoom' },
  blur: { b: 'blur', a: 'blur' },
  pixelate: { b: 'pixelate', overlay: true },
  radial: { b: 'radial' },
  circle_open: { b: 'circle' },
  circle_crop: { b: 'circleWarp' },
  squeeze_h: { b: 'squeezeH', a: 'squeezeH' },
  squeeze_v: { b: 'squeezeV', a: 'squeezeV' },
};

const SLIDE_KEY: Record<TransitionDirection, string> = {
  left: 'tt-slideB-left',
  right: 'tt-slideB-right',
  up: 'tt-slideB-up',
  down: 'tt-slideB-down',
};
const WIPE_KEY: Record<TransitionDirection, string> = {
  left: 'tt-wipe-left',
  right: 'tt-wipe-right',
  up: 'tt-wipe-up',
  down: 'tt-wipe-down',
};

const KeyframeName: Record<AnimName, string> = {
  cut: 'tt-cutB',
  fadeIn: 'tt-fadeB',
  flash: 'tt-flash',
  slide: 'tt-slideB-left',
  wipe: 'tt-wipe-left',
  zoom: 'tt-zoomB',
  blur: 'tt-blurB',
  pixelate: 'tt-pixelB',
  circle: 'tt-circleB',
  circleWarp: 'tt-circleWarp',
  radial: 'tt-radialB',
  squeezeH: 'tt-squeeze-h-b',
  squeezeV: 'tt-squeeze-v-b',
};

const A_KEYFRAME: Partial<Record<AnimName, string>> = {
  fadeIn: 'tt-fadeB',
  blur: 'tt-blurA',
  squeezeH: 'tt-squeeze-h-a',
  squeezeV: 'tt-squeeze-v-a',
};

const TransitionThumb: React.FC<{ preset: TransitionPreset; direction: TransitionDirection }> = ({ preset, direction }) => {
  const spec = PRESET_ANIM[preset.id] ?? { b: 'fadeIn' as AnimName };
  const keyframe = preset.id === 'slide' || preset.id === 'push' || preset.id === 'smooth_slide'
    ? SLIDE_KEY[direction]
    : preset.id === 'wipe'
      ? WIPE_KEY[direction]
      : KeyframeName[spec.b];
  const aKeyframe = spec.a ? A_KEYFRAME[spec.a] : undefined;

  return (
    <div className="relative w-full h-9 rounded-md overflow-hidden bg-black border border-white/10" aria-hidden="true">
      {/* Clip A */}
      <div
        className={`absolute inset-0 bg-gradient-to-br from-violet-500/80 to-indigo-700/80 ${aKeyframe ? 'tt-anim' : ''}`}
        style={aKeyframe ? { animationName: aKeyframe } : undefined}
      />
      {/* Clip B */}
      <div
        className="tt-anim absolute inset-0 bg-gradient-to-br from-cyan-400/90 to-emerald-500/90"
        style={{ animationName: keyframe }}
      />
      {/* Pixelate approximation overlay */}
      {spec.overlay && (
        <div
          className="tt-anim absolute inset-0"
          style={{
            animationName: 'tt-pixelOverlay',
            backgroundImage:
              'linear-gradient(45deg, rgba(255,255,255,.25) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.25) 50%, rgba(255,255,255,.25) 75%, transparent 75%)',
            backgroundSize: '8px 8px',
          }}
        />
      )}
    </div>
  );
};

export interface TransitionPickerProps {
  currentTransition?: EditorTransition;
  onSelect: (transition: EditorTransition | undefined) => void;
  disabled?: boolean;
  compact?: boolean;
}

const GROUP_LABELS: Record<TransitionPreset['group'], string> = {
  basic: 'Basic',
  flash: 'Flash',
  slide: 'Slide & Wipe',
  shape: 'Shape',
  effect: 'Effects',
};

export const TransitionPicker: React.FC<TransitionPickerProps> = ({
  currentTransition,
  onSelect,
  disabled = false,
}) => {
  const direction: TransitionDirection = currentTransition?.direction ?? 'left';
  const grouped = useMemo(() => {
    const map = new Map<TransitionPreset['group'], TransitionPreset[]>();
    for (const preset of TRANSITION_PRESETS) {
      const list = map.get(preset.group) || [];
      list.push(preset);
      map.set(preset.group, list);
    }
    return [...map.entries()];
  }, []);

  const activePreset = currentTransition ? TRANSITION_PRESETS.find((p) => p.id === currentTransition.type) : null;
  const supportsDirection = activePreset?.supportsDirection ?? false;

  const apply = (preset: TransitionPreset) => {
    if (preset.id === 'cut') {
      onSelect(undefined);
      return;
    }
    onSelect({
      type: preset.id as EditorTransitionType,
      duration: currentTransition?.duration ?? preset.defaultDurationSec,
      direction: preset.supportsDirection ? direction : undefined,
    });
  };

  const setDirection = (dir: TransitionDirection) => {
    if (!currentTransition) return;
    onSelect({ ...currentTransition, direction: dir });
  };

  const setDuration = (value: number) => {
    if (!currentTransition) return;
    onSelect({
      ...currentTransition,
      duration: Math.min(TRANSITION_DURATION_MAX, Math.max(TRANSITION_DURATION_MIN, Number(value.toFixed(1)))),
    });
  };

  return (
    <div className="space-y-3">
      {grouped.map(([group, presets]) => (
        <div key={group}>
          <div className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
            {GROUP_LABELS[group]}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((preset) => {
              const isActive = currentTransition
                ? currentTransition.type === preset.id
                : preset.id === 'cut';
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => apply(preset)}
                  aria-pressed={isActive}
                  title={preset.description}
                  className={`group rounded-lg border p-1.5 text-left transition ${
                    isActive
                      ? 'border-violet-400/70 bg-violet-500/15 ring-1 ring-violet-400/40'
                      : 'border-white/[0.07] bg-vc-canvas hover:border-white/25'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <TransitionThumb preset={preset} direction={direction} />
                  <div className={`mt-1 text-[10px] font-semibold truncate ${isActive ? 'text-violet-200' : 'text-neutral-300'}`}>
                    {preset.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Duration + direction controls */}
      {currentTransition && activePreset && (
        <div className="pt-2 border-t border-white/[0.08] space-y-2">
          <div className="flex items-center gap-2">
            <Timer className="size-3 text-neutral-500" aria-hidden="true" />
            <input
              type="range"
              min={TRANSITION_DURATION_MIN}
              max={TRANSITION_DURATION_MAX}
              step={0.1}
              value={currentTransition.duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              disabled={disabled}
              className="flex-1 h-1 accent-violet-400"
              aria-label="Transition duration"
            />
            <span className="text-[10px] font-mono text-neutral-400 w-8 text-right">
              {currentTransition.duration.toFixed(1)}s
            </span>
          </div>
          {supportsDirection && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-neutral-500 mr-0.5">Direction</span>
              {([
                ['left', ArrowLeft],
                ['right', ArrowRight],
                ['up', ArrowUp],
                ['down', ArrowDown],
              ] as Array<[TransitionDirection, typeof ArrowLeft]>).map(([dir, Icon]) => (
                <button
                  key={dir}
                  type="button"
                  disabled={disabled}
                  onClick={() => setDirection(dir)}
                  aria-pressed={direction === dir}
                  aria-label={`${dir} direction`}
                  className={`p-1 rounded-md border transition ${
                    direction === dir
                      ? 'border-violet-400/60 bg-violet-500/20 text-violet-200'
                      : 'border-white/[0.08] text-neutral-400 hover:border-white/25'
                  }`}
                >
                  <Icon className="size-3" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
