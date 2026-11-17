import{reviewCaptionPlacement,type CaptionPlacementReviewInput,type CaptionPlacementReviewResult,type CaptionReviewRect,type CaptionReviewRegion}from'./captionPlacementReview.js';
/** Strict bridge for caption review. Source-file clock is independent of edited
 * timeline. Caller must pass actual accepted picture/crop geometry, not infer it
 * from a layout name. No detector, persistence, or application default changes. */
export interface CaptionEvidenceIdentity {itemId:string;sourceId:string;sourceVersion:string;compositionRevision:string;sourceWidth:number;sourceHeight:number}
export interface CaptionEvidenceItem {id:string;source_asset_id:string;source_version:string;source_start:number;source_end:number;timeline_start:number;timeline_end:number;speed?:{speed:number;speed_ramp?:unknown};is_freeze?:boolean;is_title_card?:boolean}
export interface CaptionAcceptedProjection extends CaptionEvidenceIdentity {sourceStart:number;sourceEnd:number;sourceCrop:CaptionReviewRect;picture:CaptionReviewRect;canvas:{width:number;height:number};kind:'static-crop-to-picture'}
export interface CaptionSourceEvidence extends CaptionEvidenceIdentity {sourceStart:number;sourceEnd:number;coverage:'complete-for-interval'|'sampled';regions:Array<CaptionReviewRegion>}
export type CaptionEvidenceResult={status:'ready';review:CaptionPlacementReviewResult}|{status:'unavailable';reason:string};
const rect=(r:CaptionReviewRect)=>!!r&&[r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0;
const contained=(r:CaptionReviewRect,w:number,h:number)=>rect(r)&&r.x>=0&&r.y>=0&&r.x+r.width<=w&&r.y+r.height<=h;
const identity=(a:CaptionEvidenceIdentity,b:CaptionEvidenceIdentity)=>['itemId','sourceId','sourceVersion','compositionRevision','sourceWidth','sourceHeight'].every(k=>(a as any)[k]===(b as any)[k]);
export function resolveCaptionPlacementEvidence(input:{item:CaptionEvidenceItem;expected:CaptionEvidenceIdentity;projection:CaptionAcceptedProjection;evidence:CaptionSourceEvidence;timelineStart:number;timelineEnd:number;caption:CaptionPlacementReviewInput['caption'];manual?:{x:number;y:number}}):CaptionEvidenceResult{
 const {item:i,expected:e,projection:p,evidence:v}=input;const fail=(reason:string):CaptionEvidenceResult=>({status:'unavailable',reason});
 if(!e||!['itemId','sourceId','sourceVersion','compositionRevision'].every(k=>typeof(e as any)[k]==='string'&&(e as any)[k].length>0)||![e.sourceWidth,e.sourceHeight].every(n=>Number.isFinite(n)&&n>0)||!identity(e,p)||!identity(e,v)||e.itemId!==i.id||e.sourceId!==i.source_asset_id||e.sourceVersion!==i.source_version)return fail('item-source-composition-identity-mismatch');
 if(i.is_freeze||i.is_title_card||i.speed?.speed_ramp)return fail('unsupported-item-clock');
 const speed=i.speed?.speed??1;
 if(![i.source_start,i.source_end,i.timeline_start,i.timeline_end,speed,input.timelineStart,input.timelineEnd,p.sourceStart,p.sourceEnd,v.sourceStart,v.sourceEnd].every(Number.isFinite)||speed<=0||i.source_start<0||i.source_end<=i.source_start||i.timeline_end<=i.timeline_start||Math.abs((i.source_end-i.source_start)/speed-(i.timeline_end-i.timeline_start))>.001||input.timelineStart<i.timeline_start||input.timelineEnd>i.timeline_end||input.timelineEnd<=input.timelineStart)return fail('invalid-or-inconsistent-item-clock');
 const a=i.source_start+(input.timelineStart-i.timeline_start)*speed,z=i.source_start+(input.timelineEnd-i.timeline_start)*speed;
 if(p.kind!=='static-crop-to-picture'||p.sourceStart>a||p.sourceEnd<z||v.sourceStart>a||v.sourceEnd<z||p.sourceEnd<=p.sourceStart||v.sourceEnd<=v.sourceStart)return fail('composition-or-evidence-does-not-cover-source-interval');
 if(v.coverage!=='complete-for-interval')return fail('sampled-evidence-is-not-interval-coverage');
 if(!p.canvas||![p.canvas.width,p.canvas.height].every(n=>Number.isFinite(n)&&n>0)||!contained(p.sourceCrop,e.sourceWidth,e.sourceHeight)||!contained(p.picture,p.canvas.width,p.canvas.height)||!Array.isArray(v.regions)||v.regions.some(r=>!contained(r,e.sourceWidth,e.sourceHeight)||!['measured','manual-review'].includes(r.source)))return fail('invalid-source-projection-or-region');
 if(Math.abs((p.sourceCrop.width/p.sourceCrop.height)/(p.picture.width/p.picture.height)-1)>.002)return fail('unsupported-stretched-picture-projection');
 // Crop intersection is explicit: a region wholly outside the accepted crop is
 // not visible. A partially cropped region protects its remaining visible part.
 const regions:CaptionReviewRegion[]=v.regions.flatMap(r=>{const x=Math.max(r.x,p.sourceCrop.x),y=Math.max(r.y,p.sourceCrop.y),right=Math.min(r.x+r.width,p.sourceCrop.x+p.sourceCrop.width),bottom=Math.min(r.y+r.height,p.sourceCrop.y+p.sourceCrop.height);if(right<=x||bottom<=y)return[];return[{...r,x:p.picture.x+(x-p.sourceCrop.x)/p.sourceCrop.width*p.picture.width,y:p.picture.y+(y-p.sourceCrop.y)/p.sourceCrop.height*p.picture.height,width:(right-x)/p.sourceCrop.width*p.picture.width,height:(bottom-y)/p.sourceCrop.height*p.picture.height}];});
 return{status:'ready',review:reviewCaptionPlacement({itemId:e.itemId,sourceId:e.sourceId,compositionRevision:e.compositionRevision,start:input.timelineStart,end:input.timelineEnd,canvas:p.canvas,picture:p.picture,caption:input.caption,regions,evidence:'complete-for-interval',manual:input.manual})};
}
