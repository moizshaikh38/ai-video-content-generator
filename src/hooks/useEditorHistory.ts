import { useState, useCallback, useRef } from 'react';
import { EditorProject } from '../types';

const MAX_HISTORY_STEPS = 50;

export interface UseEditorHistoryReturn {
  canUndo: boolean;
  canRedo: boolean;
  pushHistory: (project: EditorProject) => void;
  undo: (current: EditorProject) => EditorProject | null;
  redo: (current: EditorProject) => EditorProject | null;
  resetHistory: (initial: EditorProject) => void;
}

export function useEditorHistory(_initialProject?: EditorProject | null): UseEditorHistoryReturn {
  const pastRef = useRef<EditorProject[]>([]);
  const futureRef = useRef<EditorProject[]>([]);
  const [, setRevision] = useState<number>(0);

  const forceUpdate = useCallback(() => {
    setRevision((r) => r + 1);
  }, []);

  const pushHistory = useCallback(
    (project: EditorProject) => {
      // Deep clone project snapshot
      const snapshot = JSON.parse(JSON.stringify(project)) as EditorProject;
      pastRef.current.push(snapshot);
      if (pastRef.current.length > MAX_HISTORY_STEPS) {
        pastRef.current.shift();
      }
      // Clear redo stack on new edit
      futureRef.current = [];
      forceUpdate();
    },
    [forceUpdate]
  );

  const undo = useCallback(
    (current: EditorProject): EditorProject | null => {
      if (pastRef.current.length === 0) return null;
      const previous = pastRef.current.pop()!;
      // Push current onto redo stack
      futureRef.current.push(JSON.parse(JSON.stringify(current)));
      forceUpdate();
      return previous;
    },
    [forceUpdate]
  );

  const redo = useCallback(
    (current: EditorProject): EditorProject | null => {
      if (futureRef.current.length === 0) return null;
      const next = futureRef.current.pop()!;
      // Push current onto undo stack
      pastRef.current.push(JSON.parse(JSON.stringify(current)));
      forceUpdate();
      return next;
    },
    [forceUpdate]
  );

  const resetHistory = useCallback(
    (_initial?: EditorProject) => {
      pastRef.current = [];
      futureRef.current = [];
      forceUpdate();
    },
    [forceUpdate]
  );

  return {
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    pushHistory,
    undo,
    redo,
    resetHistory,
  };
}
