import {materializeNumericPanels,numericPanelLayers,numericPanelsFilter} from './numericPanelGeometry.js';
import {acceptCompositionProposal,type CompositionContext,type CompositionCurrentState,type CompositionRole,type CompositionDecision} from './compositionProposalContract.js';
import type {PanelRect} from './panelLayouts.js';

export interface CompositionReviewPanel {
 role:CompositionRole;target:PanelRect;view:PanelRect;
 foreground:{width:number;height:number;x:number;y:number};
 backdrop?:{view:PanelRect;blurRadius:number};
}
export interface CompositionReviewRenderPlan {
 version:1;kind:'local-unverified-proposal-review';allowedToApply:false;
 requestKey:string;editRevision:string;source:CompositionContext['source'];output:CompositionContext['output'];
 sampleReceipts:CompositionContext['samples'];postTransformsAllowed:false;
 panels:CompositionReviewPanel[];limitations:string[];
}
const clone=(r:PanelRect):PanelRect=>({x:r.x,y:r.y,w:r.w,h:r.h});
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const inside=(a:PanelRect,b:PanelRect)=>b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w&&b.y+b.h<=a.y+a.h;
/** Compile a validated proposal into one explicit pixel plan for BOTH preview
 * and local review export. No ItemPanels normalization or hidden seam fallback.
 * The export input must already be the bound source interval. */
export function buildCompositionReviewPlan(c:CompositionContext,raw:unknown,current:CompositionCurrentState):
 {decision:CompositionDecision;plan?:CompositionReviewRenderPlan;reason?:string}{
 const decision=acceptCompositionProposal(c,raw,current);
 if(decision.status!=='candidate')return{decision};
 if(c.source.width%2||c.source.height%2)return{decision,reason:'odd-source-size-not-qualified'};
 const inputs=decision.panels.map((p,i)=>{
  const choice=decision.choice.panels[i];
  const base=choice.fit==='contain'?clone(p.visibleSourcePixels):(()=>{
   const r=p.sourceRect,ev=(v:number)=>Math.round(v/2)*2;
   const w=Math.min(c.source.width,Math.max(2,ev(c.source.width*r.w))),h=Math.min(c.source.height,Math.max(2,ev(c.source.height*r.h)));
   return{x:Math.min(c.source.width-w,Math.max(0,ev(c.source.width*r.x))),y:Math.min(c.source.height-h,Math.max(0,ev(c.source.height*r.y))),w,h};
  })();
  return{target:clone(p.targetPixels),base,fit:choice.fit,scale:choice.scale,focusX:choice.focusX,focusY:choice.focusY,backdrop:'blur' as const};
 });
 const numeric=materializeNumericPanels(c.source,c.output,inputs);
 if(!numeric)return{decision,reason:'invalid-materialized-pixel-plan'};
 const panels=numeric.panels.map((p,i)=>({...p,role:decision.panels[i].role}));
 const protectedRects=[...c.requiredRegions.map(r=>r.rect),...decision.keepVisible.filter(r=>r.importance==='critical').map(r=>r.rect)];
 if(protectedRects.some(r=>!panels.some(p=>inside(p.view,{x:r.x*c.source.width,y:r.y*c.source.height,w:r.w*c.source.width,h:r.h*c.source.height}))))return{decision,reason:'critical-region-lost-after-pixel-rounding'};
 const plan:CompositionReviewRenderPlan={version:1,kind:'local-unverified-proposal-review',allowedToApply:false,requestKey:decision.requestKey,editRevision:decision.editRevision,source:{...decision.source},output:{...decision.output},sampleReceipts:decision.samples.map(v=>({...v})),postTransformsAllowed:false,panels,limitations:[...decision.limitations,'local-review-only-not-a-model-or-release-receipt','even-pixel-source-and-foreground-rounding-explicit','preview-background-blur-kernel-differs-from-export']};
 if(!validPlan(plan))return{decision,reason:'invalid-materialized-pixel-plan'};
 return{decision,plan:freeze(plan)};
}
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const pixel=(n:unknown)=>finite(n)&&Number.isInteger(n)&&n%2===0;
function validPlan(p:CompositionReviewRenderPlan):boolean{
 try{
  if(!p||p.version!==1||p.kind!=='local-unverified-proposal-review'||p.allowedToApply!==false||!p.source||!p.output||!Number.isFinite(p.source.start)||!Number.isFinite(p.source.end)||p.source.end<=p.source.start||!/^[a-f0-9]{64}$/.test(p.source.sha256)||![p.source.width,p.source.height,p.output.width,p.output.height].every(v=>pixel(v)&&v>=2&&v<=4096)||!Array.isArray(p.panels)||![1,2].includes(p.panels.length))return false;
  if(p.postTransformsAllowed!==false||!Array.isArray(p.sampleReceipts)||p.sampleReceipts.length!==5||p.sampleReceipts.some((s,i)=>!s||!Number.isFinite(s.time)||s.time<0||s.time>=p.source.end-p.source.start||!/^[a-f0-9]{64}$/.test(s.imageSha256)||(i>0&&s.time<=p.sampleReceipts[i-1].time)))return false;
  let bottom=0;
  for(const q of p.panels){
   const t=q.target,v=q.view,f=q.foreground;
   if(!t||!v||!f||![t.x,t.y,t.w,t.h,v.x,v.y,v.w,v.h,f.width,f.height,f.x,f.y].every(pixel)||t.x!==0||t.y!==bottom||t.w!==p.output.width||t.h<2||v.x<0||v.y<0||v.w<2||v.h<2||v.x+v.w>p.source.width||v.y+v.h>p.source.height||f.width<2||f.height<2||f.x<0||f.y<0||f.x+f.width>t.w||f.y+f.height>t.h)return false;
   if(q.backdrop){const b=q.backdrop.view,r=q.backdrop.blurRadius;if(!b||![b.x,b.y,b.w,b.h].every(pixel)||b.x<0||b.y<0||b.w<2||b.h<2||b.x+b.w>p.source.width||b.y+b.h>p.source.height||!Number.isInteger(r)||r<1||r>=Math.min(t.w,t.h)/2)return false;}
   else if(f.width!==t.w||f.height!==t.h||f.x!==0||f.y!==0)return false;
   bottom+=t.h;
  }
  return bottom===p.output.height;
 }catch{return false;}
}
/** Shared foreground placement from explicit source pixels, scaled to the
 * preview box. It uses separate X/Y scales to match the explicit FFmpeg resize.
 * Clip paths stop neighboring source pixels leaking into contain foreground. */
