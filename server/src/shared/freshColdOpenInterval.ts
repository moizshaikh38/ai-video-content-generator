/** Fresh initialization only. Historical centisecond producer durations may
 * differ from millisecond source endpoints by at most half a centisecond.
 * Source clocks own picture, captions and timeline. No clamping or retiming. */
export function freshColdOpenInterval(value:{enabled?:boolean;start_seconds:number;end_seconds:number;duration_seconds:number}|null|undefined,segments?:unknown):{start:number;end:number;duration:number}|undefined {
 if(!value?.enabled)return;
 const {start_seconds:a,end_seconds:b,duration_seconds:d}=value;
 const fail=()=>{throw Object.assign(new Error('Cold-open timing needs review before creating the editor. The teaser source interval and duration must agree.'),{code:'COLD_OPEN_TIMING_REVIEW_REQUIRED',statusCode:409});};
 if(![a,b,d].every(v=>typeof v==='number'&&Number.isFinite(v))||a<0||b<=a||d<=0) return fail();
 const start=Number(a.toFixed(3)),end=Number(b.toFixed(3)),duration=Number((end-start).toFixed(3));
 if(duration<=0||Math.abs(duration-d)>.005001)return fail();
 // This is interval provenance in the current source-bound transcript, not
 // a claim about decoded full-media duration or transcript accuracy.
 if(!Array.isArray(segments)||!segments.some(segment=>segment&&typeof segment.start==='number'&&typeof segment.end==='number'&&Number.isFinite(segment.start)&&Number.isFinite(segment.end)&&segment.start>=0&&segment.end>segment.start&&Number(segment.start.toFixed(3))===start&&Number(segment.end.toFixed(3))===end))return fail();
 return{start,end,duration};
}
