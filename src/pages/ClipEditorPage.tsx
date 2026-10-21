import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, ArrowLeft, RefreshCw, FolderClosed } from 'lucide-react';
import { useEditorProject } from '../hooks/useEditorProject';
import { EditorShell } from '../components/editor/EditorShell';

export const ClipEditorPage: React.FC = () => {
  const { clipId } = useParams<{ clipId: string }>();
  const navigate = useNavigate();

  const {
    loading,
    error,
    clip,
    project,
    cleanSourceUrl,
    renderedPreviewUrl,
    cues,
    canUndo,
    canRedo,
    saveStatus,
    saveError,
    saveNow,
    undo,
    redo,
    updateProject,
    commitProject,
    updateTrackItem,
    updateCueText,
    deleteCue,
    deleteTimeRange,
    deleteTimeRanges,
    replaceWordGlobally,
    updateWordTiming,
    splitTrackItem,
    deleteTrackItem,
    rippleDeleteTrackItem,
    duplicateTrackItem,
    reloadProject,
  } = useEditorProject(clipId);

  // Loading State
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07080D] text-neutral-300 select-none">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/[0.12] flex items-center justify-center shadow-lg shadow-violet-950/40">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-300" />
          </div>
          <div className="text-center">
            <h2 className="text-sm font-semibold text-white">Loading VireoClip Studio</h2>
            <p className="text-xs text-neutral-500 mt-1 font-mono">Synchronizing timeline document...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (error || !clip || !project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#07080D] text-neutral-300 p-6 select-none">
        <div className="max-w-md w-full bg-[#0E1017] border border-white/[0.08] rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Failed to Load Clip</h3>
            <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
              {error || 'The requested clip or editor project could not be found.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-neutral-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Go Back</span>
            </button>
            <button
              onClick={() => reloadProject()}
              className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs text-neutral-200 flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
            <button
              onClick={() => navigate('/history')}
              className="px-4 py-2 rounded-xl bg-[#F4F6FB] text-[#0B0C0F] hover:bg-white text-xs font-medium flex items-center gap-1.5 shadow-md shadow-black/40 transition cursor-pointer"
            >
              <FolderClosed className="w-3.5 h-3.5" />
              <span>Browse Available Clips</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Unified Editor View
  return (
    <EditorShell
      clip={clip}
      project={project}
      cleanSourceUrl={cleanSourceUrl}
      renderedPreviewUrl={renderedPreviewUrl}
      cues={cues}
      canUndo={canUndo}
      canRedo={canRedo}
      saveStatus={saveStatus}
      saveError={saveError}
      onSaveNow={saveNow}
      onUndo={undo}
      onRedo={redo}
      onUpdateProject={updateProject}
      onCommitProject={commitProject}
      onUpdateTrackItem={updateTrackItem}
      onUpdateCueText={updateCueText}
      onDeleteCue={deleteCue}
      onDeleteTimeRange={deleteTimeRange}
      onDeleteTimeRanges={deleteTimeRanges}
      onReplaceWordGlobally={replaceWordGlobally}
      onUpdateWordTiming={updateWordTiming}
      onSplitTrackItem={splitTrackItem}
      onDeleteTrackItem={deleteTrackItem}
      onRippleDeleteTrackItem={rippleDeleteTrackItem}
      onDuplicateTrackItem={duplicateTrackItem}
      onReloadData={reloadProject}
    />
  );
};

export default ClipEditorPage;
