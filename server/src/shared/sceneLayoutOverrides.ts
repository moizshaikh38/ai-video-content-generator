import{effectiveScenePatch,SCENE_LAYOUT_FIELDS}from'./sceneLayoutFields.js';
import{assertManualPlacement}from'./manualVideoPlacement.js';
import {validateAutomaticLayoutCropConfig} from './automaticLayoutValidation.js';
import {resolveTrackerEvidence,trackerEvidenceRange} from './trackerEvidence.js';
import {normalizePanels} from './panelLayouts.js';
export interface SceneLayoutOverride {start:number;end:number;layout:string;patch:{crop?:any;panels?:any;layout_mode?:string;crop_config?:any;manual_placement?:any;manual_source_crop?:any}}
const keys=SCENE_LAYOUT_FIELDS;
const layouts=['auto','fill','fit','blur','split','three','four','screenshare','gameplay','game_screen_first','watch_party','streaming'];
export function validateSceneLayoutOverrides(item:any):void{
 const os=item.scene_layout_overrides;if(os===undefined)return;
 if(!Array.isArray(os)||os.length>400)throw Error('Invalid scene layout overrides');
 if(item.is_freeze||item.is_title_card)throw Error('Scene layout overrides require normal video');
 let end=-Infinity;
 for(const o of os){
  if(!o||![o.start,o.end].every(Number.isFinite)||o.start<0||o.end<=o.start||o.start<end-1e-6||!layouts.includes(o.layout)||!o.patch||typeof o.patch!=='object'||Object.keys(o.patch).some(k=>!keys.includes(k as any)))throw Error('Invalid or overlapping scene layout range');
  const finiteTree=(x:any):boolean=>typeof x==='number'?Number.isFinite(x):Array.isArray(x)?x.every(finiteTree):x&&typeof x==='object'?Object.values(x).every(finiteTree):true;
  if(!finiteTree(o.patch)||Array.isArray(o.patch))throw Error('Invalid scene layout values');
  if(o.patch.crop_config&&(typeof o.patch.crop_config!=='object'||Array.isArray(o.patch.crop_config)))throw Error('Invalid scene crop config');
  validateAutomaticLayoutCropConfig(o.patch.crop_config);
  if(o.patch.panels&&!normalizePanels(o.patch.panels))throw Error('Invalid scene panels');
  if(o.patch.crop&&!['fill','fit','blur','custom'].includes(o.patch.crop.mode))throw Error('Invalid scene crop');
  if(o.patch.layout_mode&&!['track','split','screencast','blur'].includes(o.patch.layout_mode))throw Error('Invalid scene mode');
  assertManualPlacement(effectiveScenePatch(item,o.patch));
  end=o.end;
 }
}
export function sceneOverrideAt(item:any,sourceTime:number):SceneLayoutOverride|undefined{return item?.scene_layout_overrides?.find((o:SceneLayoutOverride)=>sourceTime>=o.start&&(sourceTime<o.end||(Math.abs(sourceTime-item.source_end)<=1e-9&&Math.abs(o.end-item.source_end)<=1e-9)));}
/** Crop/panel Apply targets the same saved scene as paused preview, including
 * its terminal frame. Internal scene cuts remain half-open. */
export function sceneCropPanelUpdate(item:any,sourceTime:number,patch:{crop?:any;panels?:any}){
 const selected=sceneOverrideAt(item,sourceTime);
 // This helper is called only by explicit Crop/panel Apply or drag, never
 // hydration. Mark exactly that effective scene as manual, not the base item
 // when the edit is scoped to a saved scene override.
 const current=selected?effectiveScenePatch(item,selected.patch):item;
 const manual={...patch,layout_mode:'track',crop_config:{...current.crop_config,layout_mode:'track',layout_mode_source:'user'}};
 return selected?{scene_layout_overrides:item.scene_layout_overrides.map((o:any)=>o===selected?{...o,patch:{...o.patch,...manual}}:o)}:{...manual,framing_window:undefined};
}
export function resolveSceneLayoutItem<T extends object>(item:T,sourceTime:number):T{
 const o=sceneOverrideAt(item,sourceTime);if(!o)return resolveTrackerEvidence(item,sourceTime);
 return resolveTrackerEvidence(effectiveScenePatch(item,o.patch),sourceTime) as T;
}
/** Render-only slices: persisted timeline items/IDs stay intact. Exact source
 * clocks survive trims/speed; internal boundaries add no edit transitions. */
export function expandSceneLayoutItem<T extends object>(item:T):T[]{
 const i=item as any;if(!i.scene_layout_overrides?.length&&!i.tracker?.enabled)return [item];validateSceneLayoutOverrides(i);
 if(i.is_freeze||i.is_title_card)throw Error('Scene layout overrides require normal video');
 const speed=i.speed?.speed||1;if(!(speed>0&&Number.isFinite(speed)))throw Error('Invalid scene speed');
 const start=i.source_start,end=i.source_end;if(![start,end,i.timeline_start,i.timeline_end].every(Number.isFinite)||end<=start)throw Error('Invalid scene item bounds');const measured=trackerEvidenceRange(i.tracker);const trackerCuts=measured?[measured.start,measured.end,...(Number.isFinite(i._tracker_handoff?.start)?[i._tracker_handoff.start]:[])]:[];const cuts=[...new Set([start,end,...trackerCuts.filter(t=>t>start&&t<end),...(i.scene_layout_overrides||[]).flatMap((o:SceneLayoutOverride)=>[o.start,o.end]).filter((t:number)=>t>start&&t<end)])].sort((a:any,b:any)=>a-b) as number[];
 return cuts.slice(0,-1).map((a,n)=>{const b=cuts[n+1],v:any={...resolveSceneLayoutItem(i,(a+b)/2),id:`${i.id}-scene-${n}`, _render_style_source_offset:a-start, source_start:a,source_end:b,timeline_start:i.timeline_start+(a-start)/speed,timeline_end:i.timeline_start+(b-start)/speed};delete v.scene_layout_overrides;if(n)delete v.transition_in;if(n<cuts.length-2)delete v.transition_out;return v as T});
}
export function expandSceneLayoutProject<T extends {tracks:any[]}>(project:T):T{return {...project,tracks:project.tracks.map(t=>t.type!=='VIDEO'?t:{...t,items:t.items.flatMap(expandSceneLayoutItem)})};}
