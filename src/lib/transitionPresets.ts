/**
 * Frontend entry point for the transition preset system. The definitions live
 * in server/src/shared/transitionPresets.ts so the editor picker and the
 * FFmpeg render graph read the exact same values (same pattern as caption
 * presets). Locked together by tests/phaseE1Transitions.test.ts parity checks.
 */
export * from '../../server/src/shared/transitionPresets';
