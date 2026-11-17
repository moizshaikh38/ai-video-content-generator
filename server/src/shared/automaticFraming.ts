/** Preserve shot layout/size, freeze only automatic movement. Manual channels
 * are separate and keep their existing precedence. Times are source seconds. */
export interface AutomaticFramingState { enabled:boolean; freeze_source_time?:number }
export function freezeAutomaticPlan<T extends {start:number;end:number;keyframes:Array<{time:number;centerX:number;centerY:number}>}>(plan:T[],state:AutomaticFramingState|undefined,clipStart:number):T[]{
 if(state?.enabled!==false)return plan;
 const t=Number(state.freeze_source_time)-clipStart;
 return plan.map(s=>{
  if(!s.keyframes.length)return s;
  const time=Math.max(s.start,Math.min(s.end,Number.isFinite(t)?t:s.start));
  let n=0;while(n+1<s.keyframes.length&&s.keyframes[n+1].time<=time)n++;
  const a=s.keyframes[n],b=s.keyframes[Math.min(n+1,s.keyframes.length-1)];
  const f=b.time>a.time?Math.max(0,Math.min(1,(time-a.time)/(b.time-a.time))):0;
  return {...s,keyframes:[{time:s.start,centerX:a.centerX+(b.centerX-a.centerX)*f,centerY:a.centerY+(b.centerY-a.centerY)*f}]};
 });
}
