/** Reuse measured shots only inside their recorded source interval. A current
 * clip start cannot rebase historical analysis onto different source frames.
 * This is a clip-window guard, not source-content-version certification. */
export function storedScenePlanWindow(project:any,clip:any,track:any):{track:any;sourceAnchor:number}|null{
 if(!track||track.status!=='ready'||track.metadata?.shot_composition_candidate!==true||track.analyzed_aspect_ratio!==(clip.aspect_ratio||'9:16'))return null;
 const source=track.metadata?.analyzed_source_path;if(!source||source!==clip.source_storage_path)return null;
 const anchor=track.metadata?.analyzed_source_start,end=track.metadata?.analyzed_source_end,duration=track.metadata?.clip_duration;
 if(typeof anchor!=='number'||typeof end!=='number'||typeof duration!=='number'||![anchor,end,duration].every(Number.isFinite)||anchor<0||end<=anchor||Math.abs(end-anchor-duration)>.001||!track.raw_samples?.length||!track.smoothed_keyframes?.length)return null;
 const items=project?.tracks?.find((t:any)=>t.type==='VIDEO'&&!t.hidden)?.items?.filter((i:any)=>!i.hidden&&!i.is_title_card)||[];
 if(!items.length||items.some((i:any)=>!Number.isFinite(i.source_start)||!Number.isFinite(i.source_end)||i.source_end<=i.source_start||i.source_start<anchor-1e-6||i.source_end>end+1e-6||(i.source_path&&i.source_path!==source)))return null;
 return {track:{...track,isStale:false},sourceAnchor:anchor};
}
