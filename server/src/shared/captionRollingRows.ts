/** Independent timed rolling-row primitive. No third-party code/assets or layout inference.
 * A caller supplies already bounded row chunks belonging to ONE input cue. It must not
 * combine chunks across manual positions, scenes, layout or preset metadata boundaries. */
export interface CaptionRowChunk { id:string; text:string; start:number; end:number }
export interface CaptionRollingRow {
  chunkId:string; text:string; row:0|1; phase:'steady'|'outgoing'|'incoming';
  opacity:number; offsetY:number;
}
export interface CaptionRollingRowOptions { transitionMs:number; travel:number }
const DEFAULT_OPTIONS:CaptionRollingRowOptions={transitionMs:160,travel:28};

/** Pure seekable state, no clock/DOM/font assumptions. First two chunks seed both rows.
 * Each later chunk replaces the row two positions before it, leaving the other row alone.
 * Chunk ends validate source slices; displayed rows persist to replacement/cue end.
 * Equal-time replacements choose the latest sequence entry.
 * All output stops at cue end. Invalid/out-of-cue chunks are discarded or clamped. */
export function getCaptionRollingRows(
  chunks:readonly CaptionRowChunk[],time:number,cueStart:number,cueEnd:number,
  options:Partial<CaptionRollingRowOptions>={}
):CaptionRollingRow[] {
  if(!Number.isFinite(time)||!Number.isFinite(cueStart)||!Number.isFinite(cueEnd)||cueEnd<=cueStart||time<cueStart||time>=cueEnd)return [];
  const transition=Number.isFinite(options.transitionMs)?Math.min(500,Math.max(20,options.transitionMs!))/1000:DEFAULT_OPTIONS.transitionMs/1000;
  const travel=Number.isFinite(options.travel)?Math.min(100,Math.max(0,options.travel!)):DEFAULT_OPTIONS.travel;
  const valid=chunks.map((chunk,index)=>({...chunk,index,start:Math.max(cueStart,chunk.start),end:Math.min(cueEnd,chunk.end)}))
    .filter(c=>typeof c.text==='string'&&c.text.trim()&&Number.isFinite(c.start)&&Number.isFinite(c.end)&&c.start<cueEnd&&c.end>c.start)
    .sort((a,b)=>a.start-b.start||a.index-b.index).slice(0,120);
  if(!valid.length)return [];
  const tick=Number(time.toFixed(2));
  const output:CaptionRollingRow[]=[];
  for(const row of[0,1]as const){
    const sequence=valid.filter((_c,i)=>i%2===row);if(!sequence.length)continue;
    // Seed rows together from cue start, by design. This is caller-controlled preview text,
    // never synthesized word timing. Segment-only sources should not call this function.
    let current=0;
    for(let i=1;i<sequence.length;i++)if(tick>=Number(sequence[i].start.toFixed(2)))current=i;
    const chunk=sequence[current];
    const start=Number(chunk.start.toFixed(2));
    const nextStart=sequence[current+1]?.start??cueEnd;
    const duration=Math.max(.01,Math.min(transition,nextStart-start,cueEnd-start));
    const elapsed=Math.floor((tick-start)*50+1e-7)/50;
    if(current>0&&elapsed>=0&&elapsed<duration){
      const progress=Math.max(0,Math.min(1,elapsed/duration));
      const outgoing=sequence[current-1];
      output.push({chunkId:outgoing.id,text:outgoing.text,row,phase:'outgoing',opacity:1-progress,offsetY:-travel*progress});
      output.push({chunkId:chunk.id,text:chunk.text,row,phase:'incoming',opacity:progress,offsetY:travel*(1-progress)});
    }else output.push({chunkId:chunk.id,text:chunk.text,row,phase:'steady',opacity:1,offsetY:0});
  }
  return output;
}
