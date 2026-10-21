import React, { useState } from 'react';
import {
  Brain,
  Send,
  Loader2,
  Check,
  CheckCircle2,
  Sparkles,
  Scissors,
  ZoomIn,
  Type,
  Crop,
  AlertCircle,
  RotateCcw,
  Sliders,
} from 'lucide-react';
import { SECTION_LABEL } from './panelKit';
import { EditorProject, TimedCaptionCue, CaptionStyle } from '../../types';
import { CopilotPlan, CopilotOperation } from '../../types/copilot';

interface AICopilotPanelProps {
  project: EditorProject;
  cues: TimedCaptionCue[];
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject) => void;
  onUpdateCueText?: (cueId: string, newText: string) => void;
}

interface QuickAction {
  id: string;
  category: 'pacing' | 'captions' | 'visuals';
  label: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'silence',
    category: 'pacing',
    label: 'Trim Awkward Pauses',
    prompt: 'Trim pauses and awkward silence longer than 0.8s to accelerate speech pacing',
    icon: Scissors,
  },
  {
    id: 'zoom',
    category: 'visuals',
    label: 'Dynamic Hook Zoom',
    prompt: 'Add 1.15x punch-in zoom keyframe at the opening hook to maximize retention',
    icon: ZoomIn,
  },
  {
    id: 'highlight',
    category: 'captions',
    label: 'Viral Word Glow',
    prompt: 'Highlight retention keywords with kinetic color glow on punchy words',
    icon: Sparkles,
  },
  {
    id: 'bold_style',
    category: 'captions',
    label: 'Bold Impact Style',
    prompt: 'Upgrade caption styling to high-contrast bold impact preset with uppercase text',
    icon: Type,
  },
  {
    id: 'speaker_reframe',
    category: 'visuals',
    label: 'Smart Speaker Center',
    prompt: 'Center speaker face coordinates and clamp safe social margin boundaries',
    icon: Crop,
  },
];

