import {sceneOverrideAt} from '../../server/src/shared/sceneLayoutOverrides';
export interface AutomaticLayoutRange {start:number;end:number;label:string;review?:boolean;reason?:string;sourceStart?:number;sourceEnd?:number}
/** Map source-clock analysis and persisted overrides without splitting timeline items. */
export function automaticLayoutRanges(item:any,ranges:AutomaticLayoutRange[],aspect:string){
 if(aspect!=='9:16')return [];
 const speed=item.speed?.speed||1;
 if(!Number.isFinite(speed)||speed<=0)return [];
 const overrides=item.scene_layout_overrides||[];
 const inputs=ranges.length?ranges:overrides.length?[{start:item.source_start,end:item.source_end,label:'Auto',review:true}]:[];
 return inputs.flatMap(r=>{
  const start=Math.max(item.source_start,r.start),end=Math.min(item.source_end,r.end);
  if(!(end>start))return [];
  const cuts=[...new Set<number>([start,end,...overrides.flatMap((o:any)=>[o.start,o.end]).filter((t:number)=>Number.isFinite(t)&&t>start&&t<end)])].sort((a,b)=>a-b);
  return cuts.slice(0,-1).map((a,n)=>{
   const b=cuts[n+1],o=sceneOverrideAt(item,(a+b)/2);
   const manual=item.crop||item.panels||item.framing_window||item.crop_config?.layout_mode_source==='user';
   const baseLabel=item.panels?.layout||item.crop?.choice||item.crop?.mode||'Manual';
   return {...r,...(!o&&manual?{label:`${baseLabel} (manual)`,review:false}:{}),...(!o&&!manual&&item.tracker?.enabled?{label:'Tracked',review:false}:{}),...(o&&o.layout!=='auto'?{label:`${o.layout.replace(/_/g,' ')} (manual)`,review:false}:{}),sourceStart:a,sourceEnd:b,start:Math.max(item.timeline_start,item.timeline_start+(a-item.source_start)/speed),end:Math.min(item.timeline_end,item.timeline_start+(b-item.source_start)/speed)};
  });
 }).filter(r=>r.end>r.start);
}
