import{resolvePreviewItemPlan}from'./previewItemAutomaticPlan.js';
import{normalizePanels,type ItemPanels}from'./panelLayouts.js';
export interface MeasuredPanelChoice{itemId:string;start:number;end:number;panels:ItemPanels}
/** Reuse an already verified measured plan only over the exact covered source
 * range. A layout click cannot invent people or duplicate a single view. */
export function measuredPanelChoice(choices:MeasuredPanelChoice[]|undefined,layout:string,start:number,end:number,itemId:string):ItemPanels|undefined{
 if(!['three','four'].includes(layout)||![start,end].every(Number.isFinite)||end<=start)return undefined;
 const valid=(choices||[]).filter(c=>[c.start,c.end].every(Number.isFinite)&&c.start<=start+1e-6&&c.end>=end-1e-6&&c.panels?.layout===layout&&c.itemId===itemId);
 if(valid.length!==1)return undefined;const raw=valid[0].panels;if(!Array.isArray(raw.slots)||raw.slots.length!==(layout==='three'?3:4)||raw.slots.some(s=>!s||![s.focusX,s.focusY,s.scale].every(Number.isFinite)||s.focusX<0||s.focusX>1||s.focusY<0||s.focusY>1||s.scale<1||s.scale>4))return undefined;const p=normalizePanels(valid[0].panels);if(!p||p.slots.length!==(layout==='three'?3:4)||p.slots.some(s=>!s.set||!s.sourceRect))return undefined;
 const rs=p.slots.map(s=>s.sourceRect!);if(rs.some((a,i)=>rs.some((b,j)=>i<j&&Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+1e-6&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1e-6)))return undefined;
 return structuredClone(p);
}

/** Manual choices do not render this plan automatically. They may seed from
 * the same verified source after removing only manual framing precedence. */
export function measuredPanelChoicesForManualPick(item:any,envelope:Parameters<typeof resolvePreviewItemPlan>[1],current:Parameters<typeof resolvePreviewItemPlan>[2]):MeasuredPanelChoice[]|undefined{
 if(!item)return undefined;const probe={...item,crop_config:{...item.crop_config}};delete probe.crop;delete probe.panels;delete probe.framing_window;delete probe.crop_config.layout_mode_source;
 const plan=resolvePreviewItemPlan(probe,envelope,current);if(plan.status!=='ready')return undefined;
 const manual=(envelope?.manualParticipantReview||[]).filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.start>=0&&s.end>s.start&&s.end<=(plan.identity.analysisDuration??plan.identity.analysisSourceEnd-plan.identity.analysisSourceStart)).map(s=>({itemId:item.id,start:s.start+plan.identity.analysisSourceStart,end:s.end+plan.identity.analysisSourceStart,panels:s.panels}));return [...manual,...plan.shots.flatMap((s:any)=>s.split?.focusPanels&&!manual.some(m=>m.start===s.start+plan.identity.analysisSourceStart&&m.end===s.end+plan.identity.analysisSourceStart&&m.panels.layout===s.split.focusPanels.layout)?[{itemId:item.id,start:s.start+plan.identity.analysisSourceStart,end:s.end+plan.identity.analysisSourceStart,panels:s.split.focusPanels}]:[])];
}
