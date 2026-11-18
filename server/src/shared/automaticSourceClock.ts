/** Ordinary Auto plans use analysis-relative source seconds even after the
 * timeline item is trimmed or retimed. This does not enable a review candidate. */
export function usesAutomaticSourceClock(item:{crop_config?:{layout_mode_source?:string}|null}|undefined,candidate:boolean):boolean {
 return candidate || item?.crop_config?.layout_mode_source==='auto';
}
/** Bound a single item's input seek and output duration to its selected source
 * interval. Slowing playback expands output time, never the source interval. */
export function automaticSourceWindow(item:{source_start?:number;source_end?:number;speed?:{speed?:number}},clipStart:number,canvasDuration:number):{sourceStart:number;sourceDuration:number;outputDuration:number} {
 const speed=Math.min(4,Math.max(.25,item.speed?.speed||1));
 const sourceStart=Number.isFinite(item.source_start)?Number(item.source_start):clipStart;
 const declared=Number.isFinite(item.source_end)&&Number(item.source_end)>sourceStart?Number(item.source_end)-sourceStart:Infinity;
 const sourceDuration=Math.min(Math.max(.1,canvasDuration)*speed,declared);
 return{sourceStart,sourceDuration,outputDuration:sourceDuration/speed};
}
