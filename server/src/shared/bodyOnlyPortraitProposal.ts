import type{ReframeSample}from'../types/index.js';
/** Developmental incomplete-evidence proposal, not identity or safety proof.
 * Tall, narrow, repeatedly measured body boxes can propose a full-source-height
 * view without waiting for a frontal face. Missing detections remain unknown. */
export function bodyOnlyPortraitProposal(samples:ReframeSample[],start:number,end:number,w:number,h:number,regions:Array<{start:number;end:number;x:number;y:number;width:number;height:number;confidence:number}>=[]){
 if(![start,end,w,h].every(Number.isFinite)||end-start<1||samples.length<4||w<=h||h<=0)return null;
 const ss=[...samples].sort((a,b)=>a.time-b.time),seen:Array<{time:number;left:number;right:number;cx:number}>=[];
 const portrait=(9/16)*h/w;
 if(ss.some((s,i)=>!Number.isFinite(s.time)||i>0&&s.time<=ss[i-1].time))return null;
 for(const s of ss){if(!Number.isFinite(s.time)||s.faces.length>1)return null;
  const ps=(s.persons||[]).filter(p=>p.confidence>=.4);
  if(ps.length>1)return null;if(!ps.length)continue;const p=ps[0];
  if(![p.x,p.y,p.width,p.height,p.confidence].every(Number.isFinite)||p.x<0||p.y<0||p.width<=0||p.height<.8||p.x+p.width>1.001||p.y+p.height>1.001||p.width+.03>portrait)return null;
  if(s.faces.some(f=>!Number.isFinite(f.center_x)||f.center_x<p.x||f.center_x>p.x+p.width))return null;
  const prev=seen.at(-1);if(prev&&(s.time<=prev.time||s.time-prev.time>.75||Math.abs(p.x+p.width/2-prev.cx)>.06))return null;
  seen.push({time:s.time,left:p.x-.015,right:p.x+p.width+.015,cx:p.x+p.width/2});
 }
 if(seen.length<3||seen.length<ss.length*.6||seen[0].time-start>.3||end-seen.at(-1)!.time>.3)return null;
 const lo=Math.max(portrait/2,...seen.map(p=>p.right-portrait/2)),hi=Math.min(1-portrait/2,...seen.map(p=>p.left+portrait/2));if(lo>hi)return null;
 const cx=Math.max(lo,Math.min(hi,.5));
 if(ss.some(s=>s.faces.some(f=>![f.x,f.width].every(Number.isFinite)||f.x-.01<cx-portrait/2||f.x+f.width+.01>cx+portrait/2)))return null;
 if(regions.some(r=>r.confidence>=.7&&r.start<end&&r.end>start&&(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.x<cx-portrait/2||r.x+r.width>cx+portrait/2)))return null;
 return {start,end,kind:'solo' as const,windowW:portrait,windowH:1,keyframes:[{time:start,centerX:cx,centerY:.5}],contextStatus:'unresolved-review-required' as const,uncertainty:'Incomplete body-only detector proposal at full source height. Undetected people, objects and motion between samples remain unverified.'};
}
