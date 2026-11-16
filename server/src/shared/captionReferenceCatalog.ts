/** Observed names, not an implementation or entitlement claim. No competitor assets/code. */
export const OPUS_CAPTION_REFERENCE = {
  observedAt: '2026-11-16',
  source: 'Signed-in OpusClip editor Presets gallery; account-specific source reference retained with the research evidence.',
  noCaptionsLabel: 'No captions',
  styles: [
    'Word Cut', 'Marker Sweep', 'Negative keywords', 'Karaoke', 'Handwritten', 'Mozi',
    'Simple', 'Soft Build', 'Typewriter', 'Glide', 'Doodle', 'Editorial', 'Soft Cut',
    'Beasty', 'Think Media', 'Popline', 'Deep Diver', 'Youshaei', 'Pod P', 'Punch',
    'Retro 3D', 'Bouncing dot', 'Breathe', 'Crossline', 'Focus', 'With Backdrop',
    'Elastic', 'Handheld', 'Stack Cut', 'Negative text', 'Chip background',
    'Glitch Infinite', 'Highlighter Box', 'Baby Earthquake', 'Grow', 'Seamless Bounce',
    'Soft Landing', 'Blur Switch', 'Sticker', 'Font Shuffle', 'Decode', 'Comic',
    'Blur In', 'Baby Steps',
  ],
} as const;

export type CaptionReferenceName = typeof OPUS_CAPTION_REFERENCE.styles[number];
export interface CaptionReferenceCoverage {
  name: CaptionReferenceName;
  status: 'unmatched' | 'candidate' | 'verified';
  presetId?: string;
  evidence: string;
  remaining: string;
}

/** No style is declared verified solely because its name exists or a gallery animation was seen. */
export const CAPTION_REFERENCE_COVERAGE: CaptionReferenceCoverage[] = OPUS_CAPTION_REFERENCE.styles.map(name => {
  const candidate = {
    'Soft Cut': { presetId: 'soft_cut', evidence: 'Visible one-word replacement, cream Figtree Semibold and two vertical shadow layers; applied Font panel confirms face, size and color.', remaining: 'Full-sized reference output, exact temporal/phrase behavior and shadow geometry comparison.' },
    'Word Cut': { presetId: 'word_cut', evidence: 'Visible tile shows individual words replacing each other; Inter bold white type with a small black shadow.', remaining: 'Full-sized applied output, font metrics and phrase segmentation comparison.' },
    'Soft Build': { presetId: 'soft_build', evidence: 'Visible tile builds a sentence word by word; League Spartan regular white type with small black shadow.', remaining: 'Full-sized applied output, exact easing and layout comparison.' },
    'Typewriter': { presetId: 'typewriter', evidence: 'Visible tile reveals characters progressively; JetBrains Mono bold white type with yellow cursor.', remaining: 'Full-sized applied output, exact timing and phrase segmentation comparison. Yellow cursor is independently implemented but not reference-qualified.' },
  }[name as 'Soft Cut' | 'Word Cut' | 'Soft Build' | 'Typewriter'];
  return candidate ? { name, status: 'candidate', ...candidate } : {
    name, status: 'unmatched', evidence: 'Current gallery label and individually applied Font/Effects controls observed. Existing same-name Vireo styles are not evidence of parity.',
    remaining: 'Individual visual/timing specification, independent implementation and preview/export comparison.',
  };
});
