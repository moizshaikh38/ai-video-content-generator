/** Split a constant-speed media item's source clock without changing its
 * selected source interval or playback rate. Timeline seconds are not source
 * seconds. Unknown/nonlinear clocks need a separate edit, never a guessed cut. */
export function constantSpeedSourceSplit(item:{source_start:number;source_end:number;timeline_start:number;timeline_end:number;speed?:{speed?:number;speed_ramp?:unknown};is_freeze?:boolean;is_title_card?:boolean},time:number):number|undefined {
 const speed=item.speed?.speed??1;
 if(item.speed?.speed_ramp||item.is_freeze||item.is_title_card||![item.source_start,item.source_end,item.timeline_start,item.timeline_end,time,speed].every(Number.isFinite)||speed<=0||item.source_start<0||item.source_end<=item.source_start||item.timeline_end<=item.timeline_start||time<=item.timeline_start||time>=item.timeline_end)return;
 const split=Number((item.source_start+(time-item.timeline_start)*speed).toFixed(3));
 return split>item.source_start&&split<item.source_end?split:undefined;
}
