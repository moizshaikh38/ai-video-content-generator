/** A trim need not discard measured shots that still lie inside the exact
 * analysed source interval. This does not bless stale aspect/source analyses. */
export function storedScenePlanWindow(project:any,clip:any,track:any):{track:any;sourceAnchor:number}|null{
 if(!track||track.status!=='ready'||track.metadata?.shot_composition_candidate!==true||track.analyzed_aspect_ratio!==(clip.aspect_ratio||'9:16'))return null;
 const source=track.metadata?.analyzed_source_path;if(!source||source!==clip.source_storage_path)return null;
 const anchor=Number(clip.start_seconds)+Number(track.analyzed_trim_start||0),end=anchor+Number(track.metadata?.clip_duration);
 if(![anchor,end].every(Number.isFinite)||end<=anchor||!track.raw_samples?.length||!track.smoothed_keyframes?.length)return null;
 const items=project?.tracks?.find((t:any)=>t.type==='VIDEO'&&!t.hidden)?.items?.filter((i:any)=>!i.hidden&&!i.is_title_card)||[];
 if(!items.length||items.some((i:any)=>!Number.isFinite(i.source_start)||!Number.isFinite(i.source_end)||i.source_start<anchor-1e-6||i.source_end>end+1e-6||(i.source_path&&i.source_path!==source)))return null;
 return {track:{...track,isStale:false},sourceAnchor:anchor};
}
