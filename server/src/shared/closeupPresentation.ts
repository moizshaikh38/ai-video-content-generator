import type {ReframeSample} from '../types/index.js';
/** A deliberate head-and-shoulders presentation, NOT a full-body-preservation
 * claim. Only a large, repeatedly visible single face with one associated
 * person. No identity, speech or object-importance inference. Full source
 * height remains; measured face, other faces/persons and explicit regions
 * must fit at every sample. Missing semantic context remains review-required. */
export function closeupPortraitPresentation(samples:ReframeSample[],start:number,end:number,w:number,h:number,regions:Array<{start:number;end:number;x:number;y:number;width:number;height:number;confidence:number}>=[],allowExistingExtremeCloseup=false){
 if(end-start<.75||samples.length<4||!(w>0&&h>0)||w/h<=9/16)return null;
 const portrait=(9/16)*h/w;
 const ids=new Set(samples.flatMap(s=>s.faces.map(f=>f.track_id)));
 if(ids.size!==1||ids.has(undefined))return null;
 const points:Array<{time:number;centerX:number;centerY:number}>=[];
 for(const s of samples){
  if(s.faces.length!==1)return null;const f=s.faces[0];
  if(![s.time,f.x,f.y,f.width,f.height,f.confidence].every(Number.isFinite)||f.x<0||f.y<0||f.x+f.width>1.001||f.y+f.height>1.001||f.confidence<.85||f.height<.28||(!allowExistingExtremeCloseup&&f.height>.55)||f.width<.1||f.width+2*.012>portrait)return null;
  const bodies=(s.persons||[]).filter(p=>p.confidence>=.4&&p.width*p.height>=.025);
  if(bodies.length!==1)return null;
  const body=bodies[0];if(f.center_x<body.x||f.center_x>body.x+body.width||f.center_y<body.y||f.center_y>body.y+body.height*.65)return null;
  const x=Math.max(portrait/2,Math.min(1-portrait/2,f.center_x));
  const rs=regions.filter(r=>r.confidence>=.7&&r.start<=s.time&&r.end>s.time);
  if(rs.some(r=>![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<x-portrait/2||r.x+r.width>x+portrait/2))return null;
  if(f.x-.012<x-portrait/2-1e-6||f.x+f.width+.012>x+portrait/2+1e-6)return null;
  const prev=points.at(-1);if(prev&&(s.time-prev.time>.5||Math.abs(x-prev.centerX)/(s.time-prev.time)>.35))return null;
  points.push({time:s.time,centerX:x,centerY:.5});
 }
 if(points[0].time-start>.3||end-points.at(-1)!.time>.3)return null;
 return {start,end,kind:'solo' as const,windowW:portrait,windowH:1,keyframes:points,
  contextStatus:'unresolved-review-required' as const,uncertainty:'Close-up portrait from one repeated large face. Head/shoulder presentation intentionally crops body sides; unseen objects and story context need review.'};
}
