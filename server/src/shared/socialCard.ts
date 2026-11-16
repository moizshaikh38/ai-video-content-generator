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
  avatarUrl?: string; // optional creator avatar image, stacked above the name
  cardBackground?: boolean; // rounded card behind the chrome (default true)
}

export const SOCIAL_CARD_TAG = 'social-card';

const NAME_FONT_SIZE = 30;
const HANDLE_FONT_SIZE = 24;
// Design space (TEXT items): 360x640 portrait reference.
const DESIGN_H = 640;
const CARD_MARGIN_X = 96; // design px from center to card text center
const AVATAR_SIZE = 56; // design px; overlaid square (no circle crop - named limit)
const CARD_PAD_X = 24;
const CARD_PAD_Y = 16;
const CARD_RADIUS = 18;
const CARD_MAX_W = 280; // matches the overlay channel's design-width cap
// Approximate Inter advance widths (em of font size). Conservative (wide) so
// the card over-pads rather than clips; verified visually per theme.
const NAME_CHAR_EM = 0.6;
const HANDLE_CHAR_EM = 0.56;

function cardAnchors(config: SocialCardConfig): { x: number; nameY: number; handleY: number } {
  const isTop = config.position.startsWith('top');
  const isLeft = config.position.endsWith('left');
  // With an avatar the stack is taller; shift the anchor so the whole stack
  // plus card padding stays on-canvas (measured: 70 alone clipped 27px off-top).
  const offset = 70 + (config.avatarUrl ? AVATAR_SIZE + 10 : 0);
  const nameY = (isTop ? -1 : 1) * (DESIGN_H / 2 - offset);
  // Keep the whole card on-canvas horizontally too (measured: a 196px card at
  // x=96 clipped its left edge at the 360px design boundary).
  const halfCard = Math.min(CARD_MAX_W, Math.max(120, Math.ceil(cardContentWidth(config)) + 2 * CARD_PAD_X)) / 2;
  const maxX = Math.max(0, 180 - halfCard - 8);
  const x = (isLeft ? -1 : 1) * Math.min(CARD_MARGIN_X, maxX);
  return { x, nameY, handleY: nameY + 38 };
}

/** Estimated rendered width of the card's widest text line (design px). */
function cardContentWidth(config: SocialCardConfig): number {
  const nameW = config.displayName.length * NAME_FONT_SIZE * NAME_CHAR_EM;
  const handleW = (config.handle.length + 1) * HANDLE_FONT_SIZE * HANDLE_CHAR_EM;
  return Math.max(nameW, handleW);
}

/**
 * Rounded card background + optional avatar as OVERLAY items riding the
 * versioned design_center channel, so preview (CSS) and export (synthesized
 * PNG through the overlay branch) derive from the same geometry.
 */
function cardChromeItems(
  config: SocialCardConfig,
  trackId: string,
  canvasDuration: number,
  nameY: number,
  handleY: number,
  x: number,
): EditorTrackItem[] {
  const items: EditorTrackItem[] = [];
  const hasAvatar = !!config.avatarUrl;
  const avatarCenterY = nameY - 15 - 10 - AVATAR_SIZE / 2;
  if (hasAvatar) {
    items.push({
      id: crypto.randomUUID(),
      track_id: trackId,
      type: 'OVERLAY',
      name: 'Social card avatar',
      timeline_start: 0,
      timeline_end: canvasDuration,
      source_start: 0,
      source_end: canvasDuration,
      source_path: config.avatarUrl,
      speed: { speed: 1.0, pitch_preserved: true },
      effects: [],
      keyframes: [],
      locked: false,
      muted: true,
      hidden: false,
      z_index: 24,
      transform: {
        position_x: x, position_y: avatarCenterY,
        scale: AVATAR_SIZE / 280, rotation: 0, opacity: 1,
        position_space: 'design_center',
      },
      social_card: SOCIAL_CARD_TAG,
    } as unknown as EditorTrackItem);
  }
  if (config.cardBackground !== false) {
    const top = (hasAvatar ? avatarCenterY - AVATAR_SIZE / 2 : nameY - NAME_FONT_SIZE / 2) - CARD_PAD_Y;
    const bottom = handleY + HANDLE_FONT_SIZE / 2 + CARD_PAD_Y;
    const width = Math.min(CARD_MAX_W, Math.max(120, Math.ceil(cardContentWidth(config)) + 2 * CARD_PAD_X));
    items.unshift({
      id: crypto.randomUUID(),
      track_id: trackId,
      type: 'OVERLAY',
      name: 'Social card background',
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
      z_index: 23,
      transform: {
        position_x: x, position_y: Math.round((top + bottom) / 2),
        scale: 1, rotation: 0,
        opacity: config.theme === 'dark' ? 0.55 : 0.8,
        position_space: 'design_center',
      },
      card: {
        width,
        height: Math.round(bottom - top),
        radius: CARD_RADIUS,
        color: config.theme === 'dark' ? '#000000' : '#FFFFFF',
      },
      social_card: SOCIAL_CARD_TAG,
    } as unknown as EditorTrackItem);
  }
  return items;
}

function cardTextItems(
  config: SocialCardConfig,
  trackId: string,
  canvasDuration: number,
): EditorTrackItem[] {
  const { x, nameY, handleY } = cardAnchors(config);
  const nameColor = config.theme === 'dark' ? '#FFFFFF' : '#111111';
  // Handle readability on moving footage: brighter grays + a drop shadow in
  // BOTH channels (measured: #B0B0B0 was low-contrast against the image).
  const handleColor = config.theme === 'dark' ? '#E0E0E0' : '#333333';
  const shadowColor = config.theme === 'dark' ? '#000000' : '#FFFFFF';
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
  let overlayTrackId: string | null = null;
  for (const t of tracks) {
    if (t.type === 'TEXT' && !textTrackId) textTrackId = t.id;
    if (t.type === 'OVERLAY' && !overlayTrackId) overlayTrackId = t.id;
  }
  if (!textTrackId) {
    textTrackId = crypto.randomUUID();
    tracks.push({
      id: textTrackId, type: 'TEXT', name: 'Text',
      locked: false, muted: false, hidden: false, items: [],
    } as any);
  }

  const texts = cardTextItems(config, textTrackId, canvasDuration);
  const withTexts = tracks.map((t) => (t.id === textTrackId ? { ...t, items: [...t.items, ...texts] } : t));

  const wantsChrome = !!config.avatarUrl || config.cardBackground !== false;
  if (!wantsChrome) return { ...project, tracks: withTexts };
  if (!overlayTrackId) {
    overlayTrackId = crypto.randomUUID();
    withTexts.push({
      id: overlayTrackId, type: 'OVERLAY', name: 'Elements & Stickers',
      locked: false, muted: false, hidden: false, items: [],
    } as any);
  }
  const { x, nameY, handleY } = cardAnchors(config);
  const chrome = cardChromeItems(config, overlayTrackId, canvasDuration, nameY, handleY, x);
  return {
    ...project,
    tracks: withTexts.map((t) => (t.id === overlayTrackId ? { ...t, items: [...t.items, ...chrome] } : t)),
  };
}
