/** Minimum clip-level freshness for existing reframe consumers. This is not the
 * stronger item/source-content-version/config identity acceptance contract. */
export function reframeTrackFreshness(
  clip: {source_storage_path?: string | null;start_seconds:number;end_seconds:number;trim_start_offset?:number|null;trim_end_offset?:number|null;aspect_ratio?:string|null},
  track: {analyzed_aspect_ratio?:string;metadata?:Record<string,any>},
  expectedSourceSha256?:string
): {isStale:boolean;reasons:string[]} {
  const reasons:string[]=[];
  const metadata=track.metadata||{};
  if(expectedSourceSha256!==undefined && (!/^[a-f0-9]{64}$/.test(expectedSourceSha256)||metadata.analyzed_source_sha256!==expectedSourceSha256))reasons.push('source-bytes-changed-or-unverified');
  const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
  const trimStart=clip.trim_start_offset??0,trimEnd=clip.trim_end_offset??0;
  if(![clip.start_seconds,clip.end_seconds,trimStart,trimEnd].every(finite)||trimStart<0||trimEnd<0)reasons.push('invalid-current-source-window');
  const start=clip.start_seconds+trimStart,end=clip.end_seconds-trimEnd;
  if(start<0||end<=start)reasons.push('invalid-current-source-window');
  if(!clip.source_storage_path||!metadata.analyzed_source_path||metadata.analyzed_source_path!==clip.source_storage_path)reasons.push('source-path-changed-or-unverified');
  if(!finite(metadata.analyzed_source_start)||!finite(metadata.analyzed_source_end)||
    Math.abs(metadata.analyzed_source_start-start)>.001||Math.abs(metadata.analyzed_source_end-end)>.001)reasons.push('source-window-changed-or-unverified');
  if(track.analyzed_aspect_ratio!==(clip.aspect_ratio||'9:16'))reasons.push('output-aspect-changed');
  return{isStale:reasons.length>0,reasons:[...new Set(reasons)]};
}
