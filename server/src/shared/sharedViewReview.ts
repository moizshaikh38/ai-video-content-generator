import type {ReframeSample,NormalizedPersonRegion} from '../types/index.js';
type SharedViewSample=ReframeSample&{hands?:NormalizedPersonRegion[]};
import {associatedBodyEnvelope} from './bodyContext.js';
export interface ReviewShot {start:number;end:number;kind:'group'|'solo'|'fit';windowW:number;windowH:number;keyframes:Array<{time:number;centerX:number;centerY:number}>;split?:unknown;contextStatus?:string;uncertainty?:string;presentationProtection?:unknown}
export interface SharedViewEvidenceBundle {samples:SharedViewSample[];sourceWidth:number;sourceHeight:number;fullBodyRequired?:boolean;protectedRegions:Array<{start:number;end:number;x:number;y:number;width:number;height:number;confidence:number}>}
export interface SharedViewIntent {kind:'two-face-body-anchors';trackIds:string[];semanticVerification:'unknown';fullBodyRequirement:'unspecified'}
export interface SharedViewCandidate {id:'legacy'|'shared43';shot:ReviewShot;scaleBenefit:number;bodySideLoss:number;score:number}
export interface SharedViewDecision {start:number;end:number;selected:'legacy'|'shared43';reason:string;intent?:SharedViewIntent;candidates?:SharedViewCandidate[];handSampleCoverage?:number;maxHandGap?:number}
export interface SharedViewRenderPlan {version:'shared-view-review-v1';shots:ReviewShot[];decisions:SharedViewDecision[]}
const valid=(b:any)=>b&&[b.x,b.y,b.width,b.height,b.confidence].every(Number.isFinite)&&b.x>=0&&b.y>=0&&b.width>0&&b.height>0&&b.x+b.width<=1.001&&b.y+b.height<=1.001;
/** Review-only bounded alternative, never face identity/action completeness proof.
 * Face/hand supports constrain one shared view; person-box side extent is an
 * explicit soft cost rather than a requirement for full-body presentation.
 * No missing-hand-as-absence or hand-ownership inference. */
export function buildSharedViewReviewPlan(baseline:ReviewShot[],evidence:SharedViewEvidenceBundle):SharedViewRenderPlan {
 const {samples,sourceWidth:w,sourceHeight:h,protectedRegions}=evidence;
 const decisions:SharedViewDecision[]=[];
 const shots=baseline.map(original=>{
  const stay=(reason:string)=>{decisions.push({start:original.start,end:original.end,selected:'legacy',reason});return original};
  if(evidence.fullBodyRequired)return stay('Explicit full-body requirement');
  if(![w,h].every(Number.isFinite)||!(w>0&&h>0)||w/h<=4/3||original.split||Math.abs(original.windowW-1)>1e-6||Math.abs(original.windowH-1)>1e-6||original.keyframes.length!==1)return stay('Not a full-source single-view alternative');
  const rows=samples.filter(s=>s.time>=original.start&&s.time<original.end).sort((a,b)=>a.time-b.time);
  if(original.end-original.start<1.5||rows.length<6||rows[0].time-original.start>.3||original.end-rows.at(-1)!.time>.3||rows.some((s,i)=>!Number.isFinite(s.time)||i>0&&(s.time<=rows[i-1].time||s.time-rows[i-1].time>.6)))return stay('Insufficient shot-local sample coverage');
  const ids=[...new Set(rows.flatMap(s=>s.faces.map(f=>f.track_id)))];
  if(ids.length!==2||ids.some(id=>!id)||rows.some(s=>s.faces.some(f=>!valid(f)||f.confidence<.7))||rows.filter(s=>s.faces.length===2).length<rows.length*.8||!associatedBodyEnvelope(rows,ids as string[]))return stay('Two repeated face/body anchors not supported');
  const handsByRow=rows.map(s=>(s.hands||[]).filter(b=>valid(b)&&b.confidence>=.8)),handTimes=rows.filter((_,i)=>handsByRow[i].length>0).map(s=>s.time);
  const coverage=handTimes.length/rows.length;
  if(coverage<.8)return stay('Positive hand support below review threshold; missing remains unknown');
  const width=(4/3)*h/w;
  const regions=protectedRegions.filter(r=>r.start<original.end&&r.end>original.start&&r.confidence>=.7);
  if(regions.some(r=>!valid(r)))return stay('Invalid supplied context region');
  const anchors=[...rows.flatMap(s=>s.faces),...handsByRow.flat(),...regions];
  const left=Math.max(0,Math.min(...anchors.map(b=>b.x))-.025),right=Math.min(1,Math.max(...anchors.map(b=>b.x+b.width))+.025);
  const lo=Math.max(width/2,right-width/2),hi=Math.min(1-width/2,left+width/2);
  if(lo>hi)return stay('Sampled face/hand/context supports cannot fit 4:3');
  const x=Math.max(lo,Math.min(hi,original.keyframes[0].centerX));
  const bodies=rows.flatMap(s=>(s.persons||[]).filter(b=>valid(b)&&b.confidence>=.4));
  const loss=bodies.reduce((n,b)=>n+1-Math.max(0,Math.min(b.x+b.width,x+width/2)-Math.max(b.x,x-width/2))/b.width,0)/Math.max(1,bodies.length);
  const benefit=Math.log(1/width),score=benefit-loss;
  const shot:ReviewShot={start:original.start,end:original.end,kind:'fit',windowW:width,windowH:1,keyframes:[{time:original.start,centerX:x,centerY:.5}],contextStatus:'unresolved-review-required',uncertainty:'Review-only shared 4:3: sampled faces/hands and supplied regions retained. Lateral person-box extent is cropped; full-body/action completeness, missed hands and other context remain unverified.'};
  const candidates:SharedViewCandidate[]=[{id:'legacy',shot:original,scaleBenefit:0,bodySideLoss:0,score:0},{id:'shared43',shot,scaleBenefit:benefit,bodySideLoss:loss,score}];
  const selected=score>0?'shared43':'legacy';
  decisions.push({start:original.start,end:original.end,selected,reason:selected==='shared43'?'Scale benefit exceeds measured lateral body-box loss':'Measured lateral body loss outweighs scale benefit',intent:{kind:'two-face-body-anchors',trackIds:ids as string[],semanticVerification:'unknown',fullBodyRequirement:'unspecified'},candidates,handSampleCoverage:coverage,maxHandGap:Math.max(handTimes[0]-original.start,original.end-handTimes.at(-1)!,...handTimes.slice(1).map((t,i)=>t-handTimes[i]))});
  return selected==='shared43'?shot:original;
 });
 return{version:'shared-view-review-v1',shots,decisions};
}
