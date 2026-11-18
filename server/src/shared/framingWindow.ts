/**
 * framing_window: ONE user-accepted, materialized "context window" for ONE video item (scene).
 * Copied from the stored auto plan at the moment the user clicks Apply; later reanalysis never changes it.
 * It is NOT Fill, Split, ScreenShare or a face tracker, and it proves nothing about what is on screen.
 *
 * Pure module (no IO). Shared by the editor (apply + preview rect) and the server (save validation + compile).
 * Clock: keyframe times are SOURCE-FILE seconds. Plan times are clip-relative, so source = clipStartSec + planTime,
 * where clipStartSec = clip.start_seconds + trim_start_offset (same origin the Pro compiler uses).
 */
export const FRAMING_WINDOW_VERSION = 1 as const;
export const FRAMING_WINDOW_ERROR_CODE = 'INVALID_FRAMING_WINDOW';
export const MAX_FRAMING_KEYFRAMES = 40;
const EPS = 0.05; // seconds
const MIN_PIECE = 0.1; // seconds

export interface FramingWindowKeyframe { time: number; centerX: number; centerY: number }
export interface FramingWindow {
  version: 1;
  kind: 'context_window';
  origin: 'user_accepted_auto_plan';
  plan_version: string;
  plan_status: 'group' | 'solo' | 'fit' | 'crowd-preserved';
  source_asset_id: string | null;
  source_path: string | null;
  source_width: number;
  source_height: number;
  analyzed_trim_start: number;
  canvas_aspect: '9:16';
  /** Fractions of the source frame (width, height). Copied from the plan, not re-derived. */
  window: { w: number; h: number };
  keyframes: FramingWindowKeyframe[];
  applied_at?: string;
}

export class FramingWindowError extends Error {
  readonly code = FRAMING_WINDOW_ERROR_CODE;
  constructor(public readonly reasons: string[]) { super(`Invalid framing window: ${reasons.join('; ')}`); }
}

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export interface FramingWindowContext {
  item?: Record<string, any> | null;
  /** ACTUAL decoded source size (ffprobe at render). Compile requires it; save may omit it. */
  decodedWidth?: number | null;
  decodedHeight?: number | null;
  sourcePath?: string | null;
  canvasAspect?: string | null;
}

/** Item state the window cannot coexist with. Returned as reasons; empty = no conflict. `replaceable` ones can be cleared on explicit user confirmation. */
export function framingWindowConflicts(item: Record<string, any> | null | undefined): { replaceable: string[]; blocking: string[] } {
  const replaceable: string[] = []; const blocking: string[] = [];
  if (!item) return { replaceable, blocking };
  const c = item.crop;
  if (c && ((c.mode && c.mode !== 'fill') || (c.scale !== undefined && c.scale !== 1) || (c.focusX !== undefined && c.focusX !== .5) || (c.focusY !== undefined && c.focusY !== .5))) replaceable.push('a crop or Fit/Blur/zoom setting');
  if (item.panels) replaceable.push('panel layout');
  if (item.tracker && (item.tracker.enabled || (Array.isArray(item.tracker.keyframes) && item.tracker.keyframes.length))) replaceable.push('subject tracker');
  const lm = item.layout_mode; const src = item.crop_config?.layout_mode_source;
  if (lm && src !== 'genre_recommendation' && !item.framing_window) replaceable.push(`${lm} layout`);
  const t = item.transform;
  if (t && !(t.position_x === 0 && t.position_y === 0 && t.scale === 1 && t.rotation === 0 && t.opacity === 1)) blocking.push('a non-identity transform');
  if (Array.isArray(item.keyframes) && item.keyframes.length) blocking.push('item keyframes');
  if (Array.isArray(item.effects) && item.effects.length) blocking.push('item effects');
  if (item.is_freeze || item.is_title_card) blocking.push('a freeze or title-card item');
  const sp = item.speed; const speed = typeof sp === 'number' ? sp : sp?.speed;
  if ((speed !== undefined && speed !== 1) || sp?.speed_ramp) blocking.push('a speed change');
  return { replaceable, blocking };
}

