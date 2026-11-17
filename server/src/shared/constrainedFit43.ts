import type{ReframeSample}from'../types/index.js';
export interface MeasuredFitRegion{x:number;y:number;width:number;height:number;confidence:number}
/** Recenter the widest full-height 4:3 source crop before resorting to a
 * source-aspect strip. Every sampled person/face and supplied region must fit.
 * This preserves measured geometry, not unseen context or narrative meaning. */
export function constrainedFit43(samples:ReframeSample[],regions:MeasuredFitRegion[],sourceW:number,sourceH:number,preferredX=.5){
 if(!(sourceW>0&&sourceH>0))return null;
 const width=(4/3)*sourceH/sourceW;if(!(width>0&&width<1))return null;
 const boxes=[...regions.filter(r=>r.confidence>=.7),...samples.flatMap(s=>[...s.faces.filter(f=>f.confidence>=.7),...(s.persons||[]).filter(p=>p.confidence>=.4)])];
 if(!boxes.length)return null;
 if(boxes.some(b=>![b.x,b.y,b.width,b.height,b.confidence].every(Number.isFinite)||b.x<0||b.y<0||b.width<=0||b.height<=0||b.x+b.width>1.001||b.y+b.height>1.001))return null;
 const left=Math.max(0,Math.min(...boxes.map(b=>b.x))-.012),right=Math.min(1,Math.max(...boxes.map(b=>b.x+b.width))+.012);
 const lo=Math.max(width/2,right-width/2),hi=Math.min(1-width/2,left+width/2);
 if(lo>hi+1e-9)return null;
 return{windowW:width,windowH:1,centerX:Math.max(lo,Math.min(hi,Number.isFinite(preferredX)?preferredX:.5)),centerY:.5};
}
