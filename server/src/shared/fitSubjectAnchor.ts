/** Narrow, static shot-local correction for an explicitly selected4:3Fit.
 * Keep every repeatedly observed face inside when geometrically possible.
 * This neither chooses a speaker nor establishes semantic scene importance. */
export function anchorFitToMeasuredFaces<T extends {start:number;end:number;windowW:number;windowH:number;split?:unknown;keyframes:Array<{time:number;centerX:number;centerY:number}>;uncertainty?:string}>(shots:T[],samples:any[],sourceW:number,sourceH:number,preserveRepeatedFaceConflict=false):T[]{
 return shots.map(shot=>{
  if(shot.split||shot.keyframes.length!==1||![shot.windowW,shot.windowH,sourceW,sourceH].every(Number.isFinite)||shot.windowW<=0||shot.windowH<=0||sourceW<=0||sourceH<=0||Math.abs(shot.windowW*sourceW/(shot.windowH*sourceH)-4/3)>.005)return shot;
  const rows=samples.filter(s=>s.time>=shot.start&&s.time<shot.end),counts=new Map<string,number>();
  const valid=(f:any)=>f&&typeof f.track_id==='string'&&[f.x,f.y,f.width,f.height,f.confidence].every(Number.isFinite)&&f.x>=0&&f.y>=0&&f.width>0&&f.height>0&&f.x+f.width<=1&&f.y+f.height<=1&&f.width*f.height>=.002&&f.confidence>=.8;
  for(const row of rows)for(const id of new Set((row.faces||[]).filter(valid).map((f:any)=>f.track_id)))counts.set(id as string,(counts.get(id as string)||0)+1);
  const faces=rows.flatMap(s=>(s.faces||[]).filter((f:any)=>valid(f)&&(counts.get(f.track_id)||0)>=Math.max(2,rows.length*.35)));
  if(!faces.length)return shot;
  const left=Math.max(0,Math.min(...faces.map(f=>f.x))-.025),right=Math.min(1,Math.max(...faces.map(f=>f.x+f.width))+.025),width=shot.windowW;
  const low=Math.max(width/2,right-width/2),high=Math.min(1-width/2,left+width/2);
  // Conflicting subjects do not authorize dropping one or changing crop size.
  if(low>high){
   // Developmental review option only. Do not silently choose which of two
   // persistently measured faces to cut when a 4:3 window is infeasible.
   if(!preserveRepeatedFaceConflict||new Set(faces.map(f=>f.track_id)).size!==2)return shot;
   return {...shot,presentationProtection:{preserveWindow:true as const,reason:'persistent-face-conflict' as const},windowW:1,windowH:1,contextStatus:'unresolved-review-required',uncertainty:'Full-source Fit: two persistent measured faces cannot fit the preferred 4:3 window together. Bodies, objects and scene meaning remain unverified.',keyframes:[{time:shot.start,centerX:.5,centerY:.5}]};
  }
  const old=shot.keyframes[0].centerX,cx=Math.max(low,Math.min(high,old));
  if(!Number.isFinite(old)||Math.abs(cx-old)<1e-7)return shot;
  return {...shot,keyframes:[{...shot.keyframes[0],centerX:cx}],uncertainty:(shot.uncertainty||'Review4:3Fit.')+' Anchored to repeated face evidence. Side text, bodies and other action are not verified.'};
 });
}