export function compositionPreviewLayers(p:CompositionReviewRenderPlan,width:number,height:number):Array<{
 target:{left:number;top:number;width:number;height:number};
 foreground:{left:number;top:number;width:number;height:number;clipPath:string};
 backdrop?:{left:number;top:number;width:number;height:number;clipPath:string;blurRadius:number};
}>|undefined{
 if(!validPlan(p)||!finite(width)||!finite(height)||width<=0||height<=0)return;
 return numericPanelLayers(p,width,height);

}
/** Numeric-only graph. No model text, URL, command or arbitrary filter survives.
 * Caller supplies the already-trimmed source interval as video input 0 and maps
 * outputLabel. Audio/captions are not rewritten or fabricated by this adapter. */
export function buildCompositionReviewFilter(p:CompositionReviewRenderPlan,tag='vcr'):{filter:string;outputLabel:string}|undefined{
 if(!validPlan(p)||!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(tag))return;
 const fragment=numericPanelsFilter(p,tag);if(!fragment)return;
 const outputLabel=`${tag}_out`;
 return{filter:`[0:v]setpts=PTS-STARTPTS,${fragment}[${outputLabel}]`,outputLabel};

}

/** Existing applySceneCaptionPlacement accepts these explicit automatic windows.
 * This supplies its third-consumer geometry without asking the old panel-size
 * normalizer again. Cue clocks/style/words stay unchanged; explicit user caption
 * positions still win in that existing consumer. Only a clean, one-window local
 * review is supported here, not edited/speed/freeze/cut item mapping. */
export function compositionReviewCaptionWindows(p:CompositionReviewRenderPlan,itemId='quick-source'):Array<{itemId:string;start:number;end:number;layout:'panel_gameplay'|'fit'|'fill';anchorY:number}>|undefined{
 if(!validPlan(p)||!/^[A-Za-z0-9_-]{1,96}$/.test(itemId))return;
 const q=p.panels[0],contained=!!q.backdrop;
 const layout=p.panels.length===2?'panel_gameplay':contained?'fit':'fill';
 const anchorY=p.panels.length===2?q.target.h/p.output.height:contained?Math.min(585/720,(q.foreground.y+q.foreground.height)/p.output.height):585/720;
 return[{itemId,start:0,end:p.source.end-p.source.start,layout,anchorY}];
}
