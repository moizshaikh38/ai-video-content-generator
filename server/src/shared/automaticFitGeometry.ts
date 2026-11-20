/** Shared foreground placement for automatic Fit picture and caption seam.
 * The sharp band is raised slightly. Neither its crop nor this placement is a
 * claim about which source content matters. */
export const AUTOMATIC_FIT_FOCUS_Y = .42;
export function automaticFitBottomBoundary(pictureAspect:number):number {
 if(!Number.isFinite(pictureAspect)||pictureAspect<=0)return 585/720;
 const fraction=Math.min(1,(9/16)/pictureAspect);
 return Math.min(.92,(1-fraction)*AUTOMATIC_FIT_FOCUS_Y+fraction);
}
