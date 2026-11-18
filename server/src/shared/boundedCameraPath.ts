export interface CameraPoint {time:number;centerX:number;centerY:number}
/** Retain endpoints and the worst interpolation error first. Null means this
 * measured path cannot fit the expression budget at the requested tolerance. */
export function boundedCameraPath(points:CameraPoint[],maxPoints=39,tolerance=.001):CameraPoint[]|null {
 if(!Number.isInteger(maxPoints)||maxPoints<2||!Number.isFinite(tolerance)||tolerance<0||points.some((p,i)=>![p.time,p.centerX,p.centerY].every(Number.isFinite)||(i>0&&p.time<=points[i-1].time)))return null;
 if(points.length<2)return points;
 const keep=new Set([0,points.length-1]);
 while(true){
  const ids=[...keep].sort((a,b)=>a-b);let worst=tolerance,chosen=-1;
  for(let n=0;n<ids.length-1;n++){
   const a=points[ids[n]],b=points[ids[n+1]];
   for(let i=ids[n]+1;i<ids[n+1];i++){
    const f=(points[i].time-a.time)/(b.time-a.time),error=Math.max(Math.abs(points[i].centerX-a.centerX-(b.centerX-a.centerX)*f),Math.abs(points[i].centerY-a.centerY-(b.centerY-a.centerY)*f));
    if(error>worst){worst=error;chosen=i;}
   }
  }
  if(chosen<0)return ids.map(i=>points[i]);
  if(keep.size>=maxPoints)return null;
  keep.add(chosen);
 }
}