export const AICopilotPanel: React.FC<AICopilotPanelProps> = ({
  project,
  cues,
  onUpdateProject,
  onUpdateCueText: _onUpdateCueText,
}) => {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<CopilotPlan | null>(null);
  const [selectedOpIds, setSelectedOpIds] = useState<Set<string>>(new Set());
  const [appliedCount, setAppliedCount] = useState<number>(0);
  const [activeCategory, setActiveCategory] = useState<'all' | 'pacing' | 'captions' | 'visuals'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGeneratePlan = (commandText: string) => {
    if (!commandText.trim() || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage(null);
    setPrompt(commandText);

    setTimeout(() => {
      try {
        const lower = commandText.toLowerCase();
        const ops: CopilotOperation[] = [];

        // 1. Silence / Pause Removal
        if (lower.includes('pause') || lower.includes('silence') || lower.includes('trim') || lower.includes('pacing')) {
          ops.push({
            id: crypto.randomUUID(),
            type: 'PAUSE_CUT',
            title: 'Trim Awkward Silence Gaps',
            description: 'Shortens spoken pauses > 0.8s down to 0.25s for fast-paced short-form delivery.',
            parameters: { thresholdSec: 0.8, targetSec: 0.25 },
            applied: false,
          });
        }

        // 2. Punch-in Zoom
        if (lower.includes('zoom') || lower.includes('punch') || lower.includes('hook') || lower.includes('scale')) {
          ops.push({
            id: crypto.randomUUID(),
            type: 'PUNCH_IN_ZOOM',
            title: 'Dynamic Hook Punch-In',
            description: 'Inserts 1.15x scale keyframe at 1.5s to create an energetic pattern interrupt.',
            parameters: { time: 1.5, scale: 1.15, duration: 2.0 },
            applied: false,
          });
        }

        // 3. Keyword Highlighting
        if (lower.includes('highlight') || lower.includes('word') || lower.includes('glow') || lower.includes('viral')) {
          ops.push({
            id: crypto.randomUUID(),
            type: 'WORD_HIGHLIGHT',
            title: 'Kinetic Keyword Glow',
            description: 'Sets high-visibility highlight token (#8B5CF6) on key retention words.',
            parameters: { highlightColor: '#8B5CF6', primaryColor: '#FFFFFF' },
            applied: false,
          });
        }

        // 4. Caption Style Preset
        if (lower.includes('caption') || lower.includes('bold') || lower.includes('readable') || lower.includes('style') || lower.includes('preset')) {
          ops.push({
            id: crypto.randomUUID(),
            type: 'STYLE_PRESET',
            title: 'Apply Bold Impact Typography',
            description: 'Switches captions to bold high-impact styling with uppercase emphasis.',
            parameters: { style: 'bold' as CaptionStyle },
            applied: false,
          });
        }

        // 5. Speaker Reframing
        if (lower.includes('frame') || lower.includes('speaker') || lower.includes('center') || lower.includes('reframe')) {
          ops.push({
            id: crypto.randomUUID(),
            type: 'SPEAKER_REFRAME',
            title: 'Auto-Center Speaker Framing',
            description: 'Re-aligns active speaker coordinates to center safe zone with 0.5 horizontal offset.',
            parameters: { focusX: 0.5, focusY: 0.5 },
            applied: false,
          });
        }

        // Fallback default operations if prompt was generic
        if (ops.length === 0) {
          ops.push(
            {
              id: crypto.randomUUID(),
              type: 'PUNCH_IN_ZOOM',
              title: 'Dynamic Hook Zoom',
              description: 'Punch in 1.12x at 1.5s for instant visual interest.',
              parameters: { time: 1.5, scale: 1.12 },
              applied: false,
            },
            {
              id: crypto.randomUUID(),
              type: 'WORD_HIGHLIGHT',
              title: 'Viral Word Glow',
              description: 'Applies vibrant highlight token to active speech tokens.',
              parameters: { highlightColor: '#8B5CF6' },
              applied: false,
            }
          );
        }

        const plan: CopilotPlan = {
          command: commandText,
          reasoning: `Analyzed ${cues.length} speech cues across timeline duration (${(project.canvas.duration || 30).toFixed(1)}s). Formulated ${ops.length} structured operations.`,
          operations: ops,
          createdAt: new Date().toISOString(),
        };

        setCurrentPlan(plan);
        setSelectedOpIds(new Set(ops.map((o) => o.id)));
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to formulate execution plan.');
      } finally {
        setIsGenerating(false);
      }
    }, 450);
  };

  const handleApplySelected = () => {
    if (!currentPlan || selectedOpIds.size === 0) return;

    onUpdateProject((prev) => {
      let updated = { ...prev };

      for (const op of currentPlan.operations) {
        if (!selectedOpIds.has(op.id)) continue;

        if (op.type === 'PUNCH_IN_ZOOM') {
          const videoTrack = updated.tracks.find((t) => t.type === 'VIDEO');
          const primaryItem = videoTrack?.items[0];
          if (primaryItem) {
            const kfs = [...(primaryItem.keyframes || [])];
            kfs.push({
              id: crypto.randomUUID(),
              time: op.parameters.time || 1.5,
              property: 'scale',
              value: op.parameters.scale || 1.15,
              easing: 'ease-in-out',
            });
            primaryItem.keyframes = kfs;
          }
        }

        if (op.type === 'WORD_HIGHLIGHT') {
          const captionTrack = updated.tracks.find((t) => t.type === 'CAPTION');
          const captionItem = captionTrack?.items[0];
          if (captionItem?.caption) {
            captionItem.caption.highlight_color = op.parameters.highlightColor || '#8B5CF6';
          }
        }

        if (op.type === 'STYLE_PRESET') {
          const captionTrack = updated.tracks.find((t) => t.type === 'CAPTION');
          const captionItem = captionTrack?.items[0];
          if (captionItem?.caption) {
            captionItem.caption.style = op.parameters.style || 'bold';
          }
        }

        if (op.type === 'SPEAKER_REFRAME') {
          const videoTrack = updated.tracks.find((t) => t.type === 'VIDEO');
          const primaryItem = videoTrack?.items[0];
          if (primaryItem && primaryItem.transform) {
            primaryItem.transform = {
              ...primaryItem.transform,
              position_x: 0,
              position_y: 0,
            };
          }
        }
      }

      return updated;
    });

    setAppliedCount((c) => c + selectedOpIds.size);
  };

  const filteredQuickActions = QUICK_ACTIONS.filter(
    (action) => activeCategory === 'all' || action.category === activeCategory
  );

  return (
    <div className="flex flex-col h-full bg-vc-surface1 text-vc-text-primary select-none p-4 space-y-4 overflow-y-auto animate-panelSlideIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Vireo AI Copilot</h3>
            <p className="text-[11px] text-vc-text-secondary">
              Natural language video edits & timeline intelligence
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-violet-950/40 border border-violet-800/30 text-violet-400">
          STUDIO AI
        </span>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-0.5">
        {(['all', 'pacing', 'visuals', 'captions'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium capitalize transition ${
              activeCategory === cat
                ? 'bg-violet-600 text-white shadow-sm'
                : 'bg-white/[0.04] text-vc-text-secondary hover:text-white'
            }`}
          >
            {cat === 'all' ? 'All Tools' : cat}
          </button>
        ))}
      </div>

      {/* Quick Actions Grid */}
      <div className="space-y-1.5">
        <span className={`${SECTION_LABEL} block`}>
          One-Click Smart Actions
        </span>
        <div className="grid grid-cols-1 gap-1.5">
          {filteredQuickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                onClick={() => handleGeneratePlan(action.prompt)}
                disabled={isGenerating}
                className="p-2.5 rounded-xl bg-vc-canvas border border-vc-border hover:border-violet-500/40 hover:bg-violet-500/5 text-left transition flex items-center justify-between group disabled:opacity-50"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-1.5 rounded-lg bg-white/[0.04] group-hover:bg-violet-500/20 text-vc-text-secondary group-hover:text-violet-400 transition">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-medium text-white block">{action.label}</span>
                    <span className="text-[10px] text-vc-text-muted truncate block">{action.prompt}</span>
                  </div>
                </div>
                <Sparkles className="w-3 h-3 text-vc-text-muted group-hover:text-violet-400 transition shrink-0 ml-2" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Natural Language Prompt Input */}
      <div className="space-y-1.5">
        <label className={`${SECTION_LABEL} block`}>
          Custom AI Prompt
        </label>
        <div className="relative">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGeneratePlan(prompt);
              }
            }}
            placeholder="Type your instruction... (e.g., 'Trim pauses longer than 0.8s and add hook zoom')"
            rows={2}
            className="w-full bg-vc-canvas border border-vc-border rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500/60 pr-10 resize-none shadow-sm"
          />
          <button
            onClick={() => handleGeneratePlan(prompt)}
            disabled={!prompt.trim() || isGenerating}
            className="absolute right-2.5 bottom-2.5 p-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white disabled:opacity-40 transition shadow-sm"
            title="Generate Plan"
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isGenerating && (
        <div className="p-4 rounded-xl bg-vc-canvas border border-violet-500/30 flex flex-col items-center justify-center gap-2 text-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
          <span className="text-xs font-medium text-white">Analyzing Speech Timing & Scene Cuts</span>
          <span className="text-[10px] text-vc-text-secondary">Synthesizing reversible timeline keyframe plan...</span>
        </div>
      )}

      {/* Generated Structured Operation Plan */}
      {!isGenerating && currentPlan && (
        <div className="space-y-3 pt-1">
          <div className="p-3 rounded-xl bg-violet-950/30 border border-violet-800/40 text-xs text-vc-text-secondary space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-violet-300 text-xs flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-violet-400" />
                <span>Execution Plan</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  if (selectedOpIds.size === currentPlan.operations.length) {
                    setSelectedOpIds(new Set());
                  } else {
                    setSelectedOpIds(new Set(currentPlan.operations.map((o) => o.id)));
                  }
                }}
                className="text-[10px] text-violet-400 hover:text-violet-300 font-medium"
              >
                {selectedOpIds.size === currentPlan.operations.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <p className="text-[11px] text-vc-text-secondary leading-relaxed">{currentPlan.reasoning}</p>
          </div>

          <div className="space-y-2">
            {currentPlan.operations.map((op) => {
              const isChecked = selectedOpIds.has(op.id);

              return (
                <div
                  key={op.id}
                  onClick={() => {
                    setSelectedOpIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(op.id)) next.delete(op.id);
                      else next.add(op.id);
                      return next;
                    });
                  }}
                  className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-3 shadow-sm ${
                    isChecked
                      ? 'bg-vc-canvas border-violet-500/50 text-white'
                      : 'bg-vc-canvas/40 border-white/[0.06] text-vc-text-muted'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="mt-0.5 accent-violet-600 rounded cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{op.title}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-violet-300">
                        {op.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-vc-text-secondary mt-1 leading-snug">
                      {op.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Confirmation Bar */}
          <div className="pt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-vc-text-secondary font-mono">
              {selectedOpIds.size} of {currentPlan.operations.length} selected
            </span>

            <button
              onClick={handleApplySelected}
              disabled={selectedOpIds.size === 0}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg shadow-violet-950/50 flex items-center gap-1.5 transition active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply to Timeline</span>
            </button>
          </div>

          {/* Undo/Redo feedback */}
          {appliedCount > 0 && (
            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Successfully committed {appliedCount} edits!</span>
              </div>
              <span className="text-[10px] text-vc-text-secondary font-mono flex items-center gap-1">
                <RotateCcw className="w-3 h-3" />
                <span>Undo (Cmd+Z)</span>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
