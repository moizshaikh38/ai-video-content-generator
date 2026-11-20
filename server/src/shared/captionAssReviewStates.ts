/** Offline review support only, not a renderer or automatic placement path.
 * Finite constant ASS events can be measured once per active event-state.
 * Continuous transforms/fades/karaoke cannot be certified by midpoint samples.
 * Raw ASS text is data and is never evaluated or passed to a command shell. */
export interface CaptionAssReviewState {start:number;end:number;sampleTime:number}
export type CaptionAssReviewStates={status:'ready';states:CaptionAssReviewState[];coverage:'piecewise-static-events';rasterVerified:false}|{status:'unavailable';reason:string;rasterVerified:false};
const clock=(v:string):number|null=>{const m=/^(\d{1,3}):([0-5]\d):([0-5]\d)\.(\d{2})$/.exec(v.trim());return m?Number(m[1])*3600+Number(m[2])*60+Number(m[3])+Number(m[4])/100:null;};
export function captionAssReviewStates(ass:string,cue:{start:number;end:number},maxStates=80):CaptionAssReviewStates {
 const unavailable=(reason:string):CaptionAssReviewStates=>({status:'unavailable',reason,rasterVerified:false});
 if(typeof ass!=='string'||ass.length>262144||![cue?.start,cue?.end].every(Number.isFinite)||cue.start<0||cue.end<=cue.start||cue.end-cue.start>10||!Number.isSafeInteger(maxStates)||maxStates<1||maxStates>128)return unavailable('ASS review input exceeds the bounded cue/state budget.');
 const lines=ass.split(/\r?\n/);if(lines.length>5000)return unavailable('ASS review line budget exceeded.');
 let inEvents=false,format=false;const events:Array<{start:number;end:number}>=[];
 for(const line of lines){
  if(/^\[/.test(line)){inEvents=line.trim()==='[Events]';continue;}
  if(!inEvents)continue;
  if(line.startsWith('Format:')){format=line.replace(/\s/g,'')==='Format:Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text';if(!format)return unavailable('Unsupported ASS event format.');continue;}
  if(!line.startsWith('Dialogue:'))continue;
  if(!format)return unavailable('ASS dialogue precedes a supported event format.');
  const fields=line.slice(9).split(',');if(fields.length<10)return unavailable('Malformed ASS dialogue.');
  const start=clock(fields[1]),end=clock(fields[2]);if(start===null||end===null||end<=start)return unavailable('Invalid ASS dialogue clocks.');
  if(start>=cue.end||end<=cue.start)continue;
  if(fields[8].trim())return unavailable('ASS event effects are not certified by finite-state review.');
  const text=fields.slice(9).join(',');
  if(/\\(?:t\s*\(|move\s*\(|fad(?:e)?\s*\(|[kK](?:f|o|t)?\s*\d)/.test(text))return unavailable('Continuous ASS animation requires a separate conservative geometry bound.');
  events.push({start:Math.max(start,cue.start),end:Math.min(end,cue.end)});
 }
 if(!format||!events.length)return unavailable('No active supported ASS events for this cue.');
 const boundaries=[...new Set([cue.start,cue.end,...events.flatMap(e=>[e.start,e.end])])].sort((a,b)=>a-b),states:CaptionAssReviewState[]=[];
 for(let i=0;i<boundaries.length-1;i++){const start=boundaries[i],end=boundaries[i+1];if(end<=start||!events.some(e=>e.start<end&&e.end>start))continue;states.push({start,end,sampleTime:start+(end-start)/2});if(states.length>maxStates)return unavailable('Active ASS event-state budget exceeded.');}
 return {status:'ready',states,coverage:'piecewise-static-events',rasterVerified:false};
}
