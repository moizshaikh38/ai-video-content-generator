/** Caption-placement review candidate. Not connected to the shipped placement
 * path: measured canvas-space bounds and complete evidence must be supplied.
 * This does not detect faces/action/HUD or infer that unobserved areas are safe. */
export interface CaptionReviewRect {x:number;y:number;width:number;height:number}
export interface CaptionReviewRegion extends CaptionReviewRect {kind:'face'|'action'|'hud'|'text'|'other';source:'measured'|'manual-review'}
export interface CaptionPlacementReviewInput {
 itemId:string;sourceId:string;compositionRevision:string;start:number;end:number;
 canvas:{width:number;height:number};
 /** Exact accepted foreground picture region, already projected to canvas. */
 picture:CaptionReviewRect;
 /** Whole-shot union, including outline, shadow, boxes and maximum motion. */
 caption:{width:number;height:number;offsetX?:number;offsetY?:number};
 /** Regions must cover the entire interval, not just one sampled frame. */
 regions:CaptionReviewRegion[];
 evidence:'complete-for-interval'|'incomplete';
 preferredY?:number;
 manual?:{x:number;y:number};
}
export interface CaptionPlacementReviewResult {
 identity:{itemId:string;sourceId:string;compositionRevision:string;start:number;end:number};
 status:'candidate'|'manual'|'review-required';
 reason:string;anchor?:{x:number;y:number};bounds?:CaptionReviewRect;
 candidates:Array<{anchor:{x:number;y:number};bounds:CaptionReviewRect;overlap:number;pictureOverlap:number;inSafeArea:boolean}>;
}
const rectValid=(r:CaptionReviewRect)=>!!r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
const area=(r:CaptionReviewRect)=>r.width*r.height;
export function captionRectIntersection(a:CaptionReviewRect,b:CaptionReviewRect):number{return Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));}
/** One stable decision for a whole item/shot, not a new decision per word. */
export function reviewCaptionPlacement(i:CaptionPlacementReviewInput):CaptionPlacementReviewResult {
 const identity={itemId:i.itemId,sourceId:i.sourceId,compositionRevision:i.compositionRevision,start:i.start,end:i.end};
 const result:CaptionPlacementReviewResult={identity,status:'review-required',reason:'Invalid or missing measured geometry.',candidates:[]};
 const w=i.canvas?.width,h=i.canvas?.height;
 const dx=i.caption?.offsetX??-i.caption?.width/2,dy=i.caption?.offsetY??-i.caption?.height/2;
 if(!i.itemId||!i.sourceId||!i.compositionRevision||![i.start,i.end,w,h,i.caption?.width,i.caption?.height,dx,dy].every(Number.isFinite)||i.end<=i.start||w<=0||h<=0||i.caption.width<=0||i.caption.height<=0)return result;
 const inside=(r:CaptionReviewRect)=>rectValid(r)&&r.x>=0&&r.y>=0&&r.x+r.width<=w&&r.y+r.height<=h;
 if(!inside(i.picture)||!Array.isArray(i.regions)||i.regions.some(r=>!inside(r)||!['measured','manual-review'].includes(r.source)||!['face','action','hud','text','other'].includes(r.kind)))return result;
 if(i.manual){if(![i.manual.x,i.manual.y].every(Number.isFinite)||i.manual.x<0||i.manual.x>1||i.manual.y<0||i.manual.y>1)return result;return {...result,status:'manual',reason:'Explicit position preserved without an automatic safety claim.',anchor:{...i.manual},bounds:{x:i.manual.x*w+dx,y:i.manual.y*h+dy,width:i.caption.width,height:i.caption.height}};}
 if(i.evidence!=='complete-for-interval')return {...result,reason:'Incomplete interval evidence; no safe-position claim.'};
 // Conservative platform reserves are design limits, not platform certification.
 const safe={x:w*.06,y:h*.1,width:w*.88,height:h*.78};
 const preferred=Number.isFinite(i.preferredY)?Math.max(.1,Math.min(.88,i.preferredY!)):585/720;
 const lower=(i.picture.y+i.picture.height+safe.y+safe.height)/2/h;
 const upper=(safe.y+i.picture.y)/2/h;
 const ys=[preferred,lower,upper,.72,.5,.28,.16];
 const boundsFor=(y:number):CaptionReviewRect=>({x:w/2+dx,y:y*h+dy,width:i.caption.width,height:i.caption.height});
 const contains=(a:CaptionReviewRect,b:CaptionReviewRect)=>b.x>=a.x&&b.y>=a.y&&b.x+b.width<=a.x+a.width&&b.y+b.height<=a.y+a.height;
 result.candidates=[...new Set(ys.map(y=>Number(y.toFixed(6))))].map(y=>{const bounds=boundsFor(y);return {anchor:{x:.5,y},bounds,overlap:i.regions.reduce((n,r)=>n+captionRectIntersection(bounds,r),0),pictureOverlap:captionRectIntersection(bounds,i.picture)/area(bounds),inSafeArea:contains(safe,bounds)};});
 const viable=result.candidates.filter(c=>c.inSafeArea&&c.overlap===0).sort((a,b)=>a.pictureOverlap-b.pictureOverlap||Math.abs(a.anchor.y-preferred)-Math.abs(b.anchor.y-preferred));
 const best=viable[0];if(!best)return {...result,reason:'No tested anchor avoids measured protected regions inside the reserved canvas area.'};
 return {...result,status:'candidate',reason:best.pictureOverlap===0?'Candidate outside the accepted sharp picture and measured protected regions.':'Candidate avoids supplied protected regions; picture context still needs visual review.',anchor:best.anchor,bounds:best.bounds};
}
