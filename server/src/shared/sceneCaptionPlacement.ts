import {automaticFitBottomBoundary} from './automaticFitGeometry.js';
import {expandSceneLayoutProject} from './sceneLayoutOverrides.js';
import {normalizePanels,panelTargetRects} from './panelLayouts.js';
export type CaptionSceneLayout = 'fill' | 'fit' | 'blur' | 'split' | 'panel_seam' | 'panel_gameplay';
export interface CaptionPlacementContext {
  project: any;
  automaticWindows?: CaptionLayoutWindow[];
  sourceWidth?: number;
  sourceHeight?: number;
  fallbackLayout?: string;
  fontSize?: number;
  maxCharsPerLine?: number;
  maxLines?: number;
  explicitConfigPosition?: boolean;
}

export interface CaptionLayoutWindow {itemId:string;start:number;end:number;layout:CaptionSceneLayout;anchorY?:number}
/** Derived only from the picture composition plan. No persisted layout writes.
 * Plan clocks are clip-relative; item clocks include trim, speed and timeline edits. */
export function captionCompositionWindows(project:any,plan:any[],clipStart:number,sourceW:number,sourceH:number):CaptionLayoutWindow[]{
 if(project?.canvas?.aspect_ratio!=='9:16'||![clipStart,sourceW,sourceH].every(Number.isFinite)||sourceW<=0||sourceH<=0)return [];
 const items=expandSceneLayoutProject(project).tracks?.find((t:any)=>t.type==='VIDEO'&&!t.hidden)?.items||[];
 return items.flatMap((i:any)=>{
  if(i.hidden||i.is_title_card||i.is_freeze||i.crop||i.panels||i.framing_window||i.tracker?.enabled||i.crop_config?.layout_mode_source==='user')return [];
  const speed=i.speed?.speed??1;
  if(![i.source_start,i.source_end,i.timeline_start,i.timeline_end,speed].every(Number.isFinite)||speed<=0)return [];
  return plan.flatMap(s=>{
   if(![s.start,s.end,s.windowW,s.windowH].every(Number.isFinite)||s.end<=s.start||s.windowW<=0||s.windowH<=0)return [];
   const a=Math.max(i.source_start,s.start+clipStart),z=Math.min(i.source_end,s.end+clipStart);if(z<=a)return [];
   const start=Math.max(i.timeline_start,i.timeline_start+(a-i.source_start)/speed),end=Math.min(i.timeline_end,i.timeline_start+(z-i.source_start)/speed);
   const layout:CaptionSceneLayout=s.split?.focusPanels?.layout==='gameplay'?'panel_gameplay':s.split?'split':Math.abs(s.windowW*sourceW/(s.windowH*sourceH)-9/16)<.01?'fill':'fit';
   return end>start?[{itemId:i.id,start,end,layout,...(layout==='panel_gameplay'?{anchorY:panelTargetRects(s.split.focusPanels)[0].h}:layout==='fit'?{anchorY:fitPictureBoundaryAnchor(s.windowW*sourceW/(s.windowH*sourceH))}:{})}]:[];
  });
 });
}

/** Caption center sits on the lower sharp-picture boundary, not a fixed canvas
 * coordinate. This is derived from the same source window used by the picture
 * compiler. Unknown geometry keeps the legacy anchor; user coordinates win. */
export function fitPictureBoundaryAnchor(pictureAspect:number):number {
 if(!Number.isFinite(pictureAspect)||pictureAspect<=0)return 585/720;
 return automaticFitBottomBoundary(pictureAspect);
}

/** Reads the same persisted VIDEO-item layout contract as the editor controls.
 * No new scene store: callers use post-edit timeline windows, not source time. */
export function captionSceneLayout(item: any, fallback = 'fill'): CaptionSceneLayout {
  const panels=normalizePanels(item?.panels);
  if (panels) return ['gameplay','watch_party','streaming','game_screen_first'].includes(panels.layout) ? 'panel_gameplay' : 'panel_seam';
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
 * center: y=585/720 at 4s and 20s in the preserved 406x720 preview.
 * This is a placement reference only, not same-moment or preset parity.
 * Split stays centered on the seam; Fill retains its lower safe edge. */
export function autoCaptionAnchor(layout: CaptionSceneLayout, context: CaptionPlacementContext, _item?: any, _text = ''): number {
  if(layout==='panel_gameplay'){
    const p=normalizePanels(_item?.panels);return p?panelTargetRects(p)[0].h:.5;
  }
  if (layout === 'split' || layout === 'panel_seam') return 0.5;
  if (layout === 'fit' || layout === 'blur' || layout === 'fill') return 585 / 720;
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
  const track = (context.project?.tracks ? expandSceneLayoutProject(context.project) : context.project)?.tracks?.find((t:any) => t.type === 'VIDEO' && !t.hidden);
  const scenes = (track?.items || []).filter((i:any) => !i.hidden && !i.is_title_card && i.timeline_end > i.timeline_start)
    .slice().sort((a:any,b:any) => a.timeline_start - b.timeline_start);
  if (!scenes.length) return cues;
  const captionItems = context.project?.tracks?.find((t:any) => t.type === 'CAPTION' && !t.hidden)?.items || [];
  const result: T[] = [];
  for (const cue of cues) {
    if (cue.position_x !== undefined || cue.position_y !== undefined || context.explicitConfigPosition) {result.push(cue);continue;}
    const windows=context.automaticWindows||[];
    const boundaries = [cue.start, ...[...scenes.flatMap((s:any) => [s.timeline_start,s.timeline_end]),...windows.flatMap(w=>[w.start,w.end])].filter((t:number) => t > cue.start + 0.001 && t < cue.end - 0.001), cue.end];
    const times = [...new Set<number>(boundaries)].sort((a,b)=>a-b);
    for (let n=0;n<times.length-1;n++) {
      const start=times[n],end=times[n+1];
      const scene=scenes.find((s:any)=>start >= s.timeline_start-0.001 && start < s.timeline_end-0.001);
      const captionItem=captionItems.find((i:any)=>!i.hidden && start >= i.timeline_start-0.001 && start < i.timeline_end-0.001);
      if (!scene || itemPositionIsExplicit(captionItem)) {result.push({...cue,start,end});continue;}
      const words=Array.isArray(cue.words) ? cue.words.filter((v:any)=>v.end>start&&v.start<end).map((v:any)=>({...v,start:Math.max(v.start,start),end:Math.min(v.end,end)})) : undefined;
      if (Array.isArray(cue.words) && cue.words.length && !words?.length) continue;
      const text=words?.length ? words.map((v:any)=>v.text??v.word??'').join(' ') : cue.text;
      const window=windows.find(w=>w.itemId===scene.id&&start>=w.start-.001&&start<w.end-.001);
      const layout=window?.layout??captionSceneLayout(scene,context.fallbackLayout);
      result.push({...cue,id:cue.id,start,end,...(words?{words}:{}),text,
        position_y:window?.anchorY??autoCaptionAnchor(layout,context,scene,text),position_anchor:'center',auto_position:true});
    }
  }
  return result;
}

/** Quick-render uses its actual picture plan, without creating a saved editor. */
export function quickCaptionProject(duration:number){return {canvas:{aspect_ratio:'9:16',duration},tracks:[{type:'VIDEO',items:[{id:'quick-source',source_start:0,source_end:duration,timeline_start:0,timeline_end:duration}]}]};}
export function quickCaptionWindows(plan:any[],duration:number,w:number,h:number){return captionCompositionWindows(quickCaptionProject(duration),plan,0,w,h);}
