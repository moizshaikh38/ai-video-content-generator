import {materializeNumericPanels,numericPanelsFilter,type NumericPanelGeometry} from './numericPanelGeometry.js';
/**
 * Multi-panel layouts. Target rectangles are normalised canvas fractions measured from ONE Opus
 * 9:16 (720x1280) manual-inspection copy (first paused scene, no gutters/insets). They are reference
 * geometry only: not Opus's detection logic, not verified for other aspects. Picture-in-picture is
 * disabled in the observed clip and is deliberately NOT defined here.
 * What each panel SHOWS is an independent per-panel source crop (focusX/focusY/scale), user-editable.
 */
export type PanelLayout = 'split2' | 'three' | 'four' | 'screenshare' | 'gameplay' | 'watch_party' | 'streaming' | 'game_screen_first';
export const PANEL_LAYOUTS: PanelLayout[] = ['three', 'four', 'screenshare', 'gameplay', 'watch_party', 'streaming', 'game_screen_first'];

export interface PanelRect { x: number; y: number; w: number; h: number }
/** `set: true` only after the user chose this panel's view (crop box) or a detector assigned it. Defaults are unassigned placeholders. */
export interface PanelSlot { /** Show the entire chosen region with black bars, ignoring cover zoom/focus. Manual opt-in only. */ fit?: 'contain'; /** Blur only behind a contained region; absent retains existing black bars. */ backdrop?: 'blur'; focusX: number; focusY: number; scale: number; /** Restrict this view to a measured source rectangle before cover/zoom. Normalized source coordinates. */ sourceRect?: PanelRect; set?: boolean; /** 'track' = framed on the clip's subject track (a design choice, not Opus's rule). */ auto?: 'track' }
export interface ItemPanels { layout: PanelLayout; slots: PanelSlot[]; /** Source-aspect top panel, explicit local gaming review only. */ topFraction?:number }

const R = (x: number, y: number, w: number, h: number): PanelRect => ({ x, y, w, h });

export const PANEL_RECTS: Record<PanelLayout, PanelRect[]> = {
  split2: [R(0, 0, 1, 0.5), R(0, 0.5, 1, 0.5)],
  three: [R(0, 0, 1, 0.5), R(0, 0.5, 0.5, 0.5), R(0.5, 0.5, 0.5, 0.5)],
  four: [R(0, 0, 0.5, 0.5), R(0.5, 0, 0.5, 0.5), R(0, 0.5, 0.5, 0.5), R(0.5, 0.5, 0.5, 0.5)],
  // Same rectangles as Split in the reference; content framing differs (screen on top, speaker below).
  screenshare: [R(0, 0, 1, 0.5), R(0, 0.5, 1, 0.5)],
  // Reference: top 720x384 (30%), bottom 720x896 (70%). Which panel is "game" vs "face" is NOT assumed.
  gameplay: [R(0, 0, 1, 0.3), R(0, 0.3, 1, 0.7)],
  // One actual Wayin Fighting Screen First output: seam at y768 of1280.
  // Template geometry only, not proof of semantic roles or best crop.
  watch_party: [R(0,0,1,.3),R(0,.3,1,.7)],
  streaming: [R(0,0,1,.3),R(0,.3,1,.7)],
  game_screen_first: [R(0, 0, 1, 0.6), R(0, 0.6, 1, 0.4)],
};

export const PANEL_LABELS: Record<PanelLayout, string> = { split2: 'Split', three: 'Three', four: 'Four', screenshare: 'ScreenShare', gameplay: 'Gameplay', watch_party:'Watch Party', streaming:'Streaming', game_screen_first: 'Game screen first' };

/** Shared target geometry. Existing manual layouts retain their measured template. */
export function panelTargetRects(p:Pick<ItemPanels,'layout'|'topFraction'>):PanelRect[]{
 const f=p.topFraction;
 return p.layout==='gameplay'&&typeof f==='number'&&Number.isFinite(f)&&f>=.25&&f<=.5?[R(0,0,1,f),R(0,f,1,1-f)]:PANEL_RECTS[p.layout];
}

/**
 * Placeholder per-panel views. They are NOT subject detections: the first panel shows the whole frame
 * cover-cropped, the rest are zoomed views spread across the frame. Users edit each panel's crop box.
 */
export function defaultPanelSlots(layout: PanelLayout): PanelSlot[] {
  const n = PANEL_RECTS[layout].length;
  if (layout === 'game_screen_first') return [{focusX:.5,focusY:.5,scale:1},{focusX:.5,focusY:.5,scale:1.6}];
  if (layout === 'screenshare') return [{ focusX: 0.5, focusY: 0.5, scale: 1 }, { focusX: 0.5, focusY: 0.5, scale: 1.6 }];
  if (['gameplay','watch_party','streaming'].includes(layout)) return [{ focusX: 0.5, focusY: 0.5, scale: 1.6 }, { focusX: 0.5, focusY: 0.5, scale: 1 }];
  const xs = n === 3 ? [0.5, 0.25, 0.75] : [0.2, 0.8, 0.2, 0.8];
  return Array.from({ length: n }, (_, i) => ({ focusX: xs[i] ?? 0.5, focusY: 0.5, scale: i === 0 && n === 3 ? 1 : 1.6 }));
}

