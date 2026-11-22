import React,{useEffect,useRef} from 'react';
import {compositionPreviewLayers,type CompositionReviewRenderPlan} from '../../../server/src/shared/compositionReviewRender';

interface Props {
 src:string;plan:CompositionReviewRenderPlan;
 width:number;height:number;
 /** Seconds relative to this bound source window, never absolute timeline time. */
 clipTime:number;playing:boolean;
}
/** Local picture-composition review only. No item filters, speed/freeze, cuts,
 * captions or automatic save/apply. The host must label this as unverified
 * proposal review, not a model result. Its export partner consumes the same
 * materialized source crops / target pixels in compositionReviewRender.ts. */
export const CompositionReviewPreview:React.FC<Props>=({src,plan,width,height,clipTime,playing})=>{
 const refs=useRef<Array<HTMLVideoElement|null>>([]),layers=compositionPreviewLayers(plan,width,height);
 const validTime=Number.isFinite(clipTime)&&clipTime>=0&&clipTime<plan.source.end-plan.source.start;
 const sourceTime=plan.source.start+clipTime;
 useEffect(()=>{
  if(!layers||!validTime){refs.current.forEach(v=>v?.pause());return;}
  refs.current.forEach(v=>{if(!v)return;if(Math.abs(v.currentTime-sourceTime)>(playing?.12:.001))v.currentTime=sourceTime;});
 },[src,sourceTime,playing,validTime,plan.source.start,plan.panels.length]);
 useEffect(()=>{
  refs.current.forEach(v=>{if(!v)return;if(playing&&validTime){if(v.paused)v.play().catch(()=>{});}else v.pause();});
 },[src,playing,validTime,plan.panels.length]);
 if(!layers||!validTime)return <div role="alert">Invalid local composition review input.</div>;
 const video=(index:number,style:React.CSSProperties)=><video key={index} ref={v=>{refs.current[index]=v;}} src={src} muted playsInline preload="auto"
  onLoadedMetadata={e=>{e.currentTarget.currentTime=sourceTime;if(playing)e.currentTarget.play().catch(()=>{});}}
  onTimeUpdate={e=>{if(e.currentTarget.currentTime>=plan.source.end)refs.current.forEach(v=>v?.pause());}}
  style={{position:'absolute',maxWidth:'none',...style}}/>;
 return <div data-testid="composition-review-preview" data-review-kind={plan.kind} data-request-key={plan.requestKey}
  style={{position:'relative',width,height,overflow:'hidden',background:'black'}}>
  {layers.map((l,i)=><div key={i} data-testid={`composition-review-panel-${i}`} style={{position:'absolute',overflow:'hidden',background:'black',...l.target}}>
   {l.backdrop&&video(plan.panels.length+i,{left:l.backdrop.left,top:l.backdrop.top,width:l.backdrop.width,height:l.backdrop.height,clipPath:l.backdrop.clipPath,filter:`blur(${l.backdrop.blurRadius}px) brightness(0.85)`})}
   {video(i,l.foreground)}
  </div>)}
 </div>;
};
