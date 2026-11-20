import { useEffect } from 'react';

export interface UseEditorShortcutsProps {
  onTogglePlay: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onDeleteSelected?: () => void;
  onSplit?: () => void;
  onStepFrame?: (frames: number) => void;
  onToggleCommandPalette?: () => void;
  onEscape?: () => void;
  enabled?: boolean;
}

export function useEditorShortcuts({
  onTogglePlay,
  onUndo,
  onRedo,
  onSave,
  onDeleteSelected,
  onSplit,
  onStepFrame,
  onToggleCommandPalette,
  onEscape,
  enabled = true,
}: UseEditorShortcutsProps) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing inside an input, textarea or contentEditable
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('role') === 'textbox');

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const metaOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Cmd+K / Ctrl+K: Command Palette
      if (metaOrCtrl && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (onToggleCommandPalette) onToggleCommandPalette();
        return;
      }

      // Cmd+S / Ctrl+S: Save
      if (metaOrCtrl && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onSave();
        return;
      }

      // Cmd+Z / Ctrl+Z: Undo / Redo
      if (metaOrCtrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          onRedo();
        } else {
          onUndo();
        }
        return;
      }

      // Ctrl+Y: Redo
      if (!isMac && e.ctrlKey && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        onRedo();
        return;
      }

      // Escape: Deselect / close modal
      if (e.key === 'Escape') {
        if (onEscape) onEscape();
        return;
      }

      // If user is editing text inside an input, do not trigger editing commands
      if (isInput) return;

      // Space: Toggle Play/Pause
      if (e.code === 'Space') {
        // Let a focused button/link handle Space itself (keyboard activation)
        const tgt = e.target as HTMLElement | null;
        if (tgt && typeof tgt.closest === 'function' && tgt.closest('button, a[href], [role="button"]')) return;
        e.preventDefault();
        onTogglePlay();
        return;
      }

      // Backspace or Delete: Delete selected item
      if (e.key === 'Backspace' || e.key === 'Delete') {
        // A focused native button/link must not trigger a delete of the selected item
        const delTgt = e.target as HTMLElement | null;
        if (delTgt && typeof delTgt.closest === 'function' && delTgt.closest('button, a[href]')) return;
        e.preventDefault();
        if (onDeleteSelected) onDeleteSelected();
        return;
      }

      // 'S' key: Split at playhead
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (onSplit) onSplit();
        return;
      }

      // 'J', 'K', 'L' transport keys
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        if (onStepFrame) onStepFrame(-30); // 1s back
        return;
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        onTogglePlay();
        return;
      }
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        if (onStepFrame) onStepFrame(30); // 1s forward
        return;
      }

      // Arrow Left / Right: Frame stepping
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (onStepFrame) onStepFrame(e.shiftKey ? -30 : -1);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (onStepFrame) onStepFrame(e.shiftKey ? 30 : 1);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    enabled,
    onTogglePlay,
    onUndo,
    onRedo,
    onSave,
    onDeleteSelected,
    onSplit,
    onStepFrame,
    onToggleCommandPalette,
    onEscape,
  ]);
}