/** Strict structural + clock + identity validation. Never throws; returns reasons. */
export function validateFramingWindow(raw: unknown, ctx: FramingWindowContext = {}): { ok: true; value: FramingWindow } | { ok: false; reasons: string[] } {
  const r: string[] = [];
  const fw = raw as any;
  if (!fw || typeof fw !== 'object' || Array.isArray(fw)) return { ok: false, reasons: ['framing_window must be an object'] };
  if (fw.version !== 1) r.push('unsupported version');
  if (fw.kind !== 'context_window') r.push('unsupported kind');
  if (fw.origin !== 'user_accepted_auto_plan') r.push('unsupported origin');
  if (typeof fw.plan_version !== 'string' || !fw.plan_version || fw.plan_version.length > 64) r.push('plan_version missing');
  if (!['group', 'solo', 'fit', 'crowd-preserved'].includes(fw.plan_status)) r.push('plan_status not applicable');
  if (fw.source_asset_id !== null && fw.source_asset_id !== undefined && (typeof fw.source_asset_id !== 'string' || fw.source_asset_id.length > 200)) r.push('source_asset_id invalid');
  if (fw.source_path !== null && fw.source_path !== undefined && (typeof fw.source_path !== 'string' || fw.source_path.length > 2000)) r.push('source_path invalid');
  if (!(fin(fw.source_width) && fw.source_width >= 16 && fw.source_width <= 16384) || !(fin(fw.source_height) && fw.source_height >= 16 && fw.source_height <= 16384)) r.push('source size out of range');
  if (!(fin(fw.analyzed_trim_start) && fw.analyzed_trim_start >= 0)) r.push('analyzed_trim_start invalid');
  if (fw.canvas_aspect !== '9:16') r.push('only 9:16 is supported');
  if (typeof fw.source_path !== 'string' || !fw.source_path) r.push('source path identity is required');
  const w = fw.window?.w, h = fw.window?.h;
  if (!(fin(w) && w >= 0.25 && w <= 1) || !(fin(h) && h >= 0.25 && h <= 1)) r.push('window size must be 0.25..1');
  const kfs = fw.keyframes;
  if (!Array.isArray(kfs) || kfs.length < 1 || kfs.length > MAX_FRAMING_KEYFRAMES) r.push(`keyframes must be 1..${MAX_FRAMING_KEYFRAMES}`);
  else {
    let prev = -Infinity;
    for (const k of kfs) {
      if (!k || !fin(k.time) || !fin(k.centerX) || !fin(k.centerY)) { r.push('keyframe not finite'); break; }
      if (k.time < 0 || k.time <= prev) { r.push('keyframe times must be increasing and >= 0'); break; }
      prev = k.time;
      if (k.centerX < 0 || k.centerX > 1 || k.centerY < 0 || k.centerY > 1) { r.push('keyframe center outside 0..1'); break; }
      if (fin(w) && fin(h) && (k.centerX - w / 2 < -0.001 || k.centerX + w / 2 > 1.001 || k.centerY - h / 2 < -0.001 || k.centerY + h / 2 > 1.001)) { r.push('keyframe window leaves the source frame'); break; }
    }
  }
  const item = ctx.item;
  if (item) {
    if (item.type !== undefined && item.type !== 'VIDEO') r.push('only VIDEO items can carry a framing window');
    const s0 = Number(item.source_start), s1 = Number(item.source_end);
    if (!fin(s0) || !fin(s1) || s1 <= s0) r.push('item source range invalid');
    else if (Array.isArray(kfs) && kfs.length && fin(kfs[0]?.time) && kfs[0].time > s0 + EPS) r.push('keyframes do not cover the item source range start');
    if (item.source_path != null && fw.source_path != null && item.source_path !== fw.source_path) r.push('source path differs from the item');
    if (item.source_asset_id != null && fw.source_asset_id != null && item.source_asset_id !== fw.source_asset_id) r.push('source asset differs from the item');
    const c = framingWindowConflicts(item);
    for (const b of c.blocking) r.push(`item has ${b}`);
    for (const b of c.replaceable) r.push(`item also has ${b}`);
  }
  if (ctx.canvasAspect && ctx.canvasAspect !== '9:16') r.push('canvas is not 9:16');
  if (ctx.decodedWidth !== undefined || ctx.decodedHeight !== undefined) {
    if (!(fin(ctx.decodedWidth) && fin(ctx.decodedHeight)) || ctx.decodedWidth !== fw.source_width || ctx.decodedHeight !== fw.source_height) r.push('decoded source size does not match the analysed size');
  }
  if (ctx.sourcePath != null && fw.source_path != null && ctx.sourcePath !== fw.source_path) r.push('source path differs from the render input');
  return r.length ? { ok: false, reasons: [...new Set(r)] } : { ok: true, value: fw as FramingWindow };
}

