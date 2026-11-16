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
  if(name==='Chip background')return {name,status:'unmatched',presetId:'chip_background',evidence:'Experimental independent white word chips with dark Poppins Bold text; active yellow chip lifts/scales. Rendered gallery geometry observed.',remaining:'Actual local pixels, full-size reference, exact motion/spacing/grouping and integrated save/render.'};
  if(name==='Glide')return {name,status:'unmatched',presetId:'glide',evidence:'Experimental independent moving rounded orange box among fixed white Montserrat ExtraBold words. Actual rendered gallery geometry observed.',remaining:'Local pixels, font/layout qualification, full-size reference, exact motion/grouping and integrated save/render.'};
  if(name==='With Backdrop')return {name,status:'unmatched',presetId:'with_backdrop',evidence:'Experimental independent Lemon/yellow words over a broad dark horizontal band, timed build and closing fade. Rendered gallery tile pixels observed.',remaining:'Local pixel qualification, full-size reference, exact grouping/motion/band geometry, integrated save/render and newer scene anchors.'};
  if(name==='Crossline')return {name,status:'unmatched',presetId:'crossline',evidence:'Experimental independent alternating staggered-row slide/fade with public Cal Sans and two shadow layers. Actual local gallery and preview/ASS paired pixels inspected.',remaining:'Full-sized reference output, exact grouping/motion, integrated save/render and newer scene-anchor qualification. Not counted as a candidate yet.'};
  const candidate = {
    'Retro 3D': { presetId: 'retro_3d', evidence: 'Visible Bungee uppercase yellow type, orange diagonal extrusion, dark outline, white active word and small upward settling motion.', remaining: 'Full-sized output, exact lift timing, extrusion and segmentation comparison.' },
    'Soft Cut': { presetId: 'soft_cut', evidence: 'Visible one-word replacement, cream Figtree Semibold and two vertical shadow layers; applied Font panel confirms face, size and color.', remaining: 'Full-sized reference output, exact temporal/phrase behavior and shadow geometry comparison.' },
    'Word Cut': { presetId: 'word_cut', evidence: 'Applied720px preview confirms single-word replacement and short-gap hold. Four-word empirical Inter size calibration106 corrects former90 undersizing.', remaining: 'Exact source-timed transitions, longer-pause policy, shadow/anchor calibration, broader typography and integrated save/render qualification.' },
    'Soft Build': { presetId: 'soft_build', evidence: 'Visible tile builds a sentence word by word; League Spartan regular white type with small black shadow.', remaining: 'Full-sized applied output, exact easing and layout comparison.' },
    'Typewriter': { presetId: 'typewriter', evidence: 'Visible tile reveals characters progressively; JetBrains Mono bold white type with yellow cursor.', remaining: 'Full-sized applied output, exact timing and phrase segmentation comparison. Yellow cursor is independently implemented but not reference-qualified.' },
  }[name as 'Retro 3D' | 'Soft Cut' | 'Word Cut' | 'Soft Build' | 'Typewriter'];
  if (name === 'Retro 3D' && candidate) return {name,status:'unmatched',...candidate,remaining:'Experimental local implementation only. Font-specific size serialization and integrated save/render roundtrip must qualify before counting as a candidate. '+candidate.remaining};
  return candidate ? { name, status: 'candidate', ...candidate } : {
    name, status: 'unmatched', evidence: 'Current gallery label and individually applied Font/Effects controls observed. Existing same-name Vireo styles are not evidence of parity.',
    remaining: 'Individual visual/timing specification, independent implementation and preview/export comparison.',
  };
});
