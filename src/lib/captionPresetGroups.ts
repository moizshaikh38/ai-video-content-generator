/**
 * Caption preset grouping.
 *
 * The gallery renders 24 preset ids in one flat two-column grid — roughly half the Captions
 * panel's visual weight, with every tile's renderer subtree mounted at once. Grouping them into
 * an accordion means only the open group mounts (~6 previews instead of 23) and, more
 * importantly, gives the user a way to find a style instead of scanning 23 near-identical tiles.
 *
 * Dependency-free so it can be unit-tested under the backend node:test runner. The test asserts
 * these groups partition CAPTION_PRESET_IDS exactly once, so adding a preset upstream without
 * grouping it fails loudly rather than making it silently unreachable in the UI.
 */

export interface CaptionPresetGroup {
  id: string;
  label: string;
  /** One short line explaining when to reach for this family. */
  hint: string;
  presetIds: string[];
}

/** `none` is deliberately excluded — it renders as a single full-width row above the groups. */
export const CAPTION_PRESET_GROUPS: CaptionPresetGroup[] = [
  {
    id: 'clean',
    label: 'Clean & Readable',
    hint: 'Understated styles that stay out of the way.',
    presetIds: ['simple', 'vireo_clean', 'think_media', 'soft_backdrop', 'editorial', 'vireo_editorial'],
  },
  {
    id: 'high_energy',
    label: 'High Energy',
    hint: 'Bold, high-contrast styles built for retention.',
    presetIds: ['beasty', 'mozi', 'youshaei', 'bold_highlight', 'vireo_hormozi', 'popline'],
  },
  {
    id: 'word_by_word',
    label: 'Word-by-Word',
    hint: 'Each word lands on beat with the audio.',
    presetIds: ['karaoke', 'vireo_oneword', 'vireo_sweep', 'vireo_spring', 'compact_creator'],
  },
  {
    id: 'badge_pill',
    label: 'Badge & Pill',
    hint: 'Captions sit inside a rounded plate or chip.',
    presetIds: ['deep_diver', 'vireo_pill', 'vireo_capsule', 'two_color_highlight'],
  },
  {
    id: 'neon',
    label: 'Neon & Color Pop',
    hint: 'Saturated accents for a louder look.',
    presetIds: ['vireo_neon', 'vireo_lime'],
  },
];

/** The preset id that is not a style and gets its own row. */
export const NO_CAPTION_PRESET_ID = 'none';

/**
 * Groups concatenated in display order. CaptionPresetGallery's roving tabindex indexes a flat
 * list, so keyboard navigation must walk this — not the per-group arrays — or Arrow/Home/End
 * silently break once the gallery is grouped.
 */
export const GROUPED_PRESET_ORDER: string[] = CAPTION_PRESET_GROUPS.flatMap((g) => g.presetIds);

export function findPresetGroupId(presetId: string): string | undefined {
  return CAPTION_PRESET_GROUPS.find((g) => g.presetIds.includes(presetId))?.id;
}

/** Default-open group = whichever contains the active preset, else the first. */
export function defaultOpenGroupId(activePresetId: string | null | undefined): string {
  return (activePresetId ? findPresetGroupId(activePresetId) : undefined) ?? CAPTION_PRESET_GROUPS[0].id;
}
