import type {ReframeSample} from '../types/index.js';
import type {ItemPanels} from './panelLayouts.js';
import {pairFocusPresentation} from './pairFocusPresentation.js';
import {auditPairComposition,type PairCompositionPanelAudit} from './pairCompositionQuality.js';
const blocking=new Set(['off-center-face','tight-headroom','shoulder-intent-cropped','other-face-fragment','other-person-fragment','insufficient-evidence']);
const clean=(a:PairCompositionPanelAudit)=>a.samples>0&&!a.flags.some(f=>blocking.has(f));
/** Offline review search. Uses the same evidence/quality vetoes as pair focus.
 * Smaller views can omit arms/action: this is never semantic safety proof. */
export function boundedPairComposition(samples:ReframeSample[],start:number,end:number,w:number,h:number):{panels:ItemPanels;audit:PairCompositionPanelAudit[];changed:boolean}|null {
 const proposal=pairFocusPresentation(samples,start,end,w,h);if(!proposal)return null;
 const initial=auditPairComposition(proposal.panels,samples,w,h);if(initial.every(clean))return {panels:proposal.panels,audit:initial,changed:false};
 const panels:ItemPanels={...proposal.panels,slots:proposal.panels.slots.map(s=>({...s}))};
 for(let i=0;i<2;i++){
  if(clean(initial[i]))continue;
  const original=proposal.panels.slots[i].sourceRect!;
  const faces=samples.map(s=>[...s.faces].sort((a,b)=>a.center_x-b.center_x)[i]);
  let found=false;
  // Fixed general search order: largest view first, then least center shift.
  for(let step=0;step<=16&&!found;step++){
   const height=original.h*(1-step*.025),width=height*(9/8)*h/w;
   const mean=faces.reduce((n,f)=>n+f.center_x,0)/faces.length;
   for(const shift of[0,-.025,.025,-.05,.05,-.075,.075,-.1,.1]){
    const x=Math.max(0,Math.min(1-width,mean-width/2+width*shift));
    panels.slots[i]={...panels.slots[i],sourceRect:{x,y:original.y,w:width,h:height}};
    const a=auditPairComposition(panels,samples,w,h)[i];
    if(clean(a)){found=true;break;}
   }
  }
  if(!found)return null;
 }
 const audit=auditPairComposition(panels,samples,w,h);return audit.every(clean)?{panels,audit,changed:true}:null;
}
