/** Original deterministic cue stamp. No CSS keyframes or wall-clock state. */
export interface CaptionStampMotion { scale:number; rotation:number; opacity:number }
export function getCaptionStampMotion(start:number,end:number,time:number):CaptionStampMotion {
 if(![start,end,time].every(Number.isFinite)||end<=start||time<start||time>=end)return {scale:1,rotation:0,opacity:0};
 const elapsed=Math.floor((Number(time.toFixed(2))-Number(start.toFixed(2))+1e-6)*50)*20;
 const duration=Math.min(240,(end-start)*600),p=Math.max(0,Math.min(1,elapsed/Math.max(1,duration)));
 const blend=(a:number,b:number,t:number)=>a+(b-a)*t;
 const scale=p<.5?blend(.76,1.06,1-Math.pow(1-p*2,2)):blend(1.06,1,(p-.5)*2);
 const rotation=p<.5?blend(-8,1.5,p*2):blend(1.5,0,(p-.5)*2);
 return {scale:Number(scale.toFixed(3)),rotation:Number(rotation.toFixed(3)),opacity:Math.min(1,p*6)};
}
