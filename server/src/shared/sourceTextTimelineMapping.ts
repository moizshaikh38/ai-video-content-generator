import type {CaptionReviewRect} from './captionPictureBandReview.js';
/** Inactive positive-evidence mapper. Supported temporal edits map a measured
 * source instant, never an interval of OCR clearance. Repeated footage may
 * produce repeated timeline observations. Unknown scene geometry stays unknown. */
export interface SourceTextBoxObservation {sourceTime:number;sourceSha256:string;sourcePath:string;box:CaptionReviewRect}
export interface SourceTextMappingScene {
 itemId:string;sourcePath:string;sourceSha256:string;
 sourceStart:number;sourceEnd:number;timelineStart:number;timelineEnd:number;speed:number;
 projection:{kind:'full-source-static-fit';verified:boolean;sourceWidth:number;sourceHeight:number;picture:CaptionReviewRect};
}
export function mapPositiveSourceText(observations:SourceTextBoxObservation[],scenes:SourceTextMappingScene[],canvas:{width:number;height:number}){
 const unknown=(reason:string)=>({status:'unavailable' as const,reason,observations:[],unsupportedItemIds:[],establishesTextAbsence:false as const});
 if(!Array.isArray(observations)||!Array.isArray(scenes)||observations.length>256||scenes.length>256||![canvas?.width,canvas?.height].every(Number.isFinite)||canvas.width<=0||canvas.height<=0)return unknown('Invalid or oversized source-text mapping inputs.');
 const rect=(r:CaptionReviewRect,w:number,h:number)=>!!r&&[r.left,r.top,r.right,r.bottom].every(Number.isFinite)&&r.left>=0&&r.top>=0&&r.right<=w&&r.bottom<=h&&r.right>r.left&&r.bottom>r.top;
 if(observations.some(o=>!o||typeof o.sourcePath!=='string'||typeof o.sourceSha256!=='string'||!Number.isFinite(o.sourceTime)||o.sourceTime<0||!/^[a-f0-9]{64}$/.test(o.sourceSha256)||!o.sourcePath||!rect(o.box,1,1)))return unknown('Positive observations need bound source identity, time and normalized source boxes.');
 if(scenes.some(s=>!s||typeof s.itemId!=='string'||!s.itemId)||new Set(scenes.map(s=>s.itemId)).size!==scenes.length)return unknown('Scene identifiers must be present and unique.');
 const mapped:Array<{itemId:string;clipTime:number;sourceTime:number;sourceBox:CaptionReviewRect}>=[],unsupportedItemIds:string[]=[];
 for(const scene of scenes){
  const p=scene.projection,picture=p?.picture;
  if(!scene.itemId||typeof scene.sourcePath!=='string'||!scene.sourcePath||typeof scene.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(scene.sourceSha256)||![scene.sourceStart,scene.sourceEnd,scene.timelineStart,scene.timelineEnd,scene.speed,p?.sourceWidth,p?.sourceHeight].every(Number.isFinite)||scene.sourceStart<0||scene.sourceEnd<=scene.sourceStart||scene.timelineStart<0||scene.timelineEnd<=scene.timelineStart||scene.speed<=0||p.kind!=='full-source-static-fit'||!p.verified||p.sourceWidth<=0||p.sourceHeight<=0||!rect(picture,canvas.width,canvas.height)||Math.abs((scene.sourceEnd-scene.sourceStart)/scene.speed-(scene.timelineEnd-scene.timelineStart))>.001||Math.abs((picture.right-picture.left)/(picture.bottom-picture.top)-p.sourceWidth/p.sourceHeight)>.001){unsupportedItemIds.push(scene.itemId);continue;}
  for(const observation of observations){
   if(observation.sourcePath!==scene.sourcePath||observation.sourceSha256!==scene.sourceSha256||observation.sourceTime<scene.sourceStart||observation.sourceTime>=scene.sourceEnd)continue;
   const clipTime=scene.timelineStart+(observation.sourceTime-scene.sourceStart)/scene.speed;
   if(clipTime<scene.timelineStart||clipTime>=scene.timelineEnd)continue;
   const w=picture.right-picture.left,h=picture.bottom-picture.top,b=observation.box;
   mapped.push({itemId:scene.itemId,clipTime,sourceTime:observation.sourceTime,sourceBox:{left:picture.left+b.left*w,top:picture.top+b.top*h,right:picture.left+b.right*w,bottom:picture.top+b.bottom*h}});
  }
 }
 mapped.sort((a,b)=>a.clipTime-b.clipTime||a.itemId.localeCompare(b.itemId));
 return {status:unsupportedItemIds.length?'partial' as const:'mapped' as const,observations:mapped,unsupportedItemIds,establishesTextAbsence:false as const};
}
