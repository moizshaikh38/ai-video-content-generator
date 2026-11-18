import type {ReframeSample} from '../types/index.js';

/** Review-only full-height moving window from complete sampled single-body
 * evidence. Does not identify a person or judge the importance of side content.
 * Kept separate from the older static, tall-body proposal. */
export function movingBodyPortraitProposal(samples:ReframeSample[],start:number,end:number,w:number,h:number,regions:Array<{start:number;end:number;x:number;y:number;width:number;height:number;confidence:number}>=[]) {
 if(![start,end,w,h].every(Number.isFinite)||end-start<1||samples.length<4||h<=0||w<=h)return null;
 const width=(9/16)*h/w, margin=.02;
 if(regions.some(r=>![r.start,r.end,r.x,r.y,r.width,r.height,r.confidence].every(Number.isFinite)))return null;
 const active=regions.filter(r=>r.start<end&&r.end>start&&r.confidence>=.7);
 if(active.some(r=>![r.start,r.end,r.x,r.y,r.width,r.height,r.confidence].every(Number.isFinite)||r.end<=r.start||r.x<0||r.y<0||r.width<=0||r.height<=0||r.x+r.width>1||r.y+r.height>1))return null;
 const points:Array<{time:number;centerX:number;centerY:number}>=[];
 let lastBodyCenter:number|undefined;
 for(let i=0;i<samples.length;i++) {
  const s=samples[i],previous=samples[i-1],dt=previous?s.time-previous.time:0;
  if(!Number.isFinite(s.time)||s.time<start||s.time>=end||(previous&&(dt<=0||dt>.35))||s.persons?.length!==1||s.faces.length>1)return null;
  const p=s.persons[0];
  if(![p.x,p.y,p.width,p.height,p.confidence].every(Number.isFinite)||p.x<0||p.y<0||p.width<=0||p.height<.35||p.height>1||p.x+p.width>1||p.y+p.height>1.001||p.confidence<.4||p.confidence>1||p.width+2*margin>width)return null;
  const bodyCenter=p.x+p.width/2;
  if(lastBodyCenter!==undefined&&Math.abs(bodyCenter-lastBodyCenter)/dt>.2)return null;
  if(s.faces.some(f=>![f.x,f.y,f.width,f.height,f.center_x,f.confidence].every(Number.isFinite)||f.x<0||f.y<0||f.width<=0||f.height<=0||f.x+f.width>1||f.y+f.height>1.001||f.center_x<p.x||f.center_x>p.x+p.width))return null;
  // All supplied shot-local protected regions constrain the whole path. This
  // conservative union cannot lose a short region between detector samples.
  const left=Math.max(0,Math.min(p.x-margin,...s.faces.map(f=>f.x-.012),...active.map(r=>r.x-.015)));
  const right=Math.min(1,Math.max(p.x+p.width+margin,...s.faces.map(f=>f.x+f.width+.012),...active.map(r=>r.x+r.width+.015)));
  const low=Math.max(width/2,right-width/2),high=Math.min(1-width/2,left+width/2);
  if(low>high)return null;
  const last=points.at(-1);
  // A small center deadband avoids chasing detector noise without letting a
  // measured person drift all the way to the crop edge. No size/zoom change.
  const held=last?.centerX??bodyCenter,delta=bodyCenter-held;
  const target=Math.abs(delta)>.025?bodyCenter-Math.sign(delta)*.025:held;
  const centerX=Math.max(low,Math.min(high,target));
  if(last&&Math.abs(centerX-last.centerX)/dt>.2)return null;
  points.push({time:s.time,centerX,centerY:.5});lastBodyCenter=bodyCenter;
 }
 if(points[0].time-start>.3||end-points.at(-1)!.time>.3)return null;
 if(points[0].time>start)points.unshift({...points[0],time:start});
 if(points.length>400)return null;
 return {start,end,kind:'solo' as const,windowW:width,windowH:1,keyframes:points,contextStatus:'unresolved-review-required' as const,uncertainty:'Moving single-body detector proposal at full source height. Sampled lateral boxes are retained, not independently verified identity or full-body truth. Undetected side content and between-sample motion need review.'};
}
