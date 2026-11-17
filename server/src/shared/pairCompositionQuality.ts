import type {ReframeSample}from'../types/index.js';
import{panelSourceWindow,type ItemPanels}from'./panelLayouts.js';
export interface PairCompositionPanelAudit {panel:number;samples:number;faceCenterMin:number;faceCenterMax:number;headroomMin:number;shoulderIntentCoverageMin:number;flags:Array<'off-center-face'|'tight-headroom'|'shoulder-intent-cropped'|'other-face-fragment'|'other-person-fragment'|'source-edge-shoulder-limit'|'insufficient-evidence'>}
/** Composition warning, not aesthetic/semantic ground truth. Shoulder intent
 * is a face-relative proposal envelope, not measured anatomy or a demand to
 * keep full arms/body. Do not call a no-warning result verified safe. */
export function auditPairComposition(panels:ItemPanels,samples:ReframeSample[],sourceW:number,sourceH:number):PairCompositionPanelAudit[]{
 if(panels.layout!=='split2'||!(sourceW>0&&sourceH>0))return [];
 return panels.slots.map((slot,index)=>{
  const r=panelSourceWindow(slot,sourceW,sourceH,9/8);const x=r.x/sourceW,y=r.y/sourceH,w=r.w/sourceW,h=r.h/sourceH;
  const centers:number[]=[],headrooms:number[]=[],coverage:number[]=[];let otherFragment=false,otherPersonFragment=false,sourceEdgeLimited=false;
  for(const s of samples){const faces=[...s.faces].sort((a,b)=>a.center_x-b.center_x);if(faces.length!==2)continue;const f=faces[index],other=faces[1-index];
   if(![f.x,f.y,f.width,f.height,f.center_x,other.x,other.width].every(Number.isFinite))continue;
   centers.push((f.center_x-x)/w);headrooms.push((f.y-y)/h);
   // Head/shoulder composition normally asks for room around a head. This
   // proxy explicitly reports its inferred nature; no body detection claim.
   const desiredLeft=f.center_x-1.5*f.width,desiredRight=f.center_x+1.5*f.width;
   if(desiredLeft<0||desiredRight>1)sourceEdgeLimited=true;
   const a=Math.max(0,desiredLeft),b=Math.min(1,desiredRight);
   coverage.push(Math.max(0,Math.min(x+w,b)-Math.max(x,a))/(b-a));
   const overlap=Math.max(0,Math.min(x+w,other.x+other.width)-Math.max(x,other.x));if(overlap>0&&overlap<other.width*.95)otherFragment=true;
   for(const body of s.persons||[]){
    if(body.confidence<.4||![body.x,body.y,body.width,body.height].every(Number.isFinite)||body.width<=0||body.height<=0)continue;
    // Only a body containing the other observed face, not arbitrary background.
    if(other.center_x<body.x||other.center_x>body.x+body.width||other.center_y<body.y||other.center_y>body.y+body.height*.65)continue;
    const vertical=Math.max(0,Math.min(y+h,body.y+body.height)-Math.max(y,body.y));
    const horizontal=Math.max(0,Math.min(x+w,body.x+body.width)-Math.max(x,body.x));
    if(vertical>h*.1&&horizontal>0&&horizontal/body.width<.25)otherPersonFragment=true;
   }
  }
  const flags:PairCompositionPanelAudit['flags']=[];const lo=centers.length?Math.min(...centers):0,hi=centers.length?Math.max(...centers):0,headroom=headrooms.length?Math.min(...headrooms):0,shoulder=coverage.length?Math.min(...coverage):0;
  if(centers.length&&(lo<.3||hi>.7))flags.push('off-center-face');if(headrooms.length&&headroom<.04)flags.push('tight-headroom');if(coverage.length&&shoulder<.9)flags.push('shoulder-intent-cropped');if(otherFragment)flags.push('other-face-fragment');if(otherPersonFragment)flags.push('other-person-fragment');if(sourceEdgeLimited)flags.push('source-edge-shoulder-limit');if(!centers.length)flags.push('insufficient-evidence');
  return {panel:index,samples:centers.length,faceCenterMin:lo,faceCenterMax:hi,headroomMin:headroom,shoulderIntentCoverageMin:shoulder,flags};
 });
}
