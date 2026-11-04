/**
 * Per-viewer UI preferences for the editor side panels (which section is open, which tab is
 * active, which preset group is expanded).
 *
 * Today every panel keeps this in plain useState, so a user's open sections and active tab reset
 * on every remount — selecting a different clip item throws away where they were.
 *
 * This is UI-only state. It never receives `project` and never calls `onUpdateProject`, so it
 * cannot mark the project dirty or reach autosave. One localStorage key holds the whole map and
 * is cached at module level, so a panel with a dozen collapsible sections causes one read, not
 * twelve. Follows the existing `vireo_*` convention (vireo_editor_preset, vireo_inspector_collapsed).
 */
import { useCallback, useState } from 'react';

const STORAGE_KEY = 'vireo_panel_ui_v1';

type PrefValue = string | number | boolean;
type PrefMap = Record<string, PrefValue>;

let cache: PrefMap | null = null;

function readAll(): PrefMap {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as PrefMap) : {};
  } catch {
    // Private mode and blocked storage both throw; fall back to in-memory only.
    cache = {};
  }
  return cache;
}

function writeAll(next: PrefMap): void {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal: the value still lives in `cache` for this session.
  }
}

export function getPanelPref<T extends PrefValue>(key: string, fallback: T): T {
  const stored = readAll()[key];
  return typeof stored === typeof fallback ? (stored as T) : fallback;
}

export function setPanelPref<T extends PrefValue>(key: string, value: T): void {
  writeAll({ ...readAll(), [key]: value });
}

/**
 * `usePanelPref('captions.tab', 'styles')` — same shape as useState, persisted per viewer.
 * The key is a stable string so a section's open/closed state survives remounts.
 */
export function usePanelPref<T extends PrefValue>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => getPanelPref(key, fallback));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      setPanelPref(key, next);
    },
    [key],
  );

  return [value, update];
}

/** Test seam — drops the module cache so a fresh read hits storage again. */
export function __resetPanelPrefCache(): void {
  cache = null;
}
