/**
 * Genre → recommended reframe layout mode mapping.
 * Frontend-safe copy (no server imports, no process.env, no logger).
 * Mirrors server/src/services/genreIntelligenceService.ts GENRE_PROFILES.
 * Kept in sync by phaseSpeakerFraming.test.ts + phaseClipDirector.test.ts.
 */

export type GenreLayoutMode = 'track' | 'split' | 'screencast' | 'blur';

const GENRE_LAYOUT_MODES: Record<string, GenreLayoutMode> = {
  podcast_interview: 'split',
  education_tutorial: 'screencast',
  motivation: 'track',
  business_finance: 'track',
  gaming: 'screencast',
  sports: 'blur',
  news_politics: 'track',
  comedy_entertainment: 'track',
  storytelling: 'track',
  product_marketing: 'screencast',
  general: 'track',
};

export function getGenreLayoutMode(genre: string | undefined | null): GenreLayoutMode {
  if (!genre) return 'track';
  return GENRE_LAYOUT_MODES[genre] ?? 'track';
}
