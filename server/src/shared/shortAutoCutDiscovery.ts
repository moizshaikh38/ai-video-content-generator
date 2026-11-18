/** Bounded source-cut evidence request for newly analyzed explicit smart Auto.
 * Cuts separate camera windows, never establish subjects or crop safety.
 * Source dimensions/fps are independently checked by the decoder. */
export function shortAutoCutDiscovery(clip:{aspect_ratio?:string;crop_config?:{mode?:string;layout_mode_source?:string}|null},duration:number):boolean {
 return clip.aspect_ratio==='9:16'&&clip.crop_config?.mode==='smart'&&clip.crop_config.layout_mode_source==='auto'&&Number.isFinite(duration)&&duration>0&&duration<=30;
}

/** Import precision-tagged visual cuts without dropping legitimate brief edge
 * shots. Untagged/coarse boundaries retain the old quarter-second margin. */
export function mergeDetectedSceneCuts(existing:number[],detected:number[],duration:number,evidence:Array<{time:number;refined?:boolean;method?:string;uncertainty_seconds?:number}>=[]):number[]{
 const cuts=existing.filter(t=>Number.isFinite(t)&&t>0&&t<duration);
 for(const time of detected){
  if(!Number.isFinite(time))continue;
  const precise=evidence.some(e=>e.method==='dense-luma-discontinuity'&&e.refined===true&&Number.isFinite(e.time)&&Math.abs(e.time-time)<1e-5&&Number.isFinite(e.uncertainty_seconds)&&Number(e.uncertainty_seconds)>0&&Number(e.uncertainty_seconds)<=.1);
  const margin=precise ? .04 : .25,gap=precise ? .12 : .4;
  if(time>margin&&time<duration-margin&&!cuts.some(t=>Math.abs(t-time)<gap))cuts.push(time);
 }
 return [...new Set(cuts)].sort((a,b)=>a-b);
}
