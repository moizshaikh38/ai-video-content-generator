/** Manual tracking is evidence only between measured source-clock samples.
 * Never extrapolate the last box through an unobserved tail or across a loss. */
export function trackerEvidenceRange(tracker:any):{start:number;end:number}|null{
 if(!tracker?.enabled||!Array.isArray(tracker.keyframes)||!tracker.keyframes.length)return null;
 const ks=tracker.keyframes;if(ks.some((k:any)=>![k.time,k.centerX,k.centerY].every(Number.isFinite)))return null;
 if(ks.some((k:any,n:number)=>n>0&&k.time<=ks[n-1].time))return null;
 let start=ks[0].time,end=ks[ks.length-1].time;
 if(Number.isFinite(tracker.tracked_from))start=Math.max(start,tracker.tracked_from);
 if(Number.isFinite(tracker.tracked_to))end=Math.min(end,tracker.tracked_to);
 return end>start?{start,end}:null;
}
export function resolveTrackerEvidence<T extends object>(item:T,sourceTime:number):T{
 const i=item as any;if(!i.tracker?.enabled)return item;
 const r=trackerEvidenceRange(i.tracker);
 if(r&&sourceTime>=r.start&&sourceTime<=r.end)return item;
 const next={...i};delete next.tracker;return next;
}
