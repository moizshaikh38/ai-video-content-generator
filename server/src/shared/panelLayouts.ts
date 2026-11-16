/**
 * Multi-panel layouts. Target rectangles are normalised canvas fractions measured from ONE Opus
 * 9:16 (720x1280) manual-inspection copy (first paused scene, no gutters/insets). They are reference
 * geometry only: not Opus's detection logic, not verified for other aspects. Picture-in-picture is
 * disabled in the observed clip and is deliberately NOT defined here.
 * What each panel SHOWS is an independent per-panel source crop (focusX/focusY/scale), user-editable.
 */
export type PanelLayout = 'split2' | 'three' | 'four' | 'screenshare' | 'gameplay';
export const PANEL_LAYOUTS: PanelLayout[] = ['three', 'four', 'screenshare', 'gameplay'];

export interface PanelRect { x: number; y: number; w: number; h: number }
/** `set: true` only after the user chose this panel's view (crop box) or a detector assigned it. Defaults are unassigned placeholders. */
export interface PanelSlot { focusX: number; focusY: number; scale: number; set?: boolean; /** 'track' = framed on the clip's subject track (a design choice, not Opus's rule). */ auto?: 'track' }
export interface ItemPanels { layout: PanelLayout; slots: PanelSlot[] }

const R = (x: number, y: number, w: number, h: number): PanelRect => ({ x, y, w, h });

export const PANEL_RECTS: Record<PanelLayout, PanelRect[]> = {
  split2: [R(0, 0, 1, 0.5), R(0, 0.5, 1, 0.5)],
  three: [R(0, 0, 1, 0.5), R(0, 0.5, 0.5, 0.5), R(0.5, 0.5, 0.5, 0.5)],
  four: [R(0, 0, 0.5, 0.5), R(0.5, 0, 0.5, 0.5), R(0, 0.5, 0.5, 0.5), R(0.5, 0.5, 0.5, 0.5)],
  // Same rectangles as Split in the reference; content framing differs (screen on top, speaker below).
  screenshare: [R(0, 0, 1, 0.5), R(0, 0.5, 1, 0.5)],
  // Reference: top 720x384 (30%), bottom 720x896 (70%). Which panel is "game" vs "face" is NOT assumed.
  gameplay: [R(0, 0, 1, 0.3), R(0, 0.3, 1, 0.7)],
};

export const PANEL_LABELS: Record<PanelLayout, string> = { split2: 'Split', three: 'Three', four: 'Four', screenshare: 'ScreenShare', gameplay: 'Gameplay' };

/**
 * Placeholder per-panel views. They are NOT subject detections: the first panel shows the whole frame
 * cover-cropped, the rest are zoomed views spread across the frame. Users edit each panel's crop box.
 */
export function defaultPanelSlots(layout: PanelLayout): PanelSlot[] {
  const n = PANEL_RECTS[layout].length;
  if (layout === 'screenshare') return [{ focusX: 0.5, focusY: 0.5, scale: 1 }, { focusX: 0.5, focusY: 0.5, scale: 1.6 }];
  if (layout === 'gameplay') return [{ focusX: 0.5, focusY: 0.5, scale: 1.6 }, { focusX: 0.5, focusY: 0.5, scale: 1 }];
  const xs = n === 3 ? [0.5, 0.25, 0.75] : [0.2, 0.8, 0.2, 0.8];
  return Array.from({ length: n }, (_, i) => ({ focusX: xs[i] ?? 0.5, focusY: 0.5, scale: i === 0 && n === 3 ? 1 : 1.6 }));
}

export function normalizePanels(p: Partial<ItemPanels> | undefined | null): ItemPanels | null {
  if (!p || !p.layout || !PANEL_RECTS[p.layout]) return null;
  const rects = PANEL_RECTS[p.layout];
  const def = defaultPanelSlots(p.layout);
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    layout: p.layout,
    slots: rects.map((_, i) => ({
      focusX: clamp(p.slots?.[i]?.focusX, 0, 1, def[i].focusX),
      focusY: clamp(p.slots?.[i]?.focusY, 0, 1, def[i].focusY),
      scale: clamp(p.slots?.[i]?.scale, 1, 4, def[i].scale),
      ...(p.slots?.[i]?.set ? { set: true } : {}),
      ...(p.slots?.[i]?.auto === 'track' ? { auto: 'track' as const } : {}),
    })),
  };
}

/** Integer pixel rects tiling the canvas exactly (even sizes, no gaps/overlaps; last row/col absorbs rounding). */
export function panelPixelRects(layout: PanelLayout, canvasW: number, canvasH: number): PanelRect[] {
  const ev = (v: number) => Math.round(v / 2) * 2;
  return PANEL_RECTS[layout].map((r) => {
    const x = ev(r.x * canvasW), y = ev(r.y * canvasH);
    const x2 = r.x + r.w >= 0.999 ? canvasW : ev((r.x + r.w) * canvasW);
    const y2 = r.y + r.h >= 0.999 ? canvasH : ev((r.y + r.h) * canvasH);
    return { x, y, w: x2 - x, h: y2 - y };
  });
}

