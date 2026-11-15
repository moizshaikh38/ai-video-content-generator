import React from 'react';
import {
  Crop,
  Sparkles,
  Maximize2,
  Shield,
} from 'lucide-react';
import { EditorProject } from '../../types';

interface ScreencastConfigEdit {
  mode?: 'split_stacked' | 'circular_inset' | 'rounded_card_inset';
  insetPosition?: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';
  background?: 'black' | 'blur';
  facecamBox?: { x: number; y: number; w: number; h: number } | null;
}

interface FramingWorkspacePanelProps {
  project: EditorProject;
  showSafeGuides: boolean;
  onToggleSafeGuides: () => void;
  onUpdateCropMode: (mode: 'center' | 'fit' | 'blur' | 'smart') => void;
  onUpdateLayoutMode?: (layout: 'track' | 'split' | 'screencast' | 'blur') => void;
  onUpdateScreencast?: (patch: ScreencastConfigEdit) => void;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject) => void;
}

export const FramingWorkspacePanel: React.FC<FramingWorkspacePanelProps> = ({
  project,
  showSafeGuides,
  onToggleSafeGuides,
  onUpdateCropMode,
  onUpdateLayoutMode,
  onUpdateScreencast,
  onUpdateProject: _onUpdateProject,
}) => {
  // Read active framing mode from video track or default to smart
  const videoTrack = project.tracks.find((t) => t.type === 'VIDEO');
  const videoItem = videoTrack?.items[0];
  const activeCropMode = (videoItem as any)?.crop_mode || 'smart';
  // Fill/fit/blur state comes from the same channel the export compiler and the
  // preview toolbar toggle use (item.crop), with legacy crop_mode as fallback so
  // the panel and the toolbar always agree, including after save/reopen/undo.
  const activeFillMode: 'fill' | 'fit' | 'blur' = videoItem?.crop?.mode
    ? (videoItem.crop.mode === 'fit' ? 'fit' : videoItem.crop.mode === 'blur' ? 'blur' : 'fill')
    : ((videoItem as any)?.crop_mode === 'fit' ? 'fit' : 'fill');
  const activeLayoutMode = (videoItem as any)?.layout_mode || 'track';
  const screencastCfg = ((videoItem as any)?.crop_config?.screencast || {}) as ScreencastConfigEdit;
  const facecamSuggestion = ((videoItem as any)?.reframe_metadata?.facecam_box || null) as { x: number; y: number; w: number; h: number } | null;

  return (
    <div className="flex flex-col h-full bg-vc-surface1 text-neutral-300 text-xs select-none overflow-y-auto p-4 space-y-4 animate-panelSlideIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-white">
            <Crop className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Framing & Reframe</h3>
            <p className="text-[10px] text-neutral-400">Subject tracking & viewport cropping</p>
          </div>
        </div>
      </div>

      {/* Reframe & Crop Modes */}
      <div>
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Framing Strategy
        </label>
        <div className="grid grid-cols-2 gap-2">
          {/* Smart Reframe */}
          <button
            type="button"
            onClick={() => onUpdateCropMode('smart')}
            className={`p-3 rounded-xl border text-left transition ${
              activeCropMode === 'smart'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Smart Reframe</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-1 leading-tight">
              AI speaker face & motion tracking across cuts
            </div>
          </button>

          {/* Center Fill */}
          <button
            type="button"
            onClick={() => onUpdateCropMode('center')}
            className={`p-3 rounded-xl border text-left transition ${
              activeCropMode === 'center'
                ? 'bg-white/[0.12] border-white/40 text-white ring-1 ring-white/20'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <Maximize2 className="w-3.5 h-3.5 text-neutral-300" />
              <span>Center Fill</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-1 leading-tight">
              Fixed center crop filling stage dimensions
            </div>
          </button>
        </div>
      </div>

      {/* Genre Canvas Layouts (Opus.pro 4-Layout Switcher) */}
      <div className="pt-3 border-t border-white/[0.08]">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Vertical Canvas Layout
        </label>
        <div className="grid grid-cols-2 gap-2">
          {/* Track (Solo) */}
          <button
            type="button"
            onClick={() => onUpdateLayoutMode?.('track')}
            className={`p-2.5 rounded-xl border text-left transition ${
              activeLayoutMode === 'track'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <span>🎯 Speaker Track</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Active speaker pan (Solo)</div>
          </button>

          {/* Split (Podcasts) */}
          <button
            type="button"
            onClick={() => onUpdateLayoutMode?.('split')}
            className={`p-2.5 rounded-xl border text-left transition ${
              activeLayoutMode === 'split'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <span>🎙️ Podcast Split</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Top/Bottom 2-speaker stack</div>
          </button>

          {/* Screencast (Demos) */}
          <button
            type="button"
            onClick={() => onUpdateLayoutMode?.('screencast')}
            className={`p-2.5 rounded-xl border text-left transition ${
              activeLayoutMode === 'screencast'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <span>💻 Screencast & Cam</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Screen top + Cam bottom</div>
          </button>

          {/* Fit with Blur */}
          <button
            type="button"
            onClick={() => onUpdateLayoutMode?.('blur')}
            className={`p-2.5 rounded-xl border text-left transition ${
              activeLayoutMode === 'blur'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <span>🖼️ Fit with Blur</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Blurred 9:16 background</div>
          </button>
        </div>
      </div>

      {/* Screencast correction controls */}
      {activeLayoutMode === 'screencast' && (
        <div className="pt-3 border-t border-white/[0.08] space-y-3">
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
            Screencast Layout
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ['split_stacked', 'Stacked'],
              ['circular_inset', 'Circle Cam'],
              ['rounded_card_inset', 'Card Cam'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onUpdateScreencast?.({ mode: value })}
                className={`p-2 rounded-lg border text-[11px] transition ${
                  (screencastCfg.mode || 'split_stacked') === value
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                    : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {(screencastCfg.mode === 'circular_inset' || screencastCfg.mode === 'rounded_card_inset') && (
            <>
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Camera Position
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ['top_left', 'TL'],
                  ['top_right', 'TR'],
                  ['bottom_left', 'BL'],
                  ['bottom_right', 'BR'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onUpdateScreencast?.({ insetPosition: value })}
                    className={`p-2 rounded-lg border text-[11px] transition ${
                      (screencastCfg.insetPosition || 'bottom_right') === value
                        ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                        : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
            Background
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ['black', 'Black bars'],
              ['blur', 'Blurred fill'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onUpdateScreencast?.({ background: value })}
                className={`p-2 rounded-lg border text-[11px] transition ${
                  (screencastCfg.background || 'black') === value
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                    : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
            Facecam Region
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!facecamSuggestion && !screencastCfg.facecamBox}
              onClick={() => onUpdateScreencast?.({ facecamBox: facecamSuggestion ?? screencastCfg.facecamBox ?? null })}
              className={`p-2 rounded-lg border text-[11px] transition ${
                screencastCfg.facecamBox
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                  : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
              } disabled:opacity-40`}
            >
              {screencastCfg.facecamBox ? 'Detected region ✓' : facecamSuggestion ? 'Use detected region' : 'No region detected'}
            </button>
            <button
              type="button"
              disabled={!screencastCfg.facecamBox && screencastCfg.facecamBox !== null && !facecamSuggestion}
              onClick={() => onUpdateScreencast?.({ facecamBox: null })}
              className={`p-2 rounded-lg border text-[11px] transition ${
                screencastCfg.facecamBox === null
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                  : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
              } disabled:opacity-40`}
            >
              {screencastCfg.facecamBox === null ? 'Center crop ✓' : 'Center crop cam'}
            </button>
          </div>
          <p className="text-[10px] text-neutral-500">
            The detected region is a geometric suggestion from analysis, not a certainty - adjust or clear it anytime.
          </p>
        </div>
      )}

      {/* Fill / Fit / Blur Mode - same control as the preview toolbar Layout toggle */}
      <div className="pt-3 border-t border-white/[0.08]">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Fill Mode
        </label>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['center', 'Fill Stage', 'Edge-to-edge without bars', 'fill'],
            ['fit', 'Fit to Stage', 'Whole frame, plain borders', 'fit'],
            ['blur', 'Blur Fill', 'Whole frame, blurred background', 'blur'],
          ] as const).map(([mode, label, hint, key]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onUpdateCropMode(mode)}
              className={`p-2.5 rounded-xl border text-left transition ${
                activeFillMode === key
                  ? 'bg-violet-500/15 border-violet-500/40 text-white ring-1 ring-violet-500/30'
                  : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-white'
              }`}
            >
              <div className="font-semibold text-xs">{label}</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">{hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Platform Safe Zone Overlay Toggle */}
      <div className="pt-3 border-t border-white/[0.08]">
        <div className="flex items-center justify-between p-3 rounded-xl bg-vc-canvas ">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-neutral-300" />
            <div>
              <span className="font-semibold text-white text-xs block">Platform Safe Zones</span>
              <span className="text-[10px] text-neutral-400">TikTok, Reels & Shorts hazard overlays</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleSafeGuides}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              showSafeGuides
                ? 'bg-white text-black shadow-sm'
                : 'bg-white/[0.08] text-neutral-400 hover:text-white'
            }`}
          >
            {showSafeGuides ? 'Active' : 'Hidden'}
          </button>
        </div>
      </div>
    </div>
  );
};
