import type {CaptionStampMotion} from './captionStampMotion.js';
export interface CaptionEchoMotion extends CaptionStampMotion { offsetX:number;layerOpacity:number }
/** Independent phrase entrance: one cubic slide, two fading echo passes, no blur. */
export function getCaptionEchoMotion(start:number,end:number,time:number):CaptionEchoMotion {
 if(![start,end,time].every(Number.isFinite)||end<=start||time<start||time>=end)return {scale:1,rotation:0,opacity:0,offsetX:0,layerOpacity:0};
 const elapsed=Math.floor((Number(time.toFixed(2))-Number(start.toFixed(2))+1e-6)*50)*20;
 const p=Math.max(0,Math.min(1,elapsed/Math.max(1,Math.min(260,(end-start)*600))));
 return {scale:1,rotation:0,opacity:Math.min(1,p*5),offsetX:Number((40*Math.pow(1-p,3)).toFixed(3)),layerOpacity:Number((1-p).toFixed(3))};
}
