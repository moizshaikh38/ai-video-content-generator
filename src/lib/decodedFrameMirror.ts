/** Display-only mirrors of one decoded media frame. No second seek/play clock.
 * Canvas may be tainted by cross-origin media; pixels are never read/exported.
 * Native video remains the audio/transport authority. */
export function mirrorDecodedFrames(primary:HTMLVideoElement,targets:()=>Array<HTMLCanvasElement|null>):()=>void {
 let disposed=false,frame=0,usesVideoFrame=typeof primary.requestVideoFrameCallback==='function'&&typeof primary.cancelVideoFrameCallback==='function';
 const draw=(mediaTime=primary.currentTime)=>{
  if(disposed||primary.readyState<2||!primary.videoWidth||!primary.videoHeight)return;
  for(const canvas of targets()){
   if(!canvas)continue;
   if(canvas.width!==primary.videoWidth)canvas.width=primary.videoWidth;
   if(canvas.height!==primary.videoHeight)canvas.height=primary.videoHeight;
   const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)continue;
   ctx.drawImage(primary,0,0,canvas.width,canvas.height);
   canvas.dataset.mirroredMediaTime=String(mediaTime);
  }
 };
 const tick=(_now:number,metadata?:VideoFrameCallbackMetadata)=>{
  if(disposed)return;draw(metadata?.mediaTime);
  frame=usesVideoFrame?primary.requestVideoFrameCallback(tick):requestAnimationFrame(tick);
 };
 const refresh=()=>draw();
 for(const name of ['loadeddata','seeked','pause'])primary.addEventListener(name,refresh);
 draw();frame=usesVideoFrame?primary.requestVideoFrameCallback(tick):requestAnimationFrame(tick);
 return()=>{disposed=true;for(const name of ['loadeddata','seeked','pause'])primary.removeEventListener(name,refresh);if(usesVideoFrame)primary.cancelVideoFrameCallback(frame);else cancelAnimationFrame(frame);};
}
