import React from 'react';
import {
  Infinity as InfinityIcon,
} from 'lucide-react';
import { EditorProject, EditorTextAnimation, EditorTransition, EditorTrackItem } from '../../types';
import { TransitionPicker } from './TransitionPicker';

interface MotionWorkspacePanelProps {
  project: EditorProject;
  selectedItemId: string | null;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject) => void;
  onUpdateItemTransform?: (itemId: string, transform: any) => void;
}

interface AnimationPreset {
  id: EditorTextAnimation;
  label: string;
  description: string;
  category: 'kinetic' | 'entrance' | 'emphasis';
}

const MOTION_PRESETS: AnimationPreset[] = [
  { id: 'pop', label: 'Pop In', description: 'Energetic scale bounce entrance', category: 'kinetic' },
  { id: 'fade', label: 'Smooth Fade', description: 'Gentle opacity crossfade', category: 'entrance' },
  { id: 'slide_up', label: 'Slide Up', description: 'Dynamic directional motion', category: 'entrance' },
  { id: 'typewriter', label: 'Typewriter', description: 'Sequential letter-by-letter reveal', category: 'kinetic' },
  { id: 'scale', label: 'Smooth Scale', description: 'Fluid zoom scale transition', category: 'emphasis' },
  { id: 'bounce_lite', label: 'Playful Bounce', description: 'Spring-damped vertical overshoot', category: 'kinetic' },
  { id: 'none', label: 'Static (None)', description: 'Clean instant appearance with no animation', category: 'entrance' },
];

export const MotionWorkspacePanel: React.FC<MotionWorkspacePanelProps> = ({
  project,
  selectedItemId,
  onUpdateProject,
}) => {
  // Find selected item if any
  const selectedItem = project.tracks.flatMap((t) => t.items).find((i) => i.id === selectedItemId);
  const currentAnimation = selectedItem?.text?.animation || 'pop';

  // Video transitions apply at the boundary between consecutive VIDEO items.
  const videoItems: EditorTrackItem[] = project.tracks
    .filter((t) => t.type === 'VIDEO' && !t.hidden)
    .flatMap((t) => t.items.filter((i) => !i.hidden))
    .sort((a, b) => a.timeline_start - b.timeline_start);
  const selectedVideoItem = videoItems.find((i) => i.id === selectedItemId) ?? null;
  const transitionTarget: EditorTrackItem | null =
    selectedVideoItem && videoItems.indexOf(selectedVideoItem) > 0 ? selectedVideoItem : null;

  const handleSelectTransition = (transition: EditorTransition | undefined) => {
    const target = transitionTarget;
    if (!target) return;
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => ({
        ...t,
        items: t.items.map((i) =>
          i.id === target.id ? { ...i, transition_in: transition } : i
        ),
      })),
    }));
  };

  const handleSelectAnimation = (anim: EditorTextAnimation) => {
    if (selectedItem) {
      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => ({
          ...t,
          items: t.items.map((i) =>
            i.id === selectedItem.id
              ? {
                  ...i,
                  text: i.text ? { ...i.text, animation: anim } : undefined,
                }
              : i
          ),
        })),
      }));
    } else {
      // Apply to all text and caption layers as default
      onUpdateProject((prev) => ({
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.type === 'TEXT') {
            return {
              ...t,
              items: t.items.map((i) => ({
                ...i,
                text: i.text ? { ...i.text, animation: anim } : undefined,
              })),
            };
          }
          return t;
        }),
      }));
    }
  };

  return (
    <div className="flex flex-col h-full bg-vc-surface1 text-neutral-300 text-xs select-none overflow-y-auto p-4 space-y-4 animate-panelSlideIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-white">
            <InfinityIcon className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Motion & Transitions</h3>
            <p className="text-[10px] text-neutral-400">Object entrance, animations & pacing</p>
          </div>
        </div>
      </div>

      {/* Target Notification */}
      <div className="p-2.5 rounded-xl bg-vc-canvas text-[11px] text-neutral-400">
        {selectedItem ? (
          <span className="text-white font-medium">
            Applying motion to: <span className="text-violet-300">{selectedItem.name || selectedItem.type}</span>
          </span>
        ) : (
          <span>Select an overlay or title on canvas to customize its animation. Defaulting to all text layers.</span>
        )}
      </div>

      {/* Section 1: Animation Presets */}
      <div>
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Animation Style
        </label>
        <div className="grid grid-cols-2 gap-2">
          {MOTION_PRESETS.map((preset) => {
            const isActive = currentAnimation === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectAnimation(preset.id)}
                className={`p-3 rounded-xl border text-left transition ${
                  isActive
                    ? 'bg-white/[0.12] border-white/40 text-white shadow-sm ring-1 ring-white/20'
                    : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
                }`}
              >
                <div className="font-semibold text-xs flex items-center justify-between">
                  <span>{preset.label}</span>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="text-[10px] text-neutral-500 mt-1 leading-tight">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Section 2: Video Transition Style (CapCut-style animated presets) */}
      <div className="pt-3 border-t border-white/[0.08]">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-1">
          Timeline Cut Transitions
        </label>
        <p className="text-[10px] text-neutral-500 mb-2">
          {transitionTarget ? (
            <>Applied at the start of <span className="text-violet-300">{transitionTarget.name || 'the selected clip'}</span>.</>
          ) : (
            'Select the second or later clip on the video track to set its entrance transition.'
          )}
        </p>
        <TransitionPicker
          currentTransition={transitionTarget?.transition_in}
          onSelect={handleSelectTransition}
          disabled={!transitionTarget}
        />
      </div>
    </div>
  );
};
