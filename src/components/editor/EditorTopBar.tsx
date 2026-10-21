import React, { useState } from 'react';
import {
  ArrowLeft,
  Undo2,
  Redo2,
  Check,
  Loader2,
  AlertTriangle,
  Download,
  Command,
  Eye,
  Shield,
} from 'lucide-react';
import { SaveStatus } from '../../hooks/useEditorAutosave';
import { EditorViewMode } from '../../hooks/useEditorSelection';

interface EditorTopBarProps {
  title: string;
  onUpdateTitle: (title: string) => void;
  onBack: () => void;
  saveStatus: SaveStatus;
  saveError: string | null;
  onSaveNow: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  viewMode: EditorViewMode;
  onChangeViewMode: (mode: EditorViewMode) => void;
  previewQuality: 'auto' | '360p' | '540p' | '720p';
  onChangePreviewQuality: (q: 'auto' | '360p' | '540p' | '720p') => void;
  showSafeGuides: boolean;
  onToggleSafeGuides: () => void;
  onOpenCommandPalette: () => void;
  onOpenExportDialog: () => void;
  isRendering?: boolean;
}

export const EditorTopBar: React.FC<EditorTopBarProps> = ({
  title,
  onUpdateTitle,
  onBack,
  saveStatus,
  saveError,
  onSaveNow,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  viewMode,
  onChangeViewMode,
  previewQuality,
  onChangePreviewQuality,
  showSafeGuides,
  onToggleSafeGuides,
  onOpenCommandPalette,
  onOpenExportDialog,
  isRendering = false,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [localTitle, setLocalTitle] = useState(title);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (localTitle.trim() && localTitle !== title) {
      onUpdateTitle(localTitle.trim());
    }
  };

  return (
    <header className="h-14 bg-[#07080D] px-4 flex items-center justify-between select-none z-30 shrink-0">
      {/* Left: Navigation, Title & Save Status */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition flex items-center gap-1.5 text-xs font-medium"
          title="Back to Project"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Project</span>
        </button>

        <div className="h-4 w-px bg-white/[0.08] mx-1" />

        {/* Editable Title */}
        {isEditingTitle ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={localTitle}
              onChange={(e) => setLocalTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleTitleSubmit();
                if (e.key === 'Escape') {
                  setLocalTitle(title);
                  setIsEditingTitle(false);
                }
              }}
              autoFocus
              className="bg-[#0E1017] border border-white/20 rounded px-2 py-1 text-sm text-white font-medium focus:outline-none max-w-[200px] sm:max-w-[320px]"
            />
            <button
              onClick={handleTitleSubmit}
              className="p-1 text-neutral-300 hover:text-white"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setLocalTitle(title);
              setIsEditingTitle(true);
            }}
            className="text-sm font-semibold text-neutral-200 hover:text-white truncate max-w-[180px] sm:max-w-[280px] text-left hover:bg-white/[0.06] px-2 py-1 rounded transition"
            title="Click to rename"
          >
            {title || 'Untitled Clip'}
          </button>
        )}

        {/* Save Status Pill */}
        <div className="flex items-center ml-1">
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#0E1017] border border-white/[0.08] text-[11px] font-mono text-neutral-400">
              <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />
              <span>Saving...</span>
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-[11px] font-mono text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Saved</span>
            </span>
          )}
          {saveStatus === 'dirty' && (
            <button
              onClick={onSaveNow}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-950/40 border border-amber-800/40 text-[11px] font-mono text-amber-400 hover:bg-amber-900/40 transition"
              title="Unsaved changes. Click to save now"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>Save</span>
            </button>
          )}
          {saveStatus === 'error' && (
            <button
              onClick={onSaveNow}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-950/60 border border-rose-800/60 text-[11px] font-mono text-rose-400 hover:bg-rose-900/60 transition"
              title={saveError || 'Save failed. Click to retry'}
            >
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>

      {/* Center: Undo / Redo & Workspace Preset Switcher */}
      <div className="flex items-center gap-2">
        {/* Undo / Redo */}
        <div className="flex items-center bg-[#0E1017] rounded-lg p-0.5 border border-white/[0.08]">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition"
            title="Undo (Cmd+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <div className="h-3 w-px bg-white/[0.08]" />
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:text-neutral-400 transition"
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* View Mode (Edit Canvas vs Export Review) */}
        <div className="hidden sm:flex items-center bg-[#0E1017] rounded-lg p-0.5 border border-white/[0.08] text-xs">
          <button
            onClick={() => onChangeViewMode('edit')}
            className={`px-2.5 py-1 rounded-md transition font-medium text-xs ${
              viewMode === 'edit'
                ? 'bg-white/[0.1] text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="Clean Source Preview with Live CSS Layers"
          >
            Live Edit
          </button>
          <button
            onClick={() => onChangeViewMode('export_review')}
            className={`px-2.5 py-1 rounded-md transition font-medium text-xs flex items-center gap-1.5 ${
              viewMode === 'export_review'
                ? 'bg-white/[0.1] text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
            title="Inspect Burned-In Rendered Export"
          >
            <Eye className="w-3 h-3" />
            <span>Render Review</span>
          </button>
        </div>
      </div>

      {/* Right: Controls & Export Button */}
      <div className="flex items-center gap-2">
        {/* Command Palette Trigger */}
        <button
          onClick={onOpenCommandPalette}
          className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0E1017] border border-white/[0.08] text-neutral-400 hover:text-neutral-200 text-xs transition"
          title="Command Palette (Cmd+K)"
        >
          <Command className="w-3 h-3" />
          <span className="text-[11px] font-mono">⌘K</span>
        </button>

        {/* Safe Guides Toggle */}
        <button
          onClick={onToggleSafeGuides}
          className={`p-1.5 rounded-lg border transition ${
            showSafeGuides
              ? 'bg-white/[0.12] border-white/25 text-white'
              : 'bg-[#0E1017] border-white/[0.08] text-neutral-500 hover:text-neutral-300'
          }`}
          title="Toggle Platform Safe Zones"
        >
          <Shield className="w-3.5 h-3.5" />
        </button>

        {/* Quality Selector */}
        <select
          value={previewQuality}
          onChange={(e) =>
            onChangePreviewQuality(e.target.value as 'auto' | '360p' | '540p' | '720p')
          }
          className="hidden sm:block bg-[#0E1017] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-neutral-300 focus:outline-none focus:border-white/20"
        >
          <option value="auto">Auto Res</option>
          <option value="720p">720p HD</option>
          <option value="540p">540p</option>
          <option value="360p">360p Fast</option>
        </select>

        {/* Primary Export Button (High-Contrast White Button) */}
        <button
          onClick={onOpenExportDialog}
          disabled={isRendering}
          className="px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs shadow-sm flex items-center gap-1.5 transition active:scale-95 disabled:opacity-50"
        >
          {isRendering ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
              <span>Rendering...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5 text-black" />
              <span>Export</span>
            </>
          )}
        </button>
      </div>
    </header>
  );
};
