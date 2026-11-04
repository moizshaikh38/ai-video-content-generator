import { useState, useCallback } from 'react';

export type SidebarTab =
  | 'transcript'
  | 'captions'
  | 'layout'
  | 'framing'
  | 'aspect_ratio'
  | 'text'
  | 'audio'
  | 'broll'
  | 'translate'
  | 'brand'
  | 'media'
  | 'elements'
  | 'copilot'
  | 'ai_tools';

export type AiToolType =
  | 'producer'
  | 'translate'
  | 'content_pack'
  | 'hook_lab'
  | 'thumbnail_lab'
  | 'autopilot'
  | 'ab_studio'
  | 'copilot';

export type EditorPresetMode = 'beginner' | 'pro';
export type EditorViewMode = 'edit' | 'export_review';

export interface UseEditorSelectionReturn {
  selectedItemId: string | null;
  selectedTrackId: string | null;
  selectedCueId: string | null;
  selectedWordIndex: number | null;
  activeSidebarTab: SidebarTab;
  activeAiTool: AiToolType;
  editorPreset: EditorPresetMode;
  viewMode: EditorViewMode;
  selectItem: (itemId: string | null, trackId?: string | null) => void;
  selectCue: (cueId: string | null, wordIndex?: number | null) => void;
  setActiveSidebarTab: (tab: SidebarTab) => void;
  setActiveAiTool: (tool: AiToolType) => void;
  setEditorPreset: (preset: EditorPresetMode) => void;
  setViewMode: (mode: EditorViewMode) => void;
  clearSelection: () => void;
}

export function useEditorSelection(initialSidebarTab: SidebarTab = 'captions'): UseEditorSelectionReturn {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [activeSidebarTab, setActiveSidebarTabState] = useState<SidebarTab>(initialSidebarTab);
  const [activeAiTool, setActiveAiToolState] = useState<AiToolType>('copilot');
  const [editorPreset, setEditorPresetState] = useState<EditorPresetMode>(() => {
    return (localStorage.getItem('vireo_editor_preset') as EditorPresetMode) || 'beginner';
  });
  const [viewMode, setViewModeState] = useState<EditorViewMode>('edit');

  const selectItem = useCallback((itemId: string | null, trackId?: string | null) => {
    setSelectedItemId(itemId);
    if (trackId !== undefined) {
      setSelectedTrackId(trackId);
    }
  }, []);

  const selectCue = useCallback((cueId: string | null, wordIndex?: number | null) => {
    setSelectedCueId(cueId);
    setSelectedWordIndex(wordIndex !== undefined ? wordIndex : null);
  }, []);

  const setActiveSidebarTab = useCallback((tab: SidebarTab) => {
    setActiveSidebarTabState(tab);
  }, []);

  const setActiveAiTool = useCallback((tool: AiToolType) => {
    setActiveAiToolState(tool);
    setActiveSidebarTabState('ai_tools');
  }, []);

  const setEditorPreset = useCallback((preset: EditorPresetMode) => {
    setEditorPresetState(preset);
    try {
      localStorage.setItem('vireo_editor_preset', preset);
    } catch {}
  }, []);

  const setViewMode = useCallback((mode: EditorViewMode) => {
    setViewModeState(mode);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedItemId(null);
    setSelectedTrackId(null);
    setSelectedCueId(null);
    setSelectedWordIndex(null);
  }, []);

  return {
    selectedItemId,
    selectedTrackId,
    selectedCueId,
    selectedWordIndex,
    activeSidebarTab,
    activeAiTool,
    editorPreset,
    viewMode,
    selectItem,
    selectCue,
    setActiveSidebarTab,
    setActiveAiTool,
    setEditorPreset,
    setViewMode,
    clearSelection,
  };
}
