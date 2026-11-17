import type{ReframeSample,NormalizedPersonRegion}from '../types/index.js';
import type{ReviewShot}from './sharedViewReview.js';
export interface SplitSeamDecision {start:number;end:number;changed:boolean;reason:string;crossingSamples:number;observedHandSamples:number;sampleCount:number;}
/** Positive-evidence veto only. Hands have no inferred owner. A measured box
 * crossing a proposed partition cannot be shown intact in either disjoint view.
 * Missing hands never certify the seam. Review-only, no ordinary caller opts in. */
export function reviewMeasuredSplitSeams<T extends ReviewShot>(plan:T[],samples:Array<ReframeSample&{hands?:NormalizedPersonRegion[]}>):{shots:T[];decisions:SplitSeamDecision[]} {
 const decisions:SplitSeamDecision[]=[];
 const shots=plan.map(shot=>{
  const split=shot.split as {dividerX?:number;focusPanels?:unknown}|undefined;
  if(!split||split.focusPanels||!Number.isFinite(split.dividerX))return shot;
  const rows=samples.filter(s=>s.time>=shot.start&&s.time<shot.end),divider=split.dividerX!;
  const hands=rows.map(s=>(s.hands||[]).filter(h=>[h.x,h.y,h.width,h.height,h.confidence].every(Number.isFinite)&&h.confidence>=.8&&h.x>=0&&h.y>=0&&h.width>0&&h.height>0&&h.x+h.width<=1.001&&h.y+h.height<=1.001));
  const crossing=hands.filter(hs=>hs.some(h=>h.x<divider&&h.x+h.width>divider)).length;
  decisions.push({start:shot.start,end:shot.end,changed:crossing>0,reason:crossing?'A positively measured hand crosses the proposed split seam':'No positively measured crossing; missing detections remain unknown',crossingSamples:crossing,observedHandSamples:hands.filter(h=>h.length).length,sampleCount:rows.length});
  if(!crossing)return shot;
  const next={...shot,kind:'fit',windowW:1,windowH:1,keyframes:[{time:shot.start,centerX:.5,centerY:.5}],presentationProtection:{preserveWindow:true,reason:'measured-context'},contextStatus:'unresolved-review-required',uncertainty:'Split rejected because a measured hand crosses its partition. One full-source view retains the observed gesture without inferring ownership. Missed hands and other context remain unverified.'} as T;
  delete next.split;return next;
 });return{shots,decisions};
}
