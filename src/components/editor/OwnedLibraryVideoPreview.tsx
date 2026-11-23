import{useEffect,useState}from'react';import{mediaService}from'../../services/mediaService';
/** Resolve only the VIDEO the user opened. Storage keys never become browser URLs. */
export function OwnedLibraryVideoPreview({assetId,sourcePath,title}:{assetId:string;sourcePath:string;title:string}){
 const[state,setState]=useState<{key:string;url?:string;failed?:boolean}>({key:''});const key=JSON.stringify([assetId,sourcePath]);
 useEffect(()=>{let active=true;setState({key});mediaService.selectedVideoPreview(assetId,sourcePath).then(r=>{if(active)setState({key,url:r.signedUrl})}).catch(()=>{if(active)setState({key,failed:true})});return()=>{active=false};},[assetId,sourcePath,key]);
 const current=state.key===key?state:null;
 return current?.url&&!current.failed?<video aria-label={title} src={current.url} controls autoPlay playsInline className="w-full h-full object-contain" onError={()=>setState({key,failed:true})}/>:<div role="status" className="p-4 text-center text-xs text-white">{current?.failed?'Selected video preview unavailable. Choose it again or render to review.':'Loading selected video...'}</div>;
}
