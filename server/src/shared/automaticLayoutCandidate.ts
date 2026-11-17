/** Explicit, persisted review candidate. Does not enable analysis models or
 * change default Auto, manual crops/layouts, or existing measured vetoes. */
export const AUTO_LAYOUT_CANDIDATE='review-v1' as const;
export function candidateCompositionOptions(value:unknown){
 return value===AUTO_LAYOUT_CANDIDATE?{pairFocusReview:true,bodyOnlyPortraitReview:true}:{};
}
export function setProjectAutoCandidate<T extends {tracks:any[]}>(project:T,enabled:boolean):T{
 return {...project,tracks:project.tracks.map(t=>t.type!=='VIDEO'||t.locked?t:{...t,items:t.items.map((i:any)=>i.locked?i:{...i,crop_config:{...i.crop_config,automaticLayoutCandidate:enabled?AUTO_LAYOUT_CANDIDATE:undefined},...(i.scene_layout_overrides?{scene_layout_overrides:i.scene_layout_overrides.map((o:any)=>({...o,patch:{...o.patch,crop_config:{...o.patch.crop_config,automaticLayoutCandidate:enabled?AUTO_LAYOUT_CANDIDATE:undefined}}}))}:{})})})};
}
export function projectAutoCandidate(project:{tracks:any[]}):boolean{
 return project.tracks.some(t=>t.type==='VIDEO'&&!t.hidden&&t.items.some((i:any)=>i.crop_config?.automaticLayoutCandidate===AUTO_LAYOUT_CANDIDATE));
}
