import {normalizeSourceRect,panelSourceWindow,type PanelRect} from './panelLayouts.js';
/** Offline geometry candidate only. Exclusion matches the compiler's even-pixel
 * inset crop, not independently rounded normalized edges. No role/scene proof.
 * Lost source context is explicit; this does not assign or enable a layout. */
export function largestRectangleOutsideInset(inset:PanelRect,sourceWidth:number,sourceHeight:number):PanelRect|null {
 if(!normalizeSourceRect(inset)||![sourceWidth,sourceHeight].every(v=>Number.isInteger(v)&&v>=2&&v%2===0))return null;
 const r=panelSourceWindow({fit:'contain',focusX:.5,focusY:.5,scale:1,sourceRect:inset},sourceWidth,sourceHeight,1);
 const candidates=[{x:0,y:0,w:r.x,h:sourceHeight},{x:r.x+r.w,y:0,w:sourceWidth-r.x-r.w,h:sourceHeight},{x:0,y:0,w:sourceWidth,h:r.y},{x:0,y:r.y+r.h,w:sourceWidth,h:sourceHeight-r.y-r.h}].filter(a=>a.w>=2&&a.h>=2).sort((a,b)=>b.w*b.h-a.w*a.h);
 const a=candidates[0];return a?{x:a.x/sourceWidth,y:a.y/sourceHeight,w:a.w/sourceWidth,h:a.h/sourceHeight}:null;
}