/** Same rounding and clamping as SmartReframeService.buildGroupFitFilter (win size, 4dp values, 3dp times). */
export function framingWindowCropSize(w: number, h: number, sourceWidth: number, sourceHeight: number): { winW: number; winH: number } {
  return { winW: Math.round(w * sourceWidth), winH: Math.min(sourceHeight, Math.max(1, Math.round(h * sourceHeight))) };
}

/** Crop rectangle in source pixels at slice-local time t (seconds from the item's source_start), as the ffmpeg crop expression evaluates it. Supplied for the owner's preview. */
export function framingWindowRect(fw: FramingWindow, sliceStartSource: number, t: number, sourceWidth = fw.source_width, sourceHeight = fw.source_height) {
  const { winW, winH } = framingWindowCropSize(fw.window.w, fw.window.h, sourceWidth, sourceHeight);
  const kfs = fw.keyframes.map((k) => ({ time: Number((k.time - sliceStartSource).toFixed(3)), cx: Number(k.centerX.toFixed(4)), cy: Number(k.centerY.toFixed(4)) }));
  const at = (pick: 'cx' | 'cy') => {
    // Mirrors the nested if(lte(t,k1)...) chain: before first key holds the first value, after last holds the last.
    for (let i = 0; i < kfs.length - 1; i++) {
      const a = kfs[i], b = kfs[i + 1];
      if (t <= b.time) return a[pick] + (b[pick] - a[pick]) * (t - a.time) / Math.max(0.001, b.time - a.time);
    }
    return kfs[kfs.length - 1][pick];
  };
  const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
  const x = Math.min(Math.max(sourceWidth * clamp01(at('cx')) - winW / 2, 0), sourceWidth - winW);
  const y = Math.min(Math.max(sourceHeight * clamp01(at('cy')) - winH / 2, 0), sourceHeight - winH);
  return { x, y, w: winW, h: winH };
}

// ---------------------------------------------------------------- apply (pure, atomic)

export interface PlanShot { split?: {speaker1X:number;speaker2X:number;dividerX:number;focusPanels?:import('./panelLayouts.js').ItemPanels}; start: number; end: number; kind: 'group' | 'solo' | 'fit'; windowW: number; windowH: number; keyframes: FramingWindowKeyframe[]; contextStatus?: string; uncertainty?: string }
export interface ApplyContext {
  clipStartSec: number;
  analyzedTrimStart: number;
  currentTrimStart: number;
  planVersion: string;
  /** Source identity of the plan (analysed track). */
  sourceWidth: number; sourceHeight: number;
  sourcePath?: string | null; sourceAssetId?: string | null;
  /** Set only after the user confirmed 'Replace this scene framing'. */
  replaceConflicts?: boolean;
  nowIso?: string;
}
export type ApplyResult =
  | { ok: true; project: any; itemId: string; split: boolean; cleared: string[] }
  | { ok: false; reasons: string[]; needsReplaceConfirm?: string[] };

/**
 * Apply ONE plan scene to the project: split ONLY that interval out of the single VIDEO item that contains it
 * (math: timeline = item.timeline_start + (sceneSource - item.source_start)/speed, speed must be 1), then attach
 * framing_window to the middle piece. Everything else in the project is returned untouched. Never throws.
 */
