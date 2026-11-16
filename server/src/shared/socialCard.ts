/**
 * Social card chrome (Yizerge-style creator identity): display name + @handle
 * as a corner overlay, built from the EXISTING TEXT-item channel so preview,
 * the real save path and the export graph all carry it without a new
 * contract.
 *
 * Theme owns text colors only (no card background box: drawtext per-line
 * boxes cannot form one rounded card - the measured parity gap).
 *
 * v1 is TEXT-only BY MEASUREMENT: the IMAGE/OVERLAY channel has two
 * pre-existing preview/export parity bugs (positions: preview translates in
 * 360px design space, export overlays raw canvas px; sizing: preview caps at
 * max-w 280px, export scales 360*transform.scale), so an avatar image cannot
 * be placed consistently until that channel is fixed. Avatar + radius ride
 * that fix as the next chrome step.
 */
import type { EditorProject, EditorTrackItem } from '../types/index.js';

export interface SocialCardConfig {
  enabled: boolean;
  displayName: string;
  handle: string; // without the leading @
  theme: 'dark' | 'light'; // dark = white text for dark footage underlays
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export const SOCIAL_CARD_TAG = 'social-card';

const NAME_FONT_SIZE = 30;
const HANDLE_FONT_SIZE = 24;
// Design space (TEXT items): 360x640 portrait reference.
const DESIGN_H = 640;
const CARD_MARGIN_X = 96; // design px from center to card text center

function cardTextItems(
  config: SocialCardConfig,
  trackId: string,
  canvasDuration: number,
): EditorTrackItem[] {
  const isTop = config.position.startsWith('top');
  const isLeft = config.position.endsWith('left');
  const nameColor = config.theme === 'dark' ? '#FFFFFF' : '#111111';
  // Handle readability on moving footage: brighter grays + a drop shadow in
  // BOTH channels (measured: #B0B0B0 was low-contrast against the image).
  const handleColor = config.theme === 'dark' ? '#E0E0E0' : '#333333';
  const shadowColor = config.theme === 'dark' ? '#000000' : '#FFFFFF';
  const x = (isLeft ? -1 : 1) * CARD_MARGIN_X;
  const nameY = (isTop ? -1 : 1) * (DESIGN_H / 2 - 70);
  const handleY = nameY + (isTop ? 38 : 38);
  const base = {
    track_id: trackId,
    type: 'TEXT' as const,
    timeline_start: 0,
    timeline_end: canvasDuration,
    source_start: 0,
    source_end: canvasDuration,
    speed: { speed: 1.0, pitch_preserved: true },
    effects: [],
    keyframes: [],
    locked: false,
    muted: true,
    hidden: false,
    z_index: 25,
  };
  return [
    {
      ...base,
      id: crypto.randomUUID(),
      transform: { position_x: x, position_y: nameY, scale: 1, rotation: 0, opacity: 1 },
      text: {
        text: config.displayName,
        font_family: 'Inter',
        font_size: NAME_FONT_SIZE,
        font_weight: 'bold',
        italic: false,
        alignment: 'center',
        color: nameColor,
        animation: 'none',
        shadow_color: shadowColor,
        shadow_blur: 6,
      },
      social_card: SOCIAL_CARD_TAG,
    } as unknown as EditorTrackItem,
    {
      ...base,
      id: crypto.randomUUID(),
      transform: { position_x: x, position_y: handleY, scale: 1, rotation: 0, opacity: 1 },
      text: {
        text: `@${config.handle}`,
        font_family: 'Inter',
        font_size: HANDLE_FONT_SIZE,
        font_weight: 'medium',
        italic: false,
        alignment: 'center',
        color: handleColor,
        animation: 'none',
        shadow_color: shadowColor,
        shadow_blur: 6,
      },
      social_card: SOCIAL_CARD_TAG,
    } as unknown as EditorTrackItem,
  ];
}

/**
 * Idempotently applies the social card: previous social-card items are
 * removed first, user content is never touched. When config.enabled is false
 * the card is simply removed.
 */
export function applySocialCardToProject(
  project: EditorProject,
  config: SocialCardConfig,
): EditorProject {
  const tracks = project.tracks.map((t) => ({
    ...t,
    items: t.items.filter((i: any) => i.social_card !== SOCIAL_CARD_TAG),
  }));
  if (!config.enabled) return { ...project, tracks };

  const canvasDuration = project.canvas.duration || 10;

  let textTrackId: string | null = null;
  for (const t of tracks) {
    if (t.type === 'TEXT' && !textTrackId) textTrackId = t.id;
  }
  if (!textTrackId) {
    textTrackId = crypto.randomUUID();
    tracks.push({
      id: textTrackId, type: 'TEXT', name: 'Text',
      locked: false, muted: false, hidden: false, items: [],
    } as any);
  }

  const texts = cardTextItems(config, textTrackId, canvasDuration);
  return {
    ...project,
    tracks: tracks.map((t) => (t.id === textTrackId ? { ...t, items: [...t.items, ...texts] } : t)),
  };
}
