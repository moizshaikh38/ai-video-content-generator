import React from 'react';
import {
  Crop,
  Sparkles,
  Maximize2,
  Shield,
} from 'lucide-react';
import { EditorProject } from '../../types';

interface FramingWorkspacePanelProps {
  project: EditorProject;
  showSafeGuides: boolean;
  onToggleSafeGuides: () => void;
  onUpdateCropMode: (mode: 'center' | 'fit' | 'smart') => void;
  onUpdateLayoutMode?: (layout: 'track' | 'split' | 'screencast' | 'blur') => void;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject) => void;
}

export const FramingWorkspacePanel: React.FC<FramingWorkspacePanelProps> = ({
  project,
  showSafeGuides,
  onToggleSafeGuides,
  onUpdateCropMode,
  onUpdateLayoutMode,
  onUpdateProject: _onUpdateProject,
}) => {
  // Read active framing mode from video track or default to smart
  const videoTrack = project.tracks.find((t) => t.type === 'VIDEO');
  const videoItem = videoTrack?.items[0];
  const activeCropMode = (videoItem as any)?.crop_mode || 'smart';
  const activeLayoutMode = (videoItem as any)?.layout_mode || 'track';

  return (
    <div className="flex flex-col h-full bg-[#0E1017] text-neutral-300 text-xs select-none overflow-y-auto p-4 space-y-4 animate-panelSlideIn">
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
                : 'bg-[#07080D] border-white/[0.06] hover:border-white/20 text-neutral-300'
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
                : 'bg-[#07080D] border-white/[0.06] hover:border-white/20 text-neutral-300'
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
                : 'bg-[#07080D] border-white/[0.06] hover:border-white/20 text-neutral-300'
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
                : 'bg-[#07080D] border-white/[0.06] hover:border-white/20 text-neutral-300'
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
                : 'bg-[#07080D] border-white/[0.06] hover:border-white/20 text-neutral-300'
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
                : 'bg-[#07080D] border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <span>🖼️ Fit with Blur</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Blurred 9:16 background</div>
          </button>
        </div>
      </div>

      {/* Fit vs Fill Mode */}
      <div className="pt-3 border-t border-white/[0.08]">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Fit & Fill Mode
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUpdateCropMode('center')}
            className="p-2.5 rounded-xl bg-[#07080D] border border-white/[0.06] hover:border-white/20 text-white text-left transition"
          >
            <div className="font-semibold text-xs">Fill Stage</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Edge-to-edge without black bars</div>
          </button>
          <button
            type="button"
            onClick={() => onUpdateCropMode('fit')}
            className="p-2.5 rounded-xl bg-[#07080D] border border-white/[0.06] hover:border-white/20 text-white text-left transition"
          >
            <div className="font-semibold text-xs">Fit to Stage</div>
            <div className="text-[10px] text-neutral-500 mt-0.5">Show 100% of video with borders</div>
          </button>
        </div>
      </div>

      {/* Platform Safe Zone Overlay Toggle */}
      <div className="pt-3 border-t border-white/[0.08]">
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#07080D] border border-white/[0.08]">
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
