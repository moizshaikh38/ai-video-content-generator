/** The base timeline uses only the first visible VIDEO track. Other video
 * tracks are overlays, not additional cuts. Keep orchestration and compilation
 * on this same selection so hidden cuts/B-roll cannot disable input seeking. */
export function primaryVisibleVideoItems<T extends {hidden?:boolean;timeline_start:number}>(
  project:{tracks:Array<{type:string;hidden?:boolean;items:T[]}>}
):T[]{
  const track=project.tracks.find(t=>t.type==='VIDEO'&&!t.hidden);
  return (track?.items||[]).filter(i=>!i.hidden).sort((a,b)=>a.timeline_start-b.timeline_start);
}