/**
 * Chain-safe ffmpeg fragment (consumes the slice stream, ends unlabeled): split into N copies, each
 * cover-cropped to its panel aspect with its own focus/zoom, scaled to its pixel rect, stacked.
 */
export function buildPanelsFilter(panelsIn: ItemPanels, canvasW: number, canvasH: number, tag = 'vcp'): string {
  const panels = normalizePanels(panelsIn)!;
  const rects = panelPixelRects(panels.layout, canvasW, canvasH);
  const n = rects.length;
  const outs = rects.map((_, i) => `[${tag}_i${i}]`).join('');
  const parts = [`split=${n}${outs}`];
  rects.forEach((r, i) => {
    const a = (r.w / r.h).toFixed(5);
    const s = panels.slots[i];
    parts.push(
      `[${tag}_i${i}]crop=w='min(iw,ih*${a})/${s.scale.toFixed(4)}':h='min(ih,iw/${a})/${s.scale.toFixed(4)}':x='(iw-ow)*${s.focusX.toFixed(4)}':y='(ih-oh)*${s.focusY.toFixed(4)}',scale=${r.w}:${r.h},setsar=1[${tag}_p${i}]`
    );
  });
  const p = (i: number) => `[${tag}_p${i}]`;
  switch (panels.layout) {
    case 'three':
      parts.push(`${p(1)}${p(2)}hstack=inputs=2[${tag}_row]`, `${p(0)}[${tag}_row]vstack=inputs=2`);
      break;
    case 'four':
      parts.push(`${p(0)}${p(1)}hstack=inputs=2[${tag}_r0]`, `${p(2)}${p(3)}hstack=inputs=2[${tag}_r1]`, `[${tag}_r0][${tag}_r1]vstack=inputs=2`);
      break;
    default:
      parts.push(`${p(0)}${p(1)}vstack=inputs=2`);
  }
  return parts.join(';');
}

/** Export must never turn unassigned preview placeholders into a finished clip. */
export function unassignedPanelViews(project: { tracks: Array<{type: string; hidden?: boolean; items: Array<{id: string; hidden?: boolean; panels?: Partial<ItemPanels>}>}> }): string[] {
  const missing: string[] = [];
  for (const track of project.tracks) {
    if (track.type !== 'VIDEO' || track.hidden) continue;
    for (const item of track.items) {
      if (item.hidden) continue;
      const panels = normalizePanels(item.panels);
      panels?.slots.forEach((slot, index) => { if (!slot.set) missing.push(`${item.id}: Panel ${index + 1}`); });
    }
  }
  return missing;
}
export function assertPanelViewsAssigned(project: Parameters<typeof unassignedPanelViews>[0]): void {
  const missing = unassignedPanelViews(project);
  if (missing.length) {
    const err = new Error(`Set every panel view before exporting (${missing.length} unassigned). Open each scene and use its Panel buttons to review and Apply each view.`) as Error & { code: string; statusCode: number };
    err.code = 'PANEL_VIEWS_UNASSIGNED'; err.statusCode = 409; throw err;
  }
/**
 * Seed ScreenShare/Gameplay from ONE tracked subject (the clip's smart-reframe track), when it exists:
 * the speaker/face panel is framed on the subject (zoomed), the other panel shows the whole frame
 * (screen or game). Which side holds the face is a Vireo design choice (ScreenShare: face bottom;
 * Gameplay: face in the small top strip) - Opus's panel roles are NOT known. Three/Four need several
 * distinct subjects, which a single track cannot supply, so they stay unassigned. No track -> unchanged.
 */
export function seedPanelsFromSubject(
  layout: PanelLayout,
  slots: PanelSlot[] | undefined,
  subject: { centerX: number; centerY?: number } | null | undefined
): PanelSlot[] | undefined {
  if (!subject || (layout !== 'screenshare' && layout !== 'gameplay')) return slots;
  const faceIdx = layout === 'screenshare' ? 1 : 0;
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  const face: PanelSlot = { focusX: cl(subject.centerX), focusY: cl(subject.centerY ?? 0.4), scale: 1.8, set: true, auto: 'track' };
  const whole: PanelSlot = { focusX: 0.5, focusY: 0.5, scale: 1, set: true, auto: 'track' };
  return [0, 1].map((i) => (i === faceIdx ? face : whole));
}

/** Median subject centre of the track keyframes inside [start, end] (source seconds); null if none. */
export function subjectCenterInWindow(
  keyframes: Array<{ time: number; centerX: number; centerY?: number }> | undefined | null,
  start: number,
  end: number
): { centerX: number; centerY?: number } | null {
  const k = (keyframes || []).filter((f) => f.time >= start - 0.5 && f.time <= end + 0.5 && Number.isFinite(f.centerX));
  if (!k.length) return null;
  const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const ys = k.map((f) => f.centerY).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return { centerX: med(k.map((f) => f.centerX)), ...(ys.length ? { centerY: med(ys) } : {}) };
}
