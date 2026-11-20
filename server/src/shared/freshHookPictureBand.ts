import type {EditorProject} from '../types/index.js';
import {projectHook} from './hookDisplayMode.js';
export interface FreshHookBandReview {project:EditorProject;status:'unchanged'|'placed-in-upper-band'|'no-room'|'unavailable';reason:string;pictureTop?:number;bounds?:{top:number;bottom:number};}
/** Fresh initialization only. The caller supplies source-verified picture geometry
 * and the compiler's measured ink/card union. Never use on save/load or restyling.
 * Keep every word, font, size, timing and x coordinate; only translate y if the
 * unchanged card can fit entirely above the sharp picture with a small gap. */
export function placeFreshHookInUpperBand(project:EditorProject,pictureTop:number,bounds:{top:number;bottom:number}):FreshHookBandReview {
 const result=(status:FreshHookBandReview['status'],reason:string,updated=project):FreshHookBandReview=>({project:updated,status,reason,pictureTop,bounds});
 const hook=projectHook(project),track=hook&&project.tracks.find(t=>t.items.includes(hook));
 if(!hook?.text?.hook_style_linked||hook.hidden||track?.hidden||hook.locked||track?.locked||hook.keyframes?.length||hook.effects?.length||hook.text.animation!=='none'||hook.transform?.rotation!==0||hook.transform?.scale!==1)return result('unavailable','One fresh static unlocked Auto hook is required.');
 const h=project.canvas.height,previewH=project.canvas.aspect_ratio==='9:16'?640:project.canvas.aspect_ratio==='1:1'?480:360;
 if(![h,pictureTop,bounds.top,bounds.bottom,hook.transform.position_y].every(Number.isFinite)||h<=0||pictureTop<0||pictureTop>h||bounds.top<0||bounds.bottom>h||bounds.bottom<=bounds.top)return result('unavailable','Measured picture or card bounds are invalid.');
 const gap=Math.max(4,Math.ceil(h/180));
 if(bounds.top>=gap&&bounds.bottom<=pictureTop-gap)return result('unchanged','The measured hook already fits above the sharp picture.');
 if(bounds.bottom-bounds.top+2*gap>pictureTop)return result('no-room','The unchanged hook card does not fit in the unused upper band. No source crop, text reduction or position change was made.');
 const delta=Math.floor(pictureTop-gap-bounds.bottom);
 if(bounds.top+delta<gap)return result('no-room','The measured card has no pixel-aligned upper-band placement. No position change was made.');
 const nextY=hook.transform.position_y+delta*previewH/h;
 const updated={...project,tracks:project.tracks.map(t=>t!==track?t:{...t,items:t.items.map(i=>i!==hook?i:{...i,transform:{...i.transform,position_y:nextY}})})};
 return result('placed-in-upper-band','Moved only the new Auto hook anchor into the measured unused upper band.',updated);
}
