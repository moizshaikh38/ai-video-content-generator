import{useRef,useState}from'react';import{dragPlacement,type ManualSourceCrop}from'../../../server/src/shared/manualVideoPlacement';
/** Explicit source edit. The visible destination is never edited by this component. */
export function InlineSourceCrop({source,original,src,time,onApply,onCancel}:{source:ManualSourceCrop;original:ManualSourceCrop;src:string;time:number;onApply:(s:ManualSourceCrop)=>void;onCancel:()=>void}){
 const[draft,setDraft]=useState(source);const stage=useRef<HTMLDivElement>(null);
 const begin=(e:React.PointerEvent,corner?:string)=>{e.stopPropagation();e.preventDefault();const target=e.currentTarget as HTMLElement;target.setPointerCapture(e.pointerId);const start={x:e.clientX,y:e.clientY},r=stage.current!.getBoundingClientRect(),initial=draft;
 const move=(v:PointerEvent)=>{const d=dragPlacement({...initial,space:'canvas_normalized'},(v.clientX-start.x)/r.width,(v.clientY-start.y)/r.height,corner);setDraft({...initial,x:d.x,y:d.y,w:d.w,h:d.h});};const end=()=>{target.removeEventListener('pointermove',move);target.removeEventListener('pointerup',end);target.removeEventListener('pointercancel',end)};target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);};
 return <div data-selectable-item="source-crop" data-testid="inline-source-crop" className="absolute inset-0 z-50 bg-black/95 flex flex-col justify-center p-3 gap-3" onClick={e=>e.stopPropagation()}>
 <p className="text-white text-xs">Crop source · destination stays fixed. Drag box or four corners. Aspect locked.</p>
 <div ref={stage} className="relative w-full touch-none" style={{aspectRatio:`${source.source_width}/${source.source_height}`}}><video src={src} muted playsInline className="w-full h-full pointer-events-none" onLoadedMetadata={e=>{e.currentTarget.currentTime=time}}/>
 <div data-testid="source-crop-box" className="absolute border-2 border-white cursor-move touch-none" style={{left:`${draft.x*100}%`,top:`${draft.y*100}%`,width:`${draft.w*100}%`,height:`${draft.h*100}%`,boxShadow:'0 0 0 999px #0008'}} onPointerDown={e=>begin(e)}>
 {(['nw','ne','sw','se']as const).map(c=><button type="button" aria-label={`Crop source ${c}`} key={c} className="absolute w-6 h-6 bg-white border-2 border-black touch-none" style={{left:c.includes('w')?-12:undefined,right:c.includes('e')?-12:undefined,top:c.includes('n')?-12:undefined,bottom:c.includes('s')?-12:undefined}} onPointerDown={e=>begin(e,c)}/>)}
 </div></div>
 <p className="text-[10px] text-neutral-300 z-10">Manual source crop overrides framing inside this picture. Stored tracker is kept. Original subtitles stay in the source.</p>
 <div className="flex flex-wrap gap-2 z-10"><button type="button" onClick={()=>setDraft(original)} className="bg-white/10 text-white text-xs p-2 rounded">Restore original Fit window</button><button type="button" data-testid="crop-cancel" onClick={onCancel} className="bg-white/10 text-white text-xs p-2 rounded">Cancel</button><button type="button" data-testid="crop-apply" onClick={()=>onApply(draft)} className="bg-white text-black text-xs p-2 rounded">Apply source crop</button></div>
 </div>
}
