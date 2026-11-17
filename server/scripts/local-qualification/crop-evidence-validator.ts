/** Offline qualification only. Manual evidence is a diagnostic reference, not
 * automatic semantic evidence and must never be injected as production output.
 * Passing sampled geometry says nothing about unsampled/unannotated content. */
export type Rect={x:number;y:number;width:number;height:number};
export type CropKnot={time:number;rect:Rect};
export type Witness={time:number;regions:Array<{id:string;rect:Rect}>};
export type CropTrial={start:number;end:number;knots:CropKnot[];witnesses:Witness[];maxGap:number};
const valid=(r:Rect)=>r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=1.000001&&r.y+r.height<=1.000001;
export function cropAt(knots:CropKnot[],time:number):Rect{
 const b=knots.find(k=>k.time>=time)||knots[knots.length-1];
 const a=[...knots].reverse().find(k=>k.time<=time)||knots[0];
 const f=b.time>a.time?(time-a.time)/(b.time-a.time):0;
 return Object.fromEntries((['x','y','width','height'] as const).map(k=>[k,a.rect[k]+(b.rect[k]-a.rect[k])*f])) as Rect;
}
export function assessCrop(trial:CropTrial){
 const reasons:string[]=[];const violations:Array<{time:number;id:string;coverage:number;edgeLoss:number}>=[];
 const {start,end,knots,witnesses,maxGap}=trial;
 if(![start,end,maxGap].every(Number.isFinite)||end<=start||maxGap<=0)return {verdict:'invalid',reasons:['invalid time limits'],violations};
 if(!knots.length||!witnesses.length)return {verdict:'invalid',reasons:['missing crop or independent witnesses'],violations};
 if(knots.some((k,i)=>!valid(k.rect)||!Number.isFinite(k.time)||k.time<start||k.time>end||(i>0&&k.time<=knots[i-1].time)))return {verdict:'invalid',reasons:['malformed or unordered crop path'],violations};
 if(witnesses.some((w,i)=>!Number.isFinite(w.time)||w.time<start||w.time>end||!w.regions.length||w.regions.some(r=>!r.id||!valid(r.rect))||(i>0&&w.time<=witnesses[i-1].time)))return {verdict:'invalid',reasons:['malformed, empty or unordered witnesses'],violations};
 if(knots[0].time>start||knots.at(-1)!.time<end)reasons.push('crop does not span shot');
 if(witnesses[0].time-start>maxGap||end-witnesses.at(-1)!.time>maxGap)reasons.push('shot boundary evidence missing');
 if(witnesses.some((w,i)=>i>0&&w.time-witnesses[i-1].time>maxGap+1e-7))reasons.push('temporal evidence gap');
 for(const w of witnesses){const c=cropAt(knots,w.time);
  for(const {id,rect:r} of w.regions){
   const iw=Math.max(0,Math.min(c.x+c.width,r.x+r.width)-Math.max(c.x,r.x));
   const ih=Math.max(0,Math.min(c.y+c.height,r.y+r.height)-Math.max(c.y,r.y));
   const coverage=iw*ih/(r.width*r.height);
   const edgeLoss=Math.max(0,c.x-r.x,c.y-r.y,r.x+r.width-c.x-c.width,r.y+r.height-c.y-c.height);
   // Full per-region retention, not aggregate image coverage. A tiny overlay
   // can be completely lost while >99% of the total image remains intact.
   if(edgeLoss>1e-6)violations.push({time:w.time,id,coverage,edgeLoss});
  }
 }
 if(violations.length)reasons.push('protected region clipped');
 return {verdict:reasons.length?'rejected':'sampled-geometry-only',reasons,violations};
}
