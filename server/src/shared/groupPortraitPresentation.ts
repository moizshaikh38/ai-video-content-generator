import type{ReframeSample}from'../types/index.js';import{associatedBodyEnvelope}from'./bodyContext.js';
/** Full source height, portrait width, one locked view of a compact pair.
 * Every measured body and face must fit, including intermittent face samples.
 * Repeated face/body associations establish anchors, not speech or importance.
 * Missing side objects remain a review caveat; no invented safe-content claim. */
export function groupPortraitPresentation(samples:ReframeSample[],start:number,end:number,w:number,h:number,regions:Array<{start:number;end:number;x:number;y:number;width:number;height:number;confidence:number}>=[]){
 if(end-start<1||samples.length<6||w<=0||h<=0||w/h<=9/16)return null;
 const ids=[...new Set(samples.flatMap(s=>s.faces.map(f=>f.track_id).filter((x):x is string=>!!x)))];
 if(ids.length!==2||!associatedBodyEnvelope(samples,ids))return null;
 const width=9/16*h/w,lefts:number[]=[],rights:number[]=[];
 for(const s of samples){
  const bodies=(s.persons||[]).filter(p=>p.confidence>=.4&&p.height>=.3&&p.width>=.05);
  if(bodies.length<2||bodies.length>3)return null;
  for(const p of bodies){if(![p.x,p.y,p.width,p.height,p.confidence].every(Number.isFinite)||p.x<0||p.y<0||p.x+p.width>1.001||p.y+p.height>1.001)return null;lefts.push(p.x);rights.push(p.x+p.width);}
  for(const f of s.faces){if(![f.x,f.y,f.width,f.height,f.confidence].every(Number.isFinite)||f.confidence<.7)return null;lefts.push(Math.max(0,f.x-.015));rights.push(Math.min(1,f.x+f.width+.015));}
 }
 for(const r of regions.filter(r=>r.confidence>=.7&&r.start<end&&r.end>start)){if(![r.x,r.width].every(Number.isFinite))return null;lefts.push(r.x);rights.push(r.x+r.width);}
 const lo=Math.max(width/2,...rights.map(r=>r-width/2)),hi=Math.min(1-width/2,...lefts.map(l=>l+width/2));if(lo>hi)return null;
 const x=Math.max(lo,Math.min(hi,.5));
 return{start,end,kind:'group' as const,windowW:width,windowH:1,keyframes:[{time:start,centerX:x,centerY:.5}],contextStatus:'unresolved-review-required' as const,uncertainty:'Compact-pair portrait includes all observed face/person boxes at full source height. Detector misses and side objects remain unverified; review before sharing.'};
}
