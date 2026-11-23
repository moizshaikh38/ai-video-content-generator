import {adaptPunchInToWordTimings} from '../utils/punchInTiming.js';
/** Producer operations carry absolute source seconds; editor keyframes are
 * item-local. Never clamp an excluded source event onto unrelated footage. */
export function producerItemPunch(item:{source_start:number;source_end:number},parameters:{punch_in_start_sec?:number;punch_in_duration_sec?:number;scale?:number},words:Array<{start:number;end:number}>){
 const at=parameters.punch_in_start_sec;
 if(typeof at!=='number'||!Number.isFinite(at)||at<item.source_start||at>=item.source_end)return {suppressed:true as const,reason:'outside-main-source'};
 const localWords=words.filter(w=>w.start>=item.source_start&&w.end<=item.source_end).map(w=>({start:w.start-item.source_start,end:w.end-item.source_start}));
 const result=adaptPunchInToWordTimings({startSec:at-item.source_start,durationSec:parameters.punch_in_duration_sec||2.5,scale:parameters.scale||1.06},localWords);
 if(result.suppressed)return result;
 if(result.startSec<0||result.startSec>=item.source_end-item.source_start)return {suppressed:true as const,reason:'outside-main-source'};
 return result;
}
