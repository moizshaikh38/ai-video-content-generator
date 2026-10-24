import React from 'react';
import {
  ChevronUp,
} from 'lucide-react';
import { EditorProject, RenderedClip } from '../../types';
import { UpdateProjectOptions } from '../../hooks/useEditorProject';
import { Timeline } from './Timeline';

interface UnifiedTimelineProps {
  project: EditorProject;
  clip?: RenderedClip | null;
  /** Source video the preview plays; the filmstrip grabs instant frames from it. */
  sourceVideoUrl?: string | null;
  playhead: number;
  isPlaying: boolean;
  onPlayheadChange: (time: number) => void;
  onTogglePlay: () => void;
  onUpdateProject: (updated: EditorProject, options?: UpdateProjectOptions) => void;
  onCommitProject?: (preOperationProject: EditorProject) => void;
  selectedItemId: string | null;
  selectedTrackId?: string | null;
  onSelectItem: (itemId: string | null, trackId: string | null) => void;
  onSplit: () => void;
  onRippleDelete: () => void;
  onDuplicate: () => void;
  onFreezeFrame?: () => void;
  onSnapshot?: () => void;
  transportSlot?: React.ReactNode;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onAddIntroOutro?: (position: 'intro' | 'outro') => void;
  onAddText?: () => void;
  height?: number;
}

export const UnifiedTimeline: React.FC<UnifiedTimelineProps> = ({
  project,
  clip,
  sourceVideoUrl,
  playhead,
  isPlaying,
  onPlayheadChange,
  onTogglePlay,
  onUpdateProject,
  onCommitProject,
  selectedItemId,
  selectedTrackId: _selectedTrackId,
  onSelectItem,
  onSplit,
  onRippleDelete,
  onDuplicate,
  onFreezeFrame,
  onSnapshot,
  transportSlot,
  isCollapsed = false,
  onToggleCollapse,
  onAddIntroOutro,
  onAddText,
  height,
}) => {
  return (
    <div
      style={!isCollapsed && height ? { height: `${height}px` } : undefined}
      className={`bg-vc-canvas border-t border-white/[0.08] flex flex-col transition-[height] duration-75 ${
        isCollapsed ? 'h-9' : !height ? 'h-60 sm:h-64 md:h-72' : ''
      } shrink-0 select-none overflow-hidden z-20`}
    >
      {/* Timeline visibility toggle: Show Timeline when collapsed, Hide Timeline when expanded */}
      {isCollapsed ? (
        <div className="h-9 px-4 bg-vc-canvas flex items-center justify-between text-xs text-neutral-400 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-300 uppercase tracking-wider text-[11px]">
              Timeline
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.06] text-neutral-300">
              {project.tracks.length} Tracks
            </span>
          </div>

          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              aria-label="Show Timeline"
              aria-expanded={false}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition focus:outline-none bg-white/[0.06] hover:bg-white/[0.10] text-white border border-white/[0.12]"
              title="Show Timeline"
            >
              <ChevronUp className="w-3.5 h-3.5 text-neutral-300" />
              <span>Show Timeline</span>
            </button>
          )}
        </div>
      ) : (
        /* Multi-Track Body with Unified Toolbar (single top border) */
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          <Timeline
            project={project}
            clip={clip}
            sourceVideoUrl={sourceVideoUrl}
            playhead={playhead}
            isPlaying={isPlaying}
            onPlayheadChange={onPlayheadChange}
            onTogglePlay={onTogglePlay}
            onUpdateProject={onUpdateProject}
            onCommitProject={onCommitProject}
            onAddIntroOutro={onAddIntroOutro}
            selectedItemId={selectedItemId}
            onSelectItem={onSelectItem}
            onSplit={onSplit}
            onRippleDelete={onRippleDelete}
            onDuplicate={onDuplicate}
            onFreezeFrame={onFreezeFrame}
            onSnapshot={onSnapshot}
            transportSlot={transportSlot}
            onAddText={onAddText}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        </div>
      )}
    </div>
  );
};
