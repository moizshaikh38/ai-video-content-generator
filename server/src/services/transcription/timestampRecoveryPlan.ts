/** Short overlapping windows for an explicit timing-recovery attempt, not an automatic paid retry. */
export function planTimestampRecoveryChunks(totalSec:number) {
 if (!Number.isFinite(totalSec)||totalSec<=0||totalSec>60) throw new Error('Timestamp recovery requires a finite audio span of at most 60 seconds.');
 const count=Math.ceil(totalSec/8),span=totalSec/count;
 return Array.from({length:count},(_,index)=>{
  const ownStartSec=index*span,ownEndSec=index===count-1?totalSec:(index+1)*span;
  const startSec=Math.max(0,ownStartSec-(index?1:0));
  const endSec=Math.min(totalSec,ownEndSec+(index===count-1?0:1));
  return {index,startSec,durationSec:endSec-startSec,ownStartSec,ownEndSec};
 });
}