/** Reject malformed/outside/tiny source regions; do not turn them into different valid crops. */
export function normalizeSourceRect(r: unknown): PanelRect | null {
  if (!r || typeof r !== 'object') return null;
  const {x,y,w,h} = r as PanelRect;
  if (![x,y,w,h].every(v => typeof v === 'number' && Number.isFinite(v)) || x < 0 || y < 0 || w < 0.01 || h < 0.01 || x+w > 1.000001 || y+h > 1.000001) return null;
  return {x,y,w:Math.min(w,1-x),h:Math.min(h,1-y)};
}

/** Source pixels shown by this panel: a cover window, or the entire region in contain mode. */
export function panelSourceWindow(slot: PanelSlot, sourceW: number, sourceH: number, targetAspect: number): PanelRect {
  const r = normalizeSourceRect(slot.sourceRect) || {x:0,y:0,w:1,h:1};
  const ev=(v:number)=>Math.round(v/2)*2;
  const rw=slot.sourceRect ? Math.min(sourceW,Math.max(2,ev(sourceW*r.w))) : sourceW;
  const rh=slot.sourceRect ? Math.min(sourceH,Math.max(2,ev(sourceH*r.h))) : sourceH;
  const rx=slot.sourceRect ? Math.min(sourceW-rw,Math.max(0,ev(sourceW*r.x))) : 0;
  const ry=slot.sourceRect ? Math.min(sourceH-rh,Math.max(0,ev(sourceH*r.y))) : 0;
  if (slot.fit === 'contain') return {x:rx,y:ry,w:rw,h:rh};
  const w=Math.min(rw,rh*targetAspect)/slot.scale, h=Math.min(rh,rw/targetAspect)/slot.scale;
  return {x:rx+(rw-w)*slot.focusX,y:ry+(rh-h)*slot.focusY,w,h};
}

export function normalizePanels(p: Partial<ItemPanels> | undefined | null): ItemPanels | null {
  if (!p || !p.layout || !PANEL_RECTS[p.layout]) return null;
  const rects = PANEL_RECTS[p.layout];
  const def = defaultPanelSlots(p.layout);
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    layout: p.layout,
    ...(p.layout==='gameplay'&&typeof p.topFraction==='number'&&Number.isFinite(p.topFraction)&&p.topFraction>=.25&&p.topFraction<=.5?{topFraction:p.topFraction}:{}),
    slots: rects.map((_, i) => ({
      ...(p.slots?.[i]?.fit === 'contain' ? { fit: 'contain' as const, ...(p.slots?.[i]?.backdrop === 'blur' ? {backdrop:'blur' as const} : {}) } : {}),
      focusX: clamp(p.slots?.[i]?.focusX, 0, 1, def[i].focusX),
      focusY: clamp(p.slots?.[i]?.focusY, 0, 1, def[i].focusY),
      scale: clamp(p.slots?.[i]?.scale, 1, 4, def[i].scale),
      ...(normalizeSourceRect(p.slots?.[i]?.sourceRect) ? { sourceRect: normalizeSourceRect(p.slots?.[i]?.sourceRect)! } : {}),
      ...(p.slots?.[i]?.set === true ? { set: true } : {}),
      ...(p.slots?.[i]?.auto === 'track' ? { auto: 'track' as const } : {}),
    })),
  };
}

/** Integer pixel rects tiling the canvas exactly (even sizes, no gaps/overlaps; last row/col absorbs rounding). */
export function panelPixelRects(layout: PanelLayout, canvasW: number, canvasH: number, topFraction?:number): PanelRect[] {
  const ev = (v: number) => Math.round(v / 2) * 2;
  return panelTargetRects({layout,topFraction}).map((r) => {
    const x = ev(r.x * canvasW), y = ev(r.y * canvasH);
    const x2 = r.x + r.w >= 0.999 ? canvasW : ev((r.x + r.w) * canvasW);
    const y2 = r.y + r.h >= 0.999 ? canvasH : ev((r.y + r.h) * canvasH);
    return { x, y, w: x2 - x, h: y2 - y };
  });
}

/**
 * Chain-safe ffmpeg fragment (consumes the slice stream, ends unlabeled): split into N copies, each
 * cover-cropped with focus/zoom, or contained whole with black bars, then stacked.
 */