export function applyPlanSceneToProject(project: any, shot: PlanShot, ctx: ApplyContext): ApplyResult {
  const no = (...reasons: string[]): ApplyResult => ({ ok: false, reasons });
  if (!project || !Array.isArray(project.tracks)) return no('No project.');
  if (project.canvas?.aspect_ratio && project.canvas.aspect_ratio !== '9:16') return no('Only 9:16 projects are supported.');
  if (!shot || !fin(shot.start) || !fin(shot.end) || !(shot.end > shot.start)) return no('Scene bounds are not usable.');
  if (shot.split) return no('This is a two-panel automatic Split, not a single framing window. Use the Split layout controls to edit it.');
  if (shot.contextStatus === 'unresolved-review-required' || shot.contextStatus === 'unresolved-preserved') return no('This scene is unresolved in the analysis, so it cannot be applied.');
  if (!['group', 'solo', 'fit'].includes(shot.kind)) return no('Unknown scene kind.');
  if (!fin(ctx.clipStartSec) || !fin(ctx.analyzedTrimStart) || !fin(ctx.currentTrimStart)) return no('Clip clock is unknown.');
  if (Math.abs(ctx.analyzedTrimStart - ctx.currentTrimStart) > EPS) return no('The clip trim changed since the analysis, so the plan is stale.');
  if (typeof ctx.sourcePath !== 'string' || !ctx.sourcePath) return no('Analysis source identity is missing. Re-analyze this clip first.');
  const status: FramingWindow['plan_status'] = shot.contextStatus === 'crowd-preserved' ? 'crowd-preserved' : shot.kind;

  const videoTracks = project.tracks.filter((t: any) => t.type === 'VIDEO');
  const vItems: Array<{ t: any; i: any }> = [];
  for (const t of videoTracks) for (const i of t.items || []) if (!i.hidden) vItems.push({ t, i });
  const sources = new Set(vItems.map(({ i }) => `${i.source_asset_id ?? ''}|${i.source_path ?? ''}`));
  if (sources.size > 1) return no('The timeline uses more than one source video.');
  const sorted = [...vItems].sort((a, b) => a.i.timeline_start - b.i.timeline_start);
  for (let n = 1; n < sorted.length; n++) if (sorted[n].i.timeline_start < sorted[n - 1].i.timeline_end - 0.001) return no('Video items overlap on the timeline.');

  const S0 = ctx.clipStartSec + shot.start, S1 = ctx.clipStartSec + shot.end;
  const hit = vItems.filter(({ i }) => !i.is_freeze && !i.is_title_card && fin(i.source_start) && fin(i.source_end) && i.source_start <= S0 + EPS && i.source_end >= S1 - EPS);
  if (hit.length === 0) return no('No single video item contains this whole scene. Split at the scene boundaries first.');
  if (hit.length > 1) return no('More than one video item contains this scene.');
  const { t: track, i: item } = hit[0];
  if (track.locked || item.locked) return no('The video track or item is locked.');
  if (ctx.sourcePath != null && item.source_path != null && ctx.sourcePath !== item.source_path) return no('The item source differs from the analysed source.');
  if (ctx.sourceAssetId != null && item.source_asset_id != null && ctx.sourceAssetId !== item.source_asset_id) return no('The item source asset differs from the analysed source.');
  const cf = framingWindowConflicts(item);
  if (cf.blocking.length) return no(`This scene cannot take a framing window: ${cf.blocking.join(', ')}.`);
  if (item.caption && Array.isArray(item.caption.cues) && item.caption.cues.length) return no('This video item carries caption cues, which splitting would have to partition.');
  if (item.framing_window !== undefined) cf.replaceable.push('an earlier framing window');
  if (cf.replaceable.length && !ctx.replaceConflicts) return { ok: false, reasons: [`This scene already has ${cf.replaceable.join(', ')}.`], needsReplaceConfirm: cf.replaceable };

  const matchStart = Math.abs(item.source_start - S0) <= EPS, matchEnd = Math.abs(item.source_end - S1) <= EPS;
  const leftLen = matchStart ? 0 : S0 - item.source_start, rightLen = matchEnd ? 0 : item.source_end - S1;
  if ((!matchStart && leftLen <= MIN_PIECE) || (!matchEnd && rightLen <= MIN_PIECE)) return no('The scene would leave a piece shorter than 0.1 s.');
  const r3 = (v: number) => Number(v.toFixed(3));
  const tl = (src: number) => r3(item.timeline_start + (src - item.source_start)); // speed is 1 (blocked otherwise)
  const midStartSrc = matchStart ? item.source_start : S0, midEndSrc = matchEnd ? item.source_end : S1;

  // keyframes: plan time -> source seconds; keep those inside the scene, plus a hold value at the scene start.
  const all = (Array.isArray(shot.keyframes) ? shot.keyframes : []).map((k) => ({ time: r3(ctx.clipStartSec + k.time), centerX: k.centerX, centerY: k.centerY }));
  const inside = all.filter((k) => k.time > midStartSrc + 1e-6 && k.time <= midEndSrc);
  const before = [...all].reverse().find((k) => k.time <= midStartSrc + 1e-6) ?? all[0];
  if (!before) return no('The plan has no keyframes for this scene.');
  const keyframes = [{ time: r3(midStartSrc), centerX: before.centerX, centerY: before.centerY }, ...inside];
  const fw: FramingWindow = {
    version: 1, kind: 'context_window', origin: 'user_accepted_auto_plan', plan_version: ctx.planVersion, plan_status: status,
    source_asset_id: item.source_asset_id ?? ctx.sourceAssetId ?? null, source_path: item.source_path ?? ctx.sourcePath ?? null,
    source_width: ctx.sourceWidth, source_height: ctx.sourceHeight, analyzed_trim_start: ctx.analyzedTrimStart, canvas_aspect: '9:16',
    window: { w: shot.windowW, h: shot.windowH }, keyframes, ...(ctx.nowIso ? { applied_at: ctx.nowIso } : {}),
  };
  const mid: any = { ...JSON.parse(JSON.stringify(item)), source_start: r3(midStartSrc), source_end: r3(midEndSrc), timeline_start: tl(midStartSrc), timeline_end: tl(midEndSrc) };
  const cleared: string[] = [...cf.replaceable];
  delete mid.crop; delete mid.panels; delete mid.tracker;
  mid.layout_mode = 'track';
  mid.crop_config = { ...(mid.crop_config || {}), layout_mode: 'track', layout_mode_source: 'user' };
  mid.framing_window = fw;
  const v = validateFramingWindow(fw, { item: mid, canvasAspect: '9:16' });
  if (!v.ok) return no(...v.reasons);

  const pieces: any[] = [];
  if (!matchStart) pieces.push({ ...JSON.parse(JSON.stringify(item)), source_end: r3(S0), timeline_end: tl(S0), transition_out: undefined });
  pieces.push(!matchStart ? { ...mid, id: `${item.id}-fw-${Math.round(S0 * 1000)}`, transition_in: undefined, ...(matchEnd ? {} : { transition_out: undefined }) } : { ...mid, ...(matchEnd ? {} : { transition_out: undefined }) });
  if (!matchEnd) pieces.push({ ...JSON.parse(JSON.stringify(item)), id: `${item.id}-fwr-${Math.round(S1 * 1000)}`, source_start: r3(S1), timeline_start: tl(S1), transition_in: undefined });
  const next = { ...project, tracks: project.tracks.map((t: any) => t === track ? { ...t, items: t.items.flatMap((i: any) => i === item ? pieces : [i]) } : t) };
  return { ok: true, project: next, itemId: pieces.find((p) => p.framing_window)!.id, split: pieces.length > 1, cleared };
}

/**
 * Apply is offered only while the editor preview renders framing_window with the same crop math as the export
 * (framingWindowRect). Flip to true in the change that makes PreviewCanvas read item.framing_window.
 */
export const FRAMING_WINDOW_PREVIEW_PARITY = true;
