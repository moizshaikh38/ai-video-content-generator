/** Metadata coverage bound for one unambiguous moving-picture stream. Container
 * duration can be extended by audio, so it never proves the visual tail. */
export function measuredMultimodalDuration(probe:any):number {
 const unavailable=()=>Object.assign(Error('Multimodal moving-picture duration could not be measured unambiguously.'),{code:'MULTIMODAL_SOURCE_DURATION_UNAVAILABLE'});
 const streams=Array.isArray(probe?.streams)?probe.streams:[];
 const videos=streams.filter((s:any)=>s?.codec_type==='video');
 if(videos.length!==1||videos[0].disposition?.attached_pic!==0)throw unavailable();
 const v=videos[0];
 const finite=(value:unknown):number|null=>{if(typeof value!=='string'&&typeof value!=='number')return null;const n=Number(value);return Number.isFinite(n)&&n>0?n:null;};
 const duration=finite(v.duration);
 if(duration!==null)return duration;
 // Exact stream tick duration is metadata, not a frame-count/fps estimate.
 const ticks=finite(v.duration_ts),parts=typeof v.time_base==='string'?v.time_base.split('/'):[];
 const numerator=finite(parts[0]),denominator=finite(parts[1]);
 if(ticks!==null&&parts.length===2&&numerator!==null&&denominator!==null){const seconds=ticks*numerator/denominator;if(Number.isFinite(seconds)&&seconds>0)return seconds;}
 // Matroska/WebM muxers store a per-stream end timestamp in DURATION.
 // Subtract that VIDEO stream's start, never the longer audio/container end.
 const formats=typeof probe?.format?.format_name==='string'?probe.format.format_name.split(','):[];
 const tag=typeof v.tags?.DURATION==='string'?v.tags.DURATION:null;
 if(formats.some((f:string)=>f==='matroska'||f==='webm')&&tag){
  const match=tag.match(/^(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)$/);
  const start=typeof v.start_time==='string'||typeof v.start_time==='number'?Number(v.start_time):NaN;
  if(match&&Number.isFinite(start)){const end=Number(match[1])*3600+Number(match[2])*60+Number(match[3]),seconds=end-start;if(Number.isFinite(seconds)&&seconds>0)return seconds;}
 }
 throw unavailable();
}
