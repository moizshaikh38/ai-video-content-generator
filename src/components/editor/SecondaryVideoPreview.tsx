import{secondaryVideoPreviewSupported}from'../../lib/secondaryVideoPreviewSupport';
import{useEffect,useRef,useState}from'react';import type{EditorTrackItem}from'../../types';import{mediaService}from'../../services/mediaService';
/** Bounded saved secondary VIDEO preview. Do not fall back to raw storage keys
 * or the primary source when selected-media authorization fails. */
export function SecondaryVideoPreview({item,playhead,isPlaying,onSelect}:{item:EditorTrackItem;playhead:number;isPlaying:boolean;onSelect:()=>void}){
 const ref=useRef<HTMLVideoElement>(null),[url,setUrl]=useState<string|null>(null),[failed,setFailed]=useState(false);
 const supported=secondaryVideoPreviewSupported(item);
 useEffect(()=>{let active=true;setUrl(null);setFailed(false);if(!supported){setFailed(true);return;}
 mediaService.selectedVideoPreview(item.source_asset_id!,item.source_path!).then(r=>{if(active)setUrl(r.signedUrl)}).catch(()=>{if(active)setFailed(true)});return()=>{active=false};
 },[item.source_asset_id,item.source_path,supported]);
 const time=Math.max(0,(item.source_start||0)+playhead-item.timeline_start);
 const sync=()=>{const v=ref.current;if(!v)return;if(Math.abs(v.currentTime-time)>.08)v.currentTime=time;if(isPlaying){void v.play().catch(()=>setFailed(true));}else v.pause();};
 useEffect(sync,[time,isPlaying,url]);
 return <div className={`absolute inset-0 ${url&&!failed&&supported?'pointer-events-auto':'pointer-events-none'}`} data-secondary-video={item.id} onClick={e=>{if(url&&!failed&&supported){e.stopPropagation();onSelect()}}}>
  {url&&!failed&&supported?<video ref={ref} src={url} playsInline muted preload="auto" onLoadedMetadata={sync} onError={()=>setFailed(true)} className="w-full h-full" style={{objectFit:item.crop?.mode==='fit'?'contain':'cover',backgroundColor:item.crop?.mode==='fit'?'black':undefined}}/>:<div role="status" className="absolute inset-x-2 bottom-2 rounded bg-black/80 px-2 py-1 text-xs text-white">{failed?'Selected video preview unavailable. Render to review this layer.':'Loading selected video...'}</div>}
 </div>;
}
