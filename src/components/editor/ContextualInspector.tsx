import React, { useState } from 'react';
import {
  Sliders,
  Sparkles,
  Subtitles,
  Crop,
  Type,
  Plus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Italic,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Layers,
  Palette,
} from 'lucide-react';
import {
  EditorProject,
  EditorTrackItem,
  ClipAspectRatio,
  SAFE_EDITOR_FONTS,
  EDITOR_FILTER_PRESETS,
  EditorFilterPreset,
  RenderedClip,
  EditorCaptionItem,
  EditorTextAnimation,
  EditorTextConfig,
} from '../../types';
import { SidebarTab, AiToolType } from '../../hooks/useEditorSelection';
import { CaptionStyleCustomizer } from './CaptionStyleCustomizer';
import { CaptionPresetGallery } from './CaptionPresetGallery';
import { AudioClipControls } from './AudioClipControls';
import { AiToolsPanel } from './AiToolsPanel';
import type { LucideIcon } from 'lucide-react';
import {
  PanelEmpty,
  SECTION_LABEL,
  SEGMENTED_GROUP,
  SEGMENTED_ITEM,
  SEGMENTED_ITEM_ACTIVE,
  SEGMENTED_ITEM_IDLE,
} from './panelKit';
import { usePanelPref } from '../../lib/panelPrefs';
import { AiToolDef } from '../../lib/aiToolsRegistry';
import {
  CaptionPresetId,
  getEditorCaptionPresetId,
  resolveEditorCaptionStyle,
  applyPresetToEditorCaption,
} from '../../lib/captionPresets';

interface ContextualInspectorProps {
  project: EditorProject;
  clip: RenderedClip | null;
  selectedItemId: string | null;
  selectedTrackId: string | null;
  activeSidebarTab: SidebarTab;
  activeAiTool: AiToolType;
  onSelectAiTool: (tool: AiToolType) => void;
  onNavigateTab: (tab: SidebarTab) => void;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject) => void;
  onUpdateItem: (itemId: string, updates: Partial<EditorTrackItem>) => void;
  onAddKeyframe: (itemId: string, property: any, value: number, easing: any, time?: number) => void;
  onDeleteKeyframe: (itemId: string, keyframeId: string) => void;
  onApplyCaptionPreset: (preset: CaptionPresetId) => void;
  /** False when the clip's transcript only has segment-level timing. */
  hasWordTiming: boolean;
  onAddTextLayer: (text: string) => void;
  onUpdateCropMode: (mode: 'center' | 'fit' | 'smart') => void;
}

type CaptionStudioTab = 'styles' | 'typography' | 'effects';

/** One level of navigation. "All Controls" is gone: it only re-rendered the other two. */
const CAPTION_STUDIO_TABS: { id: CaptionStudioTab; label: string; icon: LucideIcon }[] = [
  { id: 'styles', label: 'Styles', icon: Sparkles },
  { id: 'typography', label: 'Typography', icon: Type },
  { id: 'effects', label: 'Effects', icon: Palette },
];

