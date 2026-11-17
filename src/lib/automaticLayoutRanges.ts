import {sceneOverrideAt} from '../../server/src/shared/sceneLayoutOverrides';
export interface AutomaticLayoutRange {start:number;end:number;label:string;review?:boolean;reason?:string;sourceStart?:number;sourceEnd?:number}
/** Map source-clock analysis to an item's displayed timeline without splitting or editing it. */
export function automaticLayoutRanges(item:any,ranges:AutomaticLayoutRange[],aspect:string){
 if(aspect!=='9:16')return [];
 const speed=item.speed?.speed||1;
 if(!Number.isFinite(speed)||speed<=0)return [];
 return ranges.map(r=>{const o=sceneOverrideAt(item,(Math.max(item.source_start,r.start)+Math.min(item.source_end,r.end))/2);const manual=item.crop||item.panels||item.framing_window||item.crop_config?.layout_mode_source==='user';const baseLabel=item.panels?.layout||item.crop?.choice||item.crop?.mode||'Manual';return ({...r,...(!o&&manual?{label:`${baseLabel} (manual)`,review:false}:{}),...(!o&&!manual&&item.tracker?.enabled?{label:'Tracked',review:false}:{}),...(o?{label:o.layout==='auto'?r.label:`${o.layout.replace(/_/g,' ')} (manual)`,review:false}:{}),sourceStart:Math.max(item.source_start,r.start),sourceEnd:Math.min(item.source_end,r.end),start:Math.max(item.timeline_start,item.timeline_start+(r.start-item.source_start)/speed),end:Math.min(item.timeline_end,item.timeline_start+(r.end-item.source_start)/speed)})}).filter(r=>r.end>r.start);
}
