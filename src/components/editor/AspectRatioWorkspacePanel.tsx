import React from 'react';
import {
  RectangleHorizontal,
  Smartphone,
  Square,
  Monitor,
  Check,
} from 'lucide-react';
import { EditorProject, ClipAspectRatio } from '../../types';

interface AspectRatioWorkspacePanelProps {
  project: EditorProject;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject) => void;
}

interface RatioOption {
  ratio: ClipAspectRatio;
  label: string;
  platform: string;
  width: number;
  height: number;
  icon: React.ComponentType<{ className?: string }>;
}

const RATIO_OPTIONS: RatioOption[] = [
  {
    ratio: '9:16',
    label: '9:16 Vertical',
    platform: 'TikTok, Reels, Shorts',
    width: 1080,
    height: 1920,
    icon: Smartphone,
  },
  {
    ratio: '1:1',
    label: '1:1 Square',
    platform: 'Instagram Feed, LinkedIn',
    width: 1080,
    height: 1080,
    icon: Square,
  },
  {
    ratio: '16:9',
    label: '16:9 Landscape',
    platform: 'YouTube, Web, Desktop',
    width: 1920,
    height: 1080,
    icon: Monitor,
  },
  {
    ratio: '4:5',
    label: '4:5 Portrait',
    platform: 'Facebook & Instagram Feed',
    width: 1080,
    height: 1350,
    icon: Smartphone,
  },
];

const BACKGROUND_PRESETS = [
  { label: 'Obsidian Black', color: '#000000' },
  { label: 'Deep Graphite', color: '#090B10' },
  { label: 'Dark Navy', color: '#0A0F1D' },
  { label: 'Charcoal', color: '#171922' },
];

export const AspectRatioWorkspacePanel: React.FC<AspectRatioWorkspacePanelProps> = ({
  project,
  onUpdateProject,
}) => {
  const currentRatio = project.canvas.aspect_ratio || '9:16';
  const currentBg = project.canvas.background_color || '#000000';

  const handleSelectRatio = (option: RatioOption) => {
    onUpdateProject((prev) => ({
      ...prev,
      canvas: {
        ...prev.canvas,
        aspect_ratio: option.ratio,
        width: option.width,
        height: option.height,
      },
    }));
  };

  const handleSelectBackground = (color: string) => {
    onUpdateProject((prev) => ({
      ...prev,
      canvas: {
        ...prev.canvas,
        background_color: color,
      },
    }));
  };

  return (
    <div className="flex flex-col h-full bg-vc-surface1 text-neutral-300 text-xs select-none overflow-y-auto p-4 space-y-4 animate-panelSlideIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-white">
            <RectangleHorizontal className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Aspect Ratio</h3>
            <p className="text-[10px] text-neutral-400">Canvas dimensions & background</p>
          </div>
        </div>
      </div>

      {/* Ratio Grid */}
      <div>
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Output Aspect Ratio
        </label>
        <div className="grid grid-cols-2 gap-2">
          {RATIO_OPTIONS.map((opt) => {
            const isActive = currentRatio === opt.ratio;
            const Icon = opt.icon;

            return (
              <button
                key={opt.ratio}
                type="button"
                onClick={() => handleSelectRatio(opt)}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between h-24 ${
                  isActive
                    ? 'bg-white/[0.14] border-white/40 text-white shadow-sm ring-1 ring-white/20'
                    : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <Icon className="w-4 h-4 text-neutral-300" />
                  {isActive && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>

                <div>
                  <div className="font-semibold text-xs text-white">{opt.label}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5 truncate">{opt.platform}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Resolution Spec Card */}
      <div className="p-3 rounded-xl bg-vc-canvas flex items-center justify-between text-neutral-400">
        <span>Current Resolution</span>
        <span className="font-mono text-white font-semibold">
          {project.canvas.width || 1080} × {project.canvas.height || 1920} px
        </span>
      </div>

      {/* Background Color Palette */}
      <div className="pt-3 border-t border-white/[0.08]">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Canvas Backdrop Fill
        </label>
        <div className="grid grid-cols-2 gap-2">
          {BACKGROUND_PRESETS.map((preset) => {
            const isSelected = currentBg.toLowerCase() === preset.color.toLowerCase();
            return (
              <button
                key={preset.color}
                type="button"
                onClick={() => handleSelectBackground(preset.color)}
                className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-left transition ${
                  isSelected
                    ? 'bg-white/[0.12] border-white/40 text-white'
                    : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
                }`}
              >
                <div
                  style={{ backgroundColor: preset.color }}
                  className="w-5 h-5 rounded-full border border-white/20 shrink-0"
                />
                <span className="text-[11px] font-medium truncate">{preset.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 ml-auto text-white shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
