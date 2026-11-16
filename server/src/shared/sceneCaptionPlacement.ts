export type CaptionSceneLayout = 'fill' | 'fit' | 'blur' | 'split';
export interface CaptionPlacementContext {
  project: any;
  sourceWidth?: number;
  sourceHeight?: number;
  fallbackLayout?: string;
  fontSize?: number;
  maxCharsPerLine?: number;
  maxLines?: number;
  explicitConfigPosition?: boolean;
}

/** Reads the same persisted VIDEO-item layout contract as the editor controls.
 * No new scene store: callers use post-edit timeline windows, not source time. */
export function captionSceneLayout(item: any, fallback = 'fill'): CaptionSceneLayout {
  if (item?.crop?.mode === 'fit' || item?.crop?.mode === 'blur') return item.crop.mode;
  const layout = item?.crop_config?.layout_mode || item?.layout_mode;
  if (layout === 'split') return 'split';
  if (item?.crop?.mode === 'fill' || item?.crop?.mode === 'custom') return 'fill';
  if (item?.crop_config?.layout_mode_source === 'user') return 'fill';
  return fallback === 'split' ? 'split' : fallback === 'blur' ? 'blur' : fallback === 'fit' ? 'fit' : 'fill';
}

function itemPositionIsExplicit(item: any): boolean {
  const c = item?.caption;
  if (!c) return false;
  if (c.position_explicit === true || c.position_y !== undefined || c.position_x !== undefined) return true;
  if (c.position && c.position !== 'bottom') return true;
  const y = item?.transform?.position_y;
  return typeof y === 'number' && Math.abs(y - 500) > 0.5;
}

/** Automatic canvas anchors. Fit/Blur use the measured Opus reference glyph
 * center: y=585/720 at 4s,20s,24s in the preserved 406x720 preview.
 * This is a placement reference only, not same-moment or preset parity.
 * Split stays centered on the seam; Fill retains its lower safe edge. */
export function autoCaptionAnchor(layout: CaptionSceneLayout, context: CaptionPlacementContext, _item?: any, _text = ''): number {
  if (layout === 'split') return 0.5;
  if (layout === 'fit' || layout === 'blur') return 585 / 720;
  const canvas = context.project?.canvas || {};
  const ratio = canvas.aspect_ratio || '9:16';
  const w = ratio === '16:9' ? 1920 : 1080;
  const h = ratio === '9:16' ? 1920 : 1080;
  const inset = w * Math.min(20, Math.max(0, Number(canvas.background_spacing) || 0)) / 100;
  return Math.min(h * 0.88, h - inset - h * 0.035) / h;
}

/** Split only cues crossing actual item boundaries. Word windows are clipped,
 * not retimed. A word spanning a cut remains visible on both sides of that cut.
 * Output-only auto_position never becomes a persisted user override. */
export function applySceneCaptionPlacement<T extends {start:number;end:number;text?:string;[key:string]:any}>(cues: T[], context: CaptionPlacementContext): T[] {
  const track = context.project?.tracks?.find((t:any) => t.type === 'VIDEO' && !t.hidden);
  const scenes = (track?.items || []).filter((i:any) => !i.hidden && !i.is_title_card && i.timeline_end > i.timeline_start)
    .slice().sort((a:any,b:any) => a.timeline_start - b.timeline_start);
  if (!scenes.length) return cues;
  const captionItems = context.project?.tracks?.find((t:any) => t.type === 'CAPTION' && !t.hidden)?.items || [];
  const result: T[] = [];
  for (const cue of cues) {
    if (cue.position_x !== undefined || cue.position_y !== undefined || context.explicitConfigPosition) {result.push(cue);continue;}
    const boundaries = [cue.start, ...scenes.flatMap((s:any) => [s.timeline_start,s.timeline_end]).filter((t:number) => t > cue.start + 0.001 && t < cue.end - 0.001), cue.end];
    const times = [...new Set<number>(boundaries)].sort((a,b)=>a-b);
    for (let n=0;n<times.length-1;n++) {
      const start=times[n],end=times[n+1];
      const scene=scenes.find((s:any)=>start >= s.timeline_start-0.001 && start < s.timeline_end-0.001);
      const captionItem=captionItems.find((i:any)=>!i.hidden && start >= i.timeline_start-0.001 && start < i.timeline_end-0.001);
      if (!scene || itemPositionIsExplicit(captionItem)) {result.push({...cue,start,end});continue;}
      const words=Array.isArray(cue.words) ? cue.words.filter((v:any)=>v.end>start&&v.start<end).map((v:any)=>({...v,start:Math.max(v.start,start),end:Math.min(v.end,end)})) : undefined;
      if (Array.isArray(cue.words) && cue.words.length && !words?.length) continue;
      const text=words?.length ? words.map((v:any)=>v.text??v.word??'').join(' ') : cue.text;
      result.push({...cue,id:cue.id,start,end,...(words?{words}:{}),text,
        position_y:autoCaptionAnchor(captionSceneLayout(scene,context.fallbackLayout),context,scene,text),position_anchor:captionSceneLayout(scene,context.fallbackLayout)==='fill'?'bottom':'center',auto_position:true});
    }
  }
  return result;
}
