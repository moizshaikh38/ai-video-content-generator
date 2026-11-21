/** The base timeline uses only the first visible VIDEO track. Other video
 * tracks are overlays, not additional cuts. Keep orchestration and compilation
 * on this same selection so hidden cuts/B-roll cannot disable input seeking. */
export function primaryVisibleVideoItems<T extends {hidden?:boolean;timeline_start:number}>(
  project:{tracks:Array<{type:string;hidden?:boolean;items:T[]}>}
):T[]{
  const track=project.tracks.find(t=>t.type==='VIDEO'&&!t.hidden);
  return (track?.items||[]).filter(i=>!i.hidden).sort((a,b)=>a.timeline_start-b.timeline_start);
}

/** Generated base items need absolute source coordinates and synthesized audio
 * even when the timeline contains only one item. An ordinary item placed after
 * timeline zero, or ending before the canvas, also needs slice-local padding
 * rather than input-seek playback. */
export function usesGeneratedSliceGraph(items:ReadonlyArray<{is_freeze?:boolean;is_title_card?:boolean;timeline_start?:number;timeline_end?:number}>,canvasDuration?:number):boolean {
 return items.length>1 || items.some(i=>Boolean(i.is_freeze||i.is_title_card)) || (items[0]?.timeline_start??0)>0 || (canvasDuration!==undefined && items.length>0 && (items[items.length-1].timeline_end??canvasDuration)<canvasDuration-0.000001);
}
