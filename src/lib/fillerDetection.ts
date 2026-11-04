/**
 * Frontend entry for filler-word detection. The implementation lives in
 * server/src/utils/fillerDetection.ts (pure, dependency-free) so the editor's
 * confirm flow and the backend's temporal removal share one detector — the
 * caption/transition single-source pattern.
 */
export * from '../../server/src/utils/fillerDetection';
