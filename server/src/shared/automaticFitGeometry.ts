/** Shared foreground placement for automatic Fit picture and caption seam.
 * The sharp band is raised slightly. Neither its crop nor this placement is a
 * claim about which source content matters. */
export const AUTOMATIC_FIT_FOCUS_Y = .42;
/** Applies only to an already admitted automatic Fit route. Nonportrait
 * whole-source Auto Fit is centered by buildBackdropFitChain. Manual crops,
 * explicit framing windows and other compositions keep their own contract. */
export function automaticFitFocusY(canvasAspect:string='9:16'):number {
 return canvasAspect==='1:1'||canvasAspect==='16:9'?.5:AUTOMATIC_FIT_FOCUS_Y;
}
export function automaticFitBottomBoundary(pictureAspect:number,canvasAspect:string='9:16'):number {
 if(!Number.isFinite(pictureAspect)||pictureAspect<=0)return 585/720;
 const outputAspect=canvasAspect==='1:1'?1:canvasAspect==='16:9'?16/9:9/16;
 const fraction=Math.min(1,outputAspect/pictureAspect);
 return Math.min(.92,(1-fraction)*automaticFitFocusY(canvasAspect)+fraction);
}