export const ContextualInspector: React.FC<ContextualInspectorProps> = ({
  project,
  clip,
  selectedItemId,
  selectedTrackId: _selectedTrackId,
  activeSidebarTab,
  activeAiTool: _activeAiTool,
  onSelectAiTool,
  onNavigateTab,
  onUpdateProject,
  onUpdateItem,
  onAddKeyframe: _onAddKeyframe,
  onDeleteKeyframe: _onDeleteKeyframe,
  onApplyCaptionPreset,
  hasWordTiming,
  onAddTextLayer,
  onUpdateCropMode,
}) => {
  const [newTextString, setNewTextString] = useState('New Title');
  const [captionStudioTab, setCaptionStudioTab] = usePanelPref<CaptionStudioTab>('captions.tab', 'styles');
  const [aiToolId, setAiToolId] = useState<string | null>(null);

  const handleActivateAiTool = (tool: AiToolDef) => {
    setAiToolId(tool.id);
    if (tool.target?.aiTool) {
      onSelectAiTool(tool.target.aiTool as AiToolType);
    } else if (tool.target?.tab) {
      onNavigateTab(tool.target.tab as SidebarTab);
    }
  };
  const [keepColors, setKeepColors] = useState(false);

  // Selected item reference
  const selectedItem = project.tracks
    .flatMap((t) => t.items)
    .find((i) => i.id === selectedItemId);

  // Dedicated Text & Motion Overlay Inspector
  if (selectedItem && selectedItem.type === 'TEXT' && selectedItem.text) {
    const textConfig = selectedItem.text;

    const handleUpdateText = (updates: Partial<EditorTextConfig>) => {
      onUpdateItem(selectedItem.id, {
        text: { ...textConfig, ...updates },
      });
    };

    const handleDuplicateItem = () => {
      onUpdateProject((prev) => {
        const track = prev.tracks.find((t) => t.items.some((i) => i.id === selectedItem.id));
        if (!track) return prev;
        const newItem: EditorTrackItem = {
          ...JSON.parse(JSON.stringify(selectedItem)),
          id: crypto.randomUUID(),
          timeline_start: Math.min(prev.canvas.duration - 0.5, selectedItem.timeline_start + 0.5),
          timeline_end: Math.min(prev.canvas.duration, selectedItem.timeline_end + 0.5),
          transform: {
            ...selectedItem.transform,
            position_x: (selectedItem.transform?.position_x || 0) + 20,
            position_y: (selectedItem.transform?.position_y || 0) + 20,
          },
        };
        return {
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.id === track.id ? { ...t, items: [...t.items, newItem] } : t
          ),
        };
      });
    };

    const handleDeleteItem = () => {
      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => ({
          ...t,
          items: t.items.filter((i) => i.id !== selectedItem.id),
        })),
      }));
    };

    const handleReorderLayer = (direction: 'forward' | 'backward') => {
      onUpdateProject((prev) => {
        const track = prev.tracks.find((t) => t.items.some((i) => i.id === selectedItem.id));
        if (!track) return prev;
        const currentZ = selectedItem.z_index || 20;
        const newZ = direction === 'forward' ? currentZ + 5 : Math.max(1, currentZ - 5);

        return {
          ...prev,
          tracks: prev.tracks.map((t) =>
            t.id === track.id
              ? {
                  ...t,
                  items: t.items.map((i) => (i.id === selectedItem.id ? { ...i, z_index: newZ } : i)),
                }
              : t
          ),
        };
      });
    };

    const handleResetTransform = () => {
      onUpdateItem(selectedItem.id, {
        transform: {
          position_x: 0,
          position_y: 0,
          scale: 1.0,
          rotation: 0,
          opacity: 1.0,
        },
      });
    };

    return (
      <aside className="w-[350px] shrink-0 z-20 flex flex-col gap-4 min-h-0 overflow-y-auto border-r border-vc-border bg-vc-surface1 p-4 text-xs text-vc-text-secondary select-none animate-panelSlideIn">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-vc-text-secondary">
              <Type className="w-3.5 h-3.5" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Text Overlay</h3>
              <p className="text-[10px] text-vc-text-secondary">
                {selectedItem.timeline_start.toFixed(1)}s – {selectedItem.timeline_end.toFixed(1)}s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDuplicateItem}
              className="p-1.5 rounded hover:bg-white/[0.08] text-vc-text-secondary hover:text-white transition"
              title="Duplicate Text Element"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetTransform}
              className="p-1.5 rounded hover:bg-white/[0.08] text-vc-text-secondary hover:text-white transition"
              title="Reset Transform (Center)"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDeleteItem}
              className="p-1.5 rounded hover:bg-rose-950/40 text-vc-text-secondary hover:text-rose-400 transition"
              title="Delete Text Element"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 1. Text Content & Quick Align */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider">
            Content
          </label>
          <textarea
            rows={2}
            value={textConfig.text}
            onChange={(e) => handleUpdateText({ text: e.target.value })}
            placeholder="Type your text overlay..."
            className="w-full bg-vc-canvas border border-vc-border rounded-lg p-2 text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-white/30 transition resize-none"
          />

          {/* Quick Position Presets */}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            <button
              onClick={() =>
                onUpdateItem(selectedItem.id, {
                  transform: { ...selectedItem.transform, position_x: 0, position_y: -260 },
                })
              }
              className="px-2 py-1 rounded bg-vc-canvas border border-vc-border hover:bg-white/[0.06] text-vc-text-secondary text-[10px] text-center transition"
            >
              Top Header
            </button>
            <button
              onClick={() =>
                onUpdateItem(selectedItem.id, {
                  transform: { ...selectedItem.transform, position_x: 0, position_y: 0 },
                })
              }
              className="px-2 py-1 rounded bg-vc-canvas border border-vc-border hover:bg-white/[0.06] text-vc-text-secondary text-[10px] text-center transition"
            >
              Center
            </button>
            <button
              onClick={() =>
                onUpdateItem(selectedItem.id, {
                  transform: { ...selectedItem.transform, position_x: 0, position_y: 330 },
                })
              }
              className="px-2 py-1 rounded bg-vc-canvas border border-vc-border hover:bg-white/[0.06] text-vc-text-secondary text-[10px] text-center transition"
            >
              Lower Third
            </button>
          </div>
        </div>

        {/* 2. Typography */}
        <div className="space-y-3 pt-3 border-t border-white/[0.08]">
          <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider">
            Typography
          </label>

          {/* Font Family */}
          <div>
            <span className="text-vc-text-muted text-[10px] block mb-1">Font Family</span>
            <select
              value={textConfig.font_family || 'Inter'}
              onChange={(e) => handleUpdateText({ font_family: e.target.value })}
              className="w-full bg-vc-canvas border border-vc-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
            >
              {SAFE_EDITOR_FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>

          {/* Font Size */}
          <div>
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-vc-text-muted">Size</span>
              <span className="text-vc-text-secondary font-mono">{textConfig.font_size || 36}px</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="16"
                max="100"
                step="1"
                value={textConfig.font_size || 36}
                onChange={(e) => handleUpdateText({ font_size: parseInt(e.target.value) || 36 })}
                className="flex-1 accent-white cursor-pointer"
              />
              <input
                type="number"
                min="12"
                max="120"
                value={textConfig.font_size || 36}
                onChange={(e) => handleUpdateText({ font_size: parseInt(e.target.value) || 36 })}
                className="w-14 bg-vc-canvas border border-vc-border rounded px-1.5 py-0.5 text-right font-mono text-xs text-white"
              />
            </div>
          </div>

          {/* Weight & Alignment */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-vc-text-muted text-[10px] block mb-1">Weight</span>
              <div className="grid grid-cols-4 gap-0.5 bg-vc-canvas p-0.5 rounded-lg border border-vc-border">
                {(['normal', 'medium', 'bold', 'black'] as const).map((w) => (
                  <button
                    key={w}
                    onClick={() => handleUpdateText({ font_weight: w })}
                    className={`py-1 rounded text-[10px] capitalize transition ${
                      (textConfig.font_weight || 'bold') === w
                        ? 'bg-white/[0.15] text-white font-semibold shadow'
                        : 'text-vc-text-secondary hover:text-white'
                    }`}
                  >
                    {w === 'normal' ? 'Reg' : w === 'medium' ? 'Med' : w === 'bold' ? 'Bld' : 'Blk'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-vc-text-muted text-[10px] block mb-1">Alignment</span>
              <div className="grid grid-cols-3 gap-0.5 bg-vc-canvas p-0.5 rounded-lg border border-vc-border">
                {(['left', 'center', 'right'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => handleUpdateText({ alignment: a })}
                    className={`py-1 flex items-center justify-center rounded transition ${
                      (textConfig.alignment || 'center') === a
                        ? 'bg-white/[0.15] text-white shadow'
                        : 'text-vc-text-secondary hover:text-white'
                    }`}
                  >
                    {a === 'left' ? (
                      <AlignLeft className="w-3 h-3" />
                    ) : a === 'center' ? (
                      <AlignCenter className="w-3 h-3" />
                    ) : (
                      <AlignRight className="w-3 h-3" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Letter Spacing & Italic Toggle */}
          <div className="grid grid-cols-2 gap-2 items-center">
            <div>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-vc-text-muted">Spacing</span>
                <span className="text-vc-text-secondary font-mono">{textConfig.letter_spacing || 0}px</span>
              </div>
              <input
                type="range"
                min="-2"
                max="8"
                step="0.5"
                value={textConfig.letter_spacing || 0}
                onChange={(e) => handleUpdateText({ letter_spacing: parseFloat(e.target.value) || 0 })}
                className="w-full accent-white cursor-pointer"
              />
            </div>

            <div className="pt-3">
              <button
                onClick={() => handleUpdateText({ italic: !textConfig.italic })}
                className={`w-full py-1.5 px-3 rounded-lg border text-xs flex items-center justify-center gap-1.5 transition ${
                  textConfig.italic
                    ? 'bg-white/[0.10] border-white/40 text-white'
                    : 'bg-vc-canvas border-white/[0.08] text-vc-text-secondary hover:text-white'
                }`}
              >
                <Italic className="w-3 h-3" />
                <span>Italic</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Color & Appearance */}
        <div className="space-y-3 pt-3 border-t border-white/[0.08]">
          <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider">
            Color & Styling
          </label>

          <div className="grid grid-cols-2 gap-2">
            {/* Text Color */}
            <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
              <span className="text-vc-text-muted text-[10px] block mb-1">Text Color</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={textConfig.color || '#FFFFFF'}
                  onChange={(e) => handleUpdateText({ color: e.target.value })}
                  className="w-7 h-7 rounded border border-white/[0.1] bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="text"
                  value={textConfig.color || '#FFFFFF'}
                  onChange={(e) => handleUpdateText({ color: e.target.value })}
                  className="w-full bg-transparent font-mono text-xs text-white uppercase focus:outline-none"
                />
              </div>
            </div>

            {/* Stroke / Outline */}
            <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-vc-text-muted">Stroke</span>
                <span className="text-vc-text-secondary font-mono">{textConfig.stroke_width || 0}px</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={textConfig.stroke_color || '#000000'}
                  onChange={(e) => handleUpdateText({ stroke_color: e.target.value })}
                  className="w-7 h-7 rounded border border-white/[0.1] bg-transparent cursor-pointer shrink-0"
                />
                <input
                  type="range"
                  min="0"
                  max="6"
                  step="1"
                  value={textConfig.stroke_width || 0}
                  onChange={(e) => handleUpdateText({ stroke_width: parseInt(e.target.value) || 0 })}
                  className="w-full accent-white cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Drop Shadow */}
          <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
            <div className="flex items-center justify-between text-[10px] mb-1">
              <span className="text-vc-text-muted">Drop Shadow</span>
              <span className="text-vc-text-secondary font-mono">{textConfig.shadow_blur || 0}px</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={textConfig.shadow_color || '#000000'}
                onChange={(e) => handleUpdateText({ shadow_color: e.target.value })}
                className="w-7 h-7 rounded border border-white/[0.1] bg-transparent cursor-pointer shrink-0"
              />
              <input
                type="range"
                min="0"
                max="16"
                step="1"
                value={textConfig.shadow_blur || 0}
                onChange={(e) => handleUpdateText({ shadow_blur: parseInt(e.target.value) || 0 })}
                className="w-full accent-white cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 4. Background Box */}
        <div className="space-y-3 pt-3 border-t border-white/[0.08]">
          <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider">
            Background Box
          </label>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
              <span className="text-vc-text-muted text-[10px] block mb-1">Color</span>
              <input
                type="color"
                value={textConfig.background_color ? textConfig.background_color.slice(0, 7) : '#000000'}
                onChange={(e) => handleUpdateText({ background_color: `${e.target.value}D9` })}
                className="w-full h-7 rounded border border-white/[0.1] bg-transparent cursor-pointer"
              />
            </div>

            <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-vc-text-muted">Padding</span>
                <span className="font-mono text-vc-text-secondary">{textConfig.background_padding || 0}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                step="2"
                value={textConfig.background_padding || 0}
                onChange={(e) =>
                  handleUpdateText({ background_padding: parseInt(e.target.value) || 0 })
                }
                className="w-full accent-white cursor-pointer mt-1"
              />
            </div>

            <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-vc-text-muted">Radius</span>
                <span className="font-mono text-vc-text-secondary">
                  {textConfig.background_corner_radius || 0}px
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                step="2"
                value={textConfig.background_corner_radius || 0}
                onChange={(e) =>
                  handleUpdateText({ background_corner_radius: parseInt(e.target.value) || 0 })
                }
                className="w-full accent-white cursor-pointer mt-1"
              />
            </div>
          </div>
        </div>

        {/* 5. Motion & Animation */}
        <div className="space-y-3 pt-3 border-t border-white/[0.08]">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-vc-text-secondary" />
              <span>Motion & Animation</span>
            </label>
            <span className="text-[10px] font-mono text-vc-text-secondary uppercase">
              {textConfig.animation || 'none'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-vc-text-muted text-[10px] block mb-1">Preset</span>
              <select
                value={textConfig.animation || 'none'}
                onChange={(e) => handleUpdateText({ animation: e.target.value as EditorTextAnimation })}
                className="w-full bg-vc-canvas border border-vc-border rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-white/30"
              >
                <option value="none">None (Instant)</option>
                <option value="pop">Pop & Spring</option>
                <option value="slide_up">Slide Up</option>
                <option value="fade">Smooth Fade</option>
                <option value="scale">Smooth Scale</option>
                <option value="bounce_lite">Subtle Bounce</option>
                <option value="typewriter">Typewriter Reveal</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-vc-text-muted">Duration</span>
                <span className="font-mono text-vc-text-secondary">
                  {(textConfig.animation_duration || 0.45).toFixed(2)}s
                </span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1.5"
                step="0.05"
                value={textConfig.animation_duration || 0.45}
                onChange={(e) =>
                  handleUpdateText({ animation_duration: parseFloat(e.target.value) || 0.45 })
                }
                className="w-full accent-white cursor-pointer mt-1"
              />
            </div>
          </div>
        </div>

        {/* 6. Transform & Positioning */}
        <div className="space-y-3 pt-3 border-t border-white/[0.08]">
          <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider">
            Transform
          </label>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
              <span className="text-vc-text-muted text-[10px] block mb-1">Position X</span>
              <input
                type="number"
                value={Math.round(selectedItem.transform?.position_x || 0)}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      position_x: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full bg-vc-surface1 border border-vc-border rounded px-2 py-1 text-white font-mono"
              />
            </div>

            <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
              <span className="text-vc-text-muted text-[10px] block mb-1">Position Y</span>
              <input
                type="number"
                value={Math.round(selectedItem.transform?.position_y || 0)}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      position_y: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full bg-vc-surface1 border border-vc-border rounded px-2 py-1 text-white font-mono"
              />
            </div>

            <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-vc-text-muted">Scale</span>
                <span className="font-mono text-vc-text-secondary">
                  {(selectedItem.transform?.scale || 1.0).toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.05"
                value={selectedItem.transform?.scale || 1.0}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      scale: parseFloat(e.target.value) || 1.0,
                    },
                  })
                }
                className="w-full accent-white cursor-pointer"
              />
            </div>

            <div className="bg-vc-canvas p-2 rounded-lg border border-vc-border">
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className="text-vc-text-muted">Opacity</span>
                <span className="font-mono text-vc-text-secondary">
                  {Math.round((selectedItem.transform?.opacity ?? 1.0) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.05"
                value={selectedItem.transform?.opacity ?? 1.0}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      opacity: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-white cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* 7. Layer Ordering */}
        <div className="space-y-2 pt-3 border-t border-white/[0.08]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-vc-text-secondary" />
              <span>Layer Ordering</span>
            </span>
            <span className="text-[10px] font-mono text-vc-text-secondary">
              Z-Index: {selectedItem.z_index || 20}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleReorderLayer('forward')}
              className="py-1.5 px-3 rounded-lg bg-vc-canvas border border-vc-border hover:bg-white/[0.06] text-vc-text-primary flex items-center justify-center gap-1.5 transition"
            >
              <ArrowUp className="w-3.5 h-3.5 text-vc-text-secondary" />
              <span>Bring Forward</span>
            </button>
            <button
              onClick={() => handleReorderLayer('backward')}
              className="py-1.5 px-3 rounded-lg bg-vc-canvas border border-vc-border hover:bg-white/[0.06] text-vc-text-primary flex items-center justify-center gap-1.5 transition"
            >
              <ArrowDown className="w-3.5 h-3.5 text-vc-text-secondary" />
              <span>Send Backward</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // If a track item is actively selected on timeline/canvas, show item property inspector
  if (selectedItem) {
    return (
      <aside className="w-[350px] shrink-0 z-20 flex flex-col gap-4 min-h-0 overflow-y-auto border-r border-vc-border bg-vc-surface1 p-4 text-xs text-vc-text-secondary select-none">
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-vc-text-secondary" />
            <h3 className="font-semibold text-white text-sm">Item Properties</h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] border border-vc-border text-vc-text-secondary uppercase">
            {selectedItem.type}
          </span>
        </div>

        {/* Transform section */}
        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider">
            Transform
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-vc-canvas p-2.5 rounded-lg border border-vc-border">
              <span className="text-vc-text-muted block mb-1">Position X</span>
              <input
                type="number"
                value={Math.round(selectedItem.transform?.position_x || 0)}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      position_x: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full bg-vc-surface1 border border-vc-border rounded px-2 py-1 text-white"
              />
            </div>

            <div className="bg-vc-canvas p-2.5 rounded-lg border border-vc-border">
              <span className="text-vc-text-muted block mb-1">Position Y</span>
              <input
                type="number"
                value={Math.round(selectedItem.transform?.position_y || 0)}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      position_y: parseFloat(e.target.value) || 0,
                    },
                  })
                }
                className="w-full bg-vc-surface1 border border-vc-border rounded px-2 py-1 text-white"
              />
            </div>

            <div className="bg-vc-canvas p-2.5 rounded-lg border border-vc-border">
              <span className="text-vc-text-muted block mb-1">Scale</span>
              <input
                type="range"
                min="0.2"
                max="3.0"
                step="0.05"
                value={selectedItem.transform?.scale || 1.0}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      scale: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-white cursor-pointer"
              />
              <span className="text-[10px] text-vc-text-secondary text-right block mt-0.5">
                {(selectedItem.transform?.scale || 1.0).toFixed(2)}x
              </span>
            </div>

            <div className="bg-vc-canvas p-2.5 rounded-lg border border-vc-border">
              <span className="text-vc-text-muted block mb-1">Opacity</span>
              <input
                type="range"
                min="0"
                max="1.0"
                step="0.05"
                value={selectedItem.transform?.opacity ?? 1.0}
                onChange={(e) =>
                  onUpdateItem(selectedItem.id, {
                    transform: {
                      ...selectedItem.transform,
                      opacity: parseFloat(e.target.value),
                    },
                  })
                }
                className="w-full accent-white cursor-pointer"
              />
              <span className="text-[10px] text-vc-text-secondary text-right block mt-0.5">
                {Math.round((selectedItem.transform?.opacity ?? 1.0) * 100)}%
              </span>
            </div>
          </div>
        </div>

        {/* Text specific settings */}
        {selectedItem.type === 'TEXT' && selectedItem.text && (
          <div className="space-y-3 pt-3 border-t border-white/[0.08]">
            <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider">
              Text & Font
            </label>
            <input
              type="text"
              value={selectedItem.text.text}
              onChange={(e) =>
                onUpdateItem(selectedItem.id, {
                  text: { ...selectedItem.text!, text: e.target.value },
                })
              }
              className="w-full bg-vc-canvas border border-vc-border rounded px-2 py-1.5 text-white text-xs"
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-vc-text-muted text-[10px] block mb-1">Font</span>
                <select
                  value={selectedItem.text.font_family || 'Arial'}
                  onChange={(e) =>
                    onUpdateItem(selectedItem.id, {
                      text: { ...selectedItem.text!, font_family: e.target.value as any },
                    })
                  }
                  className="w-full bg-vc-canvas border border-vc-border rounded p-1 text-xs text-white"
                >
                  {SAFE_EDITOR_FONTS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="text-vc-text-muted text-[10px] block mb-1">Color</span>
                <input
                  type="color"
                  value={selectedItem.text.color || '#FFFFFF'}
                  onChange={(e) =>
                    onUpdateItem(selectedItem.id, {
                      text: { ...selectedItem.text!, color: e.target.value },
                    })
                  }
                  className="w-full h-8 bg-vc-canvas rounded cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {/* Color grading & filters for video */}
        {selectedItem.type === 'VIDEO' && (
          <div className="space-y-3 pt-3 border-t border-white/[0.08]">
            <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider">
              Cinematic Color Grade
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {EDITOR_FILTER_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() =>
                    onUpdateItem(selectedItem.id, {
                      filter: { preset: p as EditorFilterPreset, intensity: 1.0 },
                    })
                  }
                  className={`p-2 rounded-lg border text-center capitalize transition ${
                    selectedItem.filter?.preset === p
                      ? 'bg-white/[0.10] border-white/40 text-white font-bold'
                      : 'bg-vc-canvas border-white/[0.08] hover:border-white/20 text-vc-text-secondary'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Per-clip audio controls for audio items (volume / mute / fades → export) */}
        {selectedItem.type === 'AUDIO' && (
          <AudioClipControls item={selectedItem} onUpdateItem={onUpdateItem} />
        )}

        {/* Title card (intro/outro) text + background */}
        {selectedItem.is_title_card && (
          <div className="space-y-3 pt-3 border-t border-white/[0.08]">
            <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider">
              Title Card
            </label>
            <input
              type="text"
              value={selectedItem.title_card_text || ''}
              onChange={(e) => onUpdateItem(selectedItem.id, { title_card_text: e.target.value })}
              placeholder="Title text"
              className="w-full bg-vc-canvas border border-vc-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
            />
            <div className="flex items-center gap-2">
              <span className="text-vc-text-secondary text-[10px] font-medium">Background</span>
              <input
                type="color"
                value={selectedItem.background_color || '#0B0D12'}
                onChange={(e) => onUpdateItem(selectedItem.id, { background_color: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent"
                aria-label="Title card background color"
              />
              <span className="text-[10px] font-mono text-vc-text-secondary">{selectedItem.background_color || '#0B0D12'}</span>
            </div>
          </div>
        )}
      </aside>
    );
  }

  // When no item is selected, display the tool panel for the active sidebar tab
  return (
    <aside
      className="w-[350px] bg-vc-surface1/95 backdrop-blur-2xl border-r border-white/[0.08] flex flex-col text-xs text-vc-text-secondary overflow-y-auto select-none shrink-0 z-20 shadow-[12px_0_40px_rgba(0,0,0,0.65)] p-4 gap-3 animate-panelSlideIn"
    >
      {/* 1. CAPTIONS TAB */}
      {activeSidebarTab === 'captions' && (() => {
        const captionTrack = project.tracks.find((t) => t.type === 'CAPTION');
        const captionItem = captionTrack?.items[0];

        const captionsHidden = Boolean(captionTrack?.hidden);
        const galleryPresetId = getEditorCaptionPresetId(captionItem?.caption);
        const selectedPresetId: CaptionPresetId | null = captionsHidden ? 'none' : galleryPresetId;
        const legacyStyleLabel =
          !captionsHidden && !galleryPresetId ? String(captionItem?.caption?.style || clip?.caption_style || 'clean') : null;
        const resolvedCaptionStyle = captionsHidden
          ? null
          : resolveEditorCaptionStyle(captionItem?.caption, project.canvas.aspect_ratio);

        const handleUpdateCaptionProperties = (updates: Partial<EditorCaptionItem>) => {
          onUpdateProject((prev) => ({
            ...prev,
            tracks: prev.tracks.map((t) => {
              if (t.type !== 'CAPTION') return t;
              return {
                ...t,
                items: t.items.map((i) => ({
                  ...i,
                  caption: {
                    cues: i.caption?.cues || [],
                    style: i.caption?.style || 'clean',
                    position: i.caption?.position || 'bottom',
                    highlight_color: i.caption?.highlight_color || '#FFE600',
                    primary_color: i.caption?.primary_color || '#FFFFFF',
                    ...i.caption,
                    ...updates,
                  },
                })),
              };
            }),
          }));
        };

        const handleSelectCaptionPreset = (presetId: CaptionPresetId) => {
          if (keepColors && presetId !== 'none') {
            onUpdateProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) => {
                if (t.type !== 'CAPTION') return t;
                return {
                  ...t,
                  hidden: false,
                  items: t.items.map((i) => {
                    const currentPrimary = i.caption?.primary_color;
                    const currentHighlight = i.caption?.highlight_color;
                    const currentStroke = i.caption?.stroke_color;
                    const applied = applyPresetToEditorCaption(i.caption, presetId);
                    return {
                      ...i,
                      caption: {
                        ...applied,
                        ...(currentPrimary ? { primary_color: currentPrimary } : {}),
                        ...(currentHighlight ? { highlight_color: currentHighlight } : {}),
                        ...(currentStroke ? { stroke_color: currentStroke } : {}),
                      },
                    };
                  }),
                };
              }),
            }));
          } else {
            onApplyCaptionPreset(presetId);
          }
        };

        return (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.08]">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-white/[0.06] border border-white/[0.10] flex items-center justify-center text-white shadow-sm">
                  <Subtitles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm tracking-tight">Caption Studio</h3>
                  <span className="text-[10px] text-vc-text-secondary">Spatial Typography & Styling</span>
                </div>
              </div>
              {selectedPresetId && selectedPresetId !== 'none' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.08] border border-white/[0.12] text-vc-text-primary capitalize">
                  {selectedPresetId.replace('_', ' ')}
                </span>
              )}
            </div>

            {/* One tab bar. The old second level duplicated the first — "All Controls" was
                literally Typography + Effects — so it is gone; sections collapse instead. */}
            <div role="tablist" aria-label="Caption Studio Sections" className={SEGMENTED_GROUP}>
              {CAPTION_STUDIO_TABS.map((t) => {
                const TabIcon = t.icon;
                const active = captionStudioTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    id={`caption-tab-${t.id}`}
                    aria-selected={active}
                    aria-controls={`caption-panel-${t.id}`}
                    onClick={() => setCaptionStudioTab(t.id)}
                    className={`${SEGMENTED_ITEM} ${active ? SEGMENTED_ITEM_ACTIVE : SEGMENTED_ITEM_IDLE}`}
                  >
                    <TabIcon className="w-3.5 h-3.5" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* One disabled state for the whole studio — it used to be duplicated per tab. */}
            {captionsHidden ? (
              <PanelEmpty
                icon={Subtitles}
                title="Captions are off for this clip"
                hint="Turn them on with a starter preset, then style them here."
                action={{
                  label: 'Enable Simple preset',
                  onClick: () => handleSelectCaptionPreset('simple'),
                }}
              />
            ) : captionStudioTab === 'styles' ? (
              <div
                role="tabpanel"
                id="caption-panel-styles"
                aria-labelledby="caption-tab-styles"
                className="space-y-4"
              >
                <CaptionPresetGallery
                  selectedId={selectedPresetId}
                  onSelect={handleSelectCaptionPreset}
                  legacyStyleLabel={legacyStyleLabel}
                  hasWordTiming={hasWordTiming}
                  resolvedStyle={resolvedCaptionStyle}
                  keepColors={keepColors}
                  onToggleKeepColors={setKeepColors}
                />

                <div className="pt-2 border-t border-vc-border">
                  <div className="flex items-center justify-between mb-2">
                    <span className={SECTION_LABEL} id="caption-position-label">
                      Preset Position
                    </span>
                    <span className="text-[10px] text-vc-text-muted">Drag on the preview to place</span>
                  </div>
                  <div role="radiogroup" aria-labelledby="caption-position-label" className="grid grid-cols-3 gap-1.5">
                    {(['top', 'center', 'bottom'] as const).map((pos) => {
                      const active = (captionItem?.caption?.position || 'bottom') === pos;
                      return (
                        <button
                          key={pos}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => handleUpdateCaptionProperties({ position: pos })}
                          className={`py-1.5 rounded-lg border text-xs capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                            active
                              ? 'bg-white/[0.12] border-white/40 text-vc-text-primary font-semibold'
                              : 'bg-vc-canvas border-vc-border text-vc-text-muted hover:text-vc-text-primary'
                          }`}
                        >
                          {pos}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div
                role="tabpanel"
                id={`caption-panel-${captionStudioTab}`}
                aria-labelledby={`caption-tab-${captionStudioTab}`}
                className="space-y-4"
              >
                <CaptionStyleCustomizer
                  captionItem={captionItem?.caption}
                  resolvedStyle={resolvedCaptionStyle}
                  activeTab={captionStudioTab === 'typography' ? 'font' : 'effects'}
                  onChange={handleUpdateCaptionProperties}
                />
              </div>
            )}
          </div>
        );
      })()}

      {/* 2. FRAMING / LAYOUT TAB */}
      {activeSidebarTab === 'layout' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/[0.08]">
            <Crop className="w-4 h-4 text-vc-text-secondary" />
            <h3 className="font-semibold text-white text-sm">Framing & Aspect Ratio</h3>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider block mb-2">
              Canvas Dimensions
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['9:16', '1:1', '16:9'] as ClipAspectRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => {
                    const width = ratio === '9:16' ? 1080 : ratio === '1:1' ? 1080 : 1920;
                    const height = ratio === '9:16' ? 1920 : ratio === '1:1' ? 1080 : 1080;
                    onUpdateProject((prev) => ({
                      ...prev,
                      canvas: { ...prev.canvas, aspect_ratio: ratio, width, height },
                    }));
                  }}
                  className={`p-3 rounded-xl border text-center transition ${
                    project.canvas.aspect_ratio === ratio
                      ? 'bg-white/[0.10] border-white/40 text-white font-bold ring-1 ring-white/25'
                      : 'bg-vc-canvas border-white/[0.08] hover:border-white/20 text-vc-text-secondary'
                  }`}
                >
                  <div className="text-sm font-semibold">{ratio}</div>
                  <div className="text-[10px] text-vc-text-muted mt-0.5">
                    {ratio === '9:16' ? 'Vertical' : ratio === '1:1' ? 'Square' : 'Landscape'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-white/[0.08]">
            <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider block mb-2">
              Crop & Smart Reframe
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onUpdateCropMode('center')}
                className="p-2.5 rounded-lg bg-vc-canvas border border-vc-border hover:border-white/20 text-vc-text-secondary text-left"
              >
                <div className="font-semibold text-xs">Center Fill</div>
                <div className="text-[10px] text-vc-text-muted">Fixed center crop</div>
              </button>
              <button
                onClick={() => onUpdateCropMode('smart')}
                className="p-2.5 rounded-lg bg-white/[0.08] border border-white/25 text-white text-left"
              >
                <div className="font-semibold text-xs flex items-center gap-1 text-vc-text-secondary">
                  <Sparkles className="w-3 h-3" />
                  <span>Smart Reframe</span>
                </div>
                <div className="text-[10px] text-vc-text-secondary">Speaker face tracking</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. TEXT TAB */}
      {activeSidebarTab === 'text' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-white/[0.08]">
            <Type className="w-4 h-4 text-vc-text-secondary" />
            <h3 className="font-semibold text-white text-sm">Text & Titles</h3>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-vc-text-secondary uppercase tracking-wider block">
              Add Text Overlay
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newTextString}
                onChange={(e) => setNewTextString(e.target.value)}
                placeholder="Title text..."
                className="flex-1 bg-vc-canvas border border-vc-border rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-white/30"
              />
              <button
                onClick={() => {
                  if (newTextString.trim()) {
                    onAddTextLayer(newTextString.trim());
                  }
                }}
                className="px-3 py-2 rounded-lg bg-[#F4F6FB] text-[#0B0C0F] hover:bg-white flex items-center gap-1 font-medium transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. AI TOOLS DRAWER — guided grouped tools with hover/focus previews */}
      {activeSidebarTab === 'ai_tools' && (
        <AiToolsPanel
          activeToolId={aiToolId}
          onSelectToolId={setAiToolId}
          onActivate={handleActivateAiTool}
        />
      )}

      {/* Fallback info when another tab is active */}
      {['transcript', 'audio', 'broll', 'translate', 'brand', 'media'].includes(activeSidebarTab) && (
        <div className="p-4 bg-vc-canvas rounded-xl border border-vc-border text-xs text-vc-text-secondary leading-relaxed text-center">
          <span className="capitalize font-semibold text-vc-text-primary block mb-1">
            {activeSidebarTab === 'broll' ? 'B-Roll' : activeSidebarTab === 'media' ? 'Library' : activeSidebarTab} Active
          </span>
          Use the left drawer and main editing canvas to work with {activeSidebarTab === 'broll' ? 'B-Roll' : activeSidebarTab === 'media' ? 'library' : activeSidebarTab} assets.
        </div>
      )}
    </aside>
  );
};
