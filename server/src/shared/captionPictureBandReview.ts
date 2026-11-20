/** Inactive quality-review candidate. No render, preview or save consumer.
 * Positive source-text observations establish collisions only at measured
 * instants. An OCR miss never supplies a clear interval. New captions may be
 * reviewed for an unchanged-size y translation into verified picture bands;
 * full-picture output can legitimately have no room. */
export interface CaptionReviewRect {left:number;top:number;right:number;bottom:number}
export interface CaptionTextObservation {clipTime:number;sourceBox:CaptionReviewRect}
export interface CaptionBandReviewInput {
 canvas:{width:number;height:number};
 /** Entire sharp source footprint, verified full-source static Fit only. */
 picture:CaptionReviewRect;
 fullSourceStaticFitVerified:boolean;
 /** Actual compiler ink/stroke/card union, not nominal font size. */
 captionBounds:CaptionReviewRect;
 /** Animated presets need the union across the whole cue, not one raster. */
 captionBoundsCoverage:'cue-union'|'sample-instant';
 /** Requires a separately justified unclipped envelope. A canvas-clipped bbox
  * or a finite guard without an extent bound cannot supply this assertion. */
 captionBoundsUnclippedVerified:boolean;
 /** Actual current normalized ASS anchor, not the raster bbox center. */
 compilerAnchorY:number;
 cue:{start:number;end:number};
 observations:CaptionTextObservation[];
 /** All other visible overlays intersecting the cue, measured on this canvas.
  * Unknown overlay geometry must keep overlayBoundsComplete false. */
 otherOverlayBounds:CaptionReviewRect[];
 overlayBoundsComplete:boolean;
 freshAutomaticCaption:boolean;
 explicitManualPosition:boolean;
}
export interface CaptionBandReview {
 status:'candidate-lower-band'|'candidate-upper-band'|'no-room'|'collision-not-observed'|'unavailable';
 reason:string;
 collisions:Array<{clipTime:number;sourceBox:CaptionReviewRect}>;
 proposedBounds?:CaptionReviewRect;
 deltaY?:number;
 proposedCompilerAnchorY?:number;
 establishesSourceTextAbsence:false;
 outputVerified:false;
}
const rectValid=(r:CaptionReviewRect,w:number,h:number)=>!!r&&[r.left,r.top,r.right,r.bottom].every(Number.isFinite)&&r.left>=0&&r.top>=0&&r.right<=w&&r.bottom<=h&&r.right>r.left&&r.bottom>r.top;
const intersects=(a:CaptionReviewRect,b:CaptionReviewRect,gap=0)=>a.left<b.right+gap&&a.right>b.left-gap&&a.top<b.bottom+gap&&a.bottom>b.top-gap;
export function reviewCaptionPictureBand(input:CaptionBandReviewInput):CaptionBandReview {
 const result=(status:CaptionBandReview['status'],reason:string,collisions:CaptionBandReview['collisions']=[],candidate?:CaptionReviewRect):CaptionBandReview=>({status,reason,collisions,...(candidate?{proposedBounds:candidate,deltaY:candidate.top-input.captionBounds.top,proposedCompilerAnchorY:input.compilerAnchorY+(candidate.top-input.captionBounds.top)/input.canvas.height}:{}),establishesSourceTextAbsence:false,outputVerified:false});
 const {width:w,height:h}=input.canvas||{};
 if(![w,h].every(Number.isFinite)||w<=0||h<=0||!input.fullSourceStaticFitVerified||!input.overlayBoundsComplete||!input.freshAutomaticCaption||input.explicitManualPosition)return result('unavailable','Only a fresh automatic caption with verified static full-source Fit and complete overlay bounds is eligible. Manual and saved intent remain unchanged.');
 if(!Number.isFinite(input.compilerAnchorY)||input.compilerAnchorY<.08||input.compilerAnchorY>.92)return result('unavailable','The current compiler anchor must be explicitly measured inside the supported8%-92% canvas range.');
 if(!rectValid(input.picture,w,h)||!rectValid(input.captionBounds,w,h)||!Array.isArray(input.observations)||!Array.isArray(input.otherOverlayBounds)||input.otherOverlayBounds.some(r=>!rectValid(r,w,h))||![input.cue?.start,input.cue?.end].every(Number.isFinite)||input.cue.start<0||input.cue.end<=input.cue.start)return result('unavailable','Measured canvas, cue, picture or overlay geometry is invalid.');
 // This proposal only uses full-width top/bottom Fit bands, not side gutters,
 // a face-free guess, or a cropped/moving source window.
 if(input.picture.left!==0||input.picture.right!==w)return result('unavailable','Only a full-width verified sharp-picture footprint supplies these bands.');
 if(input.observations.some(o=>!Number.isFinite(o.clipTime)||o.clipTime<0||!rectValid(o.sourceBox,w,h)||o.sourceBox.left<input.picture.left||o.sourceBox.right>input.picture.right||o.sourceBox.top<input.picture.top||o.sourceBox.bottom>input.picture.bottom))return result('unavailable','Positive source-text observations must be measured inside the verified sharp picture.');
 const collisions=input.observations.filter(o=>o.clipTime>=input.cue.start&&o.clipTime<input.cue.end&&intersects(input.captionBounds,o.sourceBox));
 if(!collisions.length)return result('collision-not-observed','No collision was measured at the supplied instants. Unobserved times and OCR misses remain unknown.');
 const gap=Math.max(4,Math.ceil(h/180)),captionH=input.captionBounds.bottom-input.captionBounds.top;
 const candidates=[{status:'candidate-lower-band' as const,top:Math.ceil(input.picture.bottom+gap),bandEnd:h-gap},{status:'candidate-upper-band' as const,top:Math.floor(input.picture.top-gap-captionH),bandEnd:input.picture.top-gap}];
 for(const candidate of candidates){
  const bounds={...input.captionBounds,top:candidate.top,bottom:candidate.top+captionH};
  if(bounds.top<gap||bounds.bottom>candidate.bandEnd||!rectValid(bounds,w,h)||intersects(bounds,input.picture,gap-0.01)||input.otherOverlayBounds.some(r=>intersects(bounds,r,gap)))continue;
  const translatedAnchor=input.compilerAnchorY+(bounds.top-input.captionBounds.top)/h;
  if(translatedAnchor<.08||translatedAnchor>.92)continue;
  if(input.captionBoundsCoverage!=='cue-union')return result('unavailable','A sampled collision is real, but one caption raster does not bound animation across the cue. A cue-wide ink/stroke/card union is required before proposing translation.',collisions);
  if(input.captionBoundsUnclippedVerified!==true)return result('unavailable','The cue-wide caption envelope has not been verified unclipped. An on-canvas alpha bbox or an unjustified finite guard may conceal off-canvas ink. No translation was proposed.',collisions);
  return result(candidate.status,'Unchanged caption fits outside the entire verified sharp-source footprint and measured overlays. Local output pixels still require qualification; no position was saved.',collisions,bounds);
 }
 return result('no-room','Measured source-text collision has no unchanged-size top/bottom picture-band placement representable by the compiler anchor. No caption suppression, font reduction, source crop or forced anchor was proposed.',collisions);
}