/** Materialize the current normal panel settings using actual source and
 * physical output dimensions. No new layout, ownership or persistence store. */
export function materializePanels(panelsIn:ItemPanels,sourceW:number,sourceH:number,outputW:number,outputH:number):NumericPanelGeometry|undefined {
 const p=normalizePanels(panelsIn);if(!p)return;
 const targets=panelPixelRects(p.layout,outputW,outputH,p.topFraction);
 return materializeNumericPanels({width:sourceW,height:sourceH},{width:outputW,height:outputH},targets.map((target,i)=>{
  const s=p.slots[i];
  // Compatibility is explicit and happens ONCE. Existing normal exports first
  // serialized source fractions to eight decimals. Preserve that chosen view,
  // then give preview/export/captions the same integers, never FFmpeg math text.
  // Validated review proposals do not enter this persisted-panel wrapper.
  const region=s.sourceRect?Object.fromEntries(Object.entries(s.sourceRect).map(([k,v])=>[k,Number(v.toFixed(8))])) as unknown as PanelRect:undefined;
  const legacySource={...s,...(region?{sourceRect:region}:{}),fit:'contain' as const};
  return{target,base:panelSourceWindow(legacySource,sourceW,sourceH,target.w/target.h),fit:s.fit==='contain'?'contain':'cover',scale:s.scale,focusX:s.focusX,focusY:s.focusY,backdrop:s.backdrop==='blur'?'blur':'black'};
 }));
}
export function buildPanelsFilter(panelsIn: ItemPanels, canvasW: number, canvasH: number, tag = 'vcp', sourceSize?:{width:number;height:number}): string {
  if(sourceSize){
    const geometry=materializePanels(panelsIn,sourceSize.width,sourceSize.height,canvasW,canvasH);
    const numeric=geometry&&numericPanelsFilter(geometry,tag);
    if(!numeric)throw new Error('PANEL_NUMERIC_GEOMETRY_REVIEW_REQUIRED');
    return numeric;
  }
  const panels = normalizePanels(panelsIn)!;
  const rects = panelPixelRects(panels.layout, canvasW, canvasH,panels.topFraction);
  const n = rects.length;
  const outs = rects.map((_, i) => `[${tag}_i${i}]`).join('');
  const parts = [`split=${n}${outs}`];
  rects.forEach((r, i) => {
    const a = (r.w / r.h).toFixed(5);
    const s = panels.slots[i];
    const region = s.sourceRect ? `crop=w='min(iw,max(2,round(iw*${s.sourceRect.w.toFixed(8)}/2)*2))':h='min(ih,max(2,round(ih*${s.sourceRect.h.toFixed(8)}/2)*2))':x='min(iw-ow,max(0,round(iw*${s.sourceRect.x.toFixed(8)}/2)*2))':y='min(ih-oh,max(0,round(ih*${s.sourceRect.y.toFixed(8)}/2)*2))',` : '';
    if(s.fit==='contain' && s.backdrop==='blur') {
      const radius=Math.max(1,Math.round(canvasW/540*16));
      parts.push(`[${tag}_i${i}]${region}split=2[${tag}_bb${i}][${tag}_ff${i}]`,
        `[${tag}_bb${i}]scale=${r.w}:${r.h}:force_original_aspect_ratio=increase,crop=${r.w}:${r.h},boxblur=${radius}:4,eq=brightness=-0.15[${tag}_bg${i}]`,
        `[${tag}_ff${i}]scale=${r.w}:${r.h}:force_original_aspect_ratio=decrease:force_divisible_by=2[${tag}_fg${i}]`,
        `[${tag}_bg${i}][${tag}_fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[${tag}_p${i}]`);
    } else {
    parts.push(
      `[${tag}_i${i}]${s.sourceRect ? `crop=w='min(iw,max(2,round(iw*${s.sourceRect.w.toFixed(8)}/2)*2))':h='min(ih,max(2,round(ih*${s.sourceRect.h.toFixed(8)}/2)*2))':x='min(iw-ow,max(0,round(iw*${s.sourceRect.x.toFixed(8)}/2)*2))':y='min(ih-oh,max(0,round(ih*${s.sourceRect.y.toFixed(8)}/2)*2))',` : ''}${s.fit === 'contain' ? `scale=${r.w}:${r.h}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${r.w}:${r.h}:(ow-iw)/2:(oh-ih)/2:color=black` : `crop=w='min(iw,ih*${a})/${s.scale.toFixed(4)}':h='min(ih,iw/${a})/${s.scale.toFixed(4)}':x='(iw-ow)*${s.focusX.toFixed(4)}':y='(ih-oh)*${s.focusY.toFixed(4)}',scale=${r.w}:${r.h}`},setsar=1[${tag}_p${i}]`
    );
    }
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
  // Null/undefined are an absent channel. Any supplied non-null channel must
  // be a recognizable panel template, never silently fall through to Quick
  // or to an unrelated crop when a stored layout is malformed.
  for(const track of project.tracks){
    if(track.type!=='VIDEO'||track.hidden)continue;
    for(const item of track.items){
      if(item.hidden||item.panels==null)continue;
      const p=item.panels as any;
      if(typeof p!=='object'||Array.isArray(p)||!Object.prototype.hasOwnProperty.call(PANEL_RECTS,p.layout)||
         (p.slots!==undefined&&!Array.isArray(p.slots))){
        const err=new Error('Saved panel layout needs review before exporting.') as Error & {code:string;statusCode:number};
        err.code='PANEL_LAYOUT_INVALID';err.statusCode=409;throw err;
      }
    }
  }
  const missing = unassignedPanelViews(project);
  if (missing.length) {
    const err = new Error(`Set every panel view before exporting (${missing.length} unassigned). Open each scene and use its Panel buttons to review and Apply each view.`) as Error & { code: string; statusCode: number };
    err.code = 'PANEL_VIEWS_UNASSIGNED'; err.statusCode = 409; throw err;
  }
}
/**
 * Seed ScreenShare/Gameplay from ONE tracked subject (the clip's smart-reframe track), when it exists:
 * the speaker/face panel is framed on the subject (zoomed), the other panel shows the whole frame
 * (screen or game). Which side holds the face is a Vireo design choice (ScreenShare: face bottom;
 * Gameplay: face in the small top strip) - Opus's panel roles are NOT known. Three/Four need several
 * distinct subjects, which a single track cannot supply, so they stay unassigned. No track -> unchanged.
 */
/** Suggestion only: subject-track role (face vs game) is unverified, so slots stay set:false (unassigned) until the user confirms. */
export function seedPanelsFromSubject(
  layout: PanelLayout,
  slots: PanelSlot[] | undefined,
  subject: { centerX: number; centerY?: number } | null | undefined,
  sourceSize?:{width:number;height:number},canvasAspect=9/16
): PanelSlot[] | undefined {
  if (!subject || (layout !== 'screenshare' && layout !== 'gameplay')) return slots;
  const faceIdx = layout === 'screenshare' ? 1 : 0;
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  const rect=PANEL_RECTS[layout][faceIdx],targetAspect=canvasAspect*rect.w/rect.h;
  // A measured center is not object-position. At a zoomed per-panel cover,
  // convert with that panel's actual aspect before seeding the crop dialog.
  const valid=sourceSize&&sourceSize.width>0&&sourceSize.height>0&&Number.isFinite(sourceSize.width+sourceSize.height+targetAspect)&&targetAspect>0;
  const windowW=valid?Math.min(1,sourceSize.height*targetAspect/sourceSize.width)/1.8:undefined;
  const windowH=valid?Math.min(1,sourceSize.width/(targetAspect*sourceSize.height))/1.8:undefined;
  const focus=(center:number,size:number|undefined)=>size===undefined?cl(center):1-size<1e-6?.5:cl((center-size/2)/(1-size));
  const face: PanelSlot = { focusX: focus(subject.centerX,windowW), focusY: focus(subject.centerY ?? 0.4,windowH), scale: 1.8, set: false, auto: 'track' };
  const whole: PanelSlot = { focusX: 0.5, focusY: 0.5, scale: 1, set: false, auto: 'track' };
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

/**
 * Manual Split without any reframe track: two stacked half-frame views, each a cover-crop of the full
 * source height centred on a speaker anchor (fractions of source width). Dimension-free: the crop x is an
 * ffmpeg expression over iw/ow, so it works for any source size/aspect and needs no probed dimensions.
 * Chain-safe fragment (consumes the slice stream, ends unlabeled), same contract as buildPanelsFilter.
 */
export function buildManualSplitFilter(canvasW: number, canvasH: number, speaker1X = 0.25, speaker2X = 0.75, tag = 'vcs'): string {
  const rects = panelPixelRects('split2', canvasW, canvasH);
  const cl = (v: number, d: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
  const cs = [cl(speaker1X, 0.25), cl(speaker2X, 0.75)];
  const parts = [`split=2[${tag}_i0][${tag}_i1]`];
  rects.forEach((r, i) => {
    const a = (r.w / r.h).toFixed(5);
    parts.push(
      `[${tag}_i${i}]crop=w='min(iw,ih*${a})':h='min(ih,iw/${a})':x='min(iw-ow,max(0,iw*${cs[i].toFixed(4)}-ow/2))':y='(ih-oh)/2',scale=${r.w}:${r.h},setsar=1[${tag}_p${i}]`
    );
  });
  parts.push(`[${tag}_p0][${tag}_p1]vstack=inputs=2`);
  return parts.join(';');
}
