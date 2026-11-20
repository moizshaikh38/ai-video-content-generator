import type {EditorProject} from '../types/index.js';
import {projectHook} from './hookDisplayMode.js';

export interface HookCanvasPositionReview {
 status:'unavailable'|'animated-review-required'|'anchor-outside-canvas'|'anchor-on-canvas';
 reason:string;
 hookId?:string;
 anchor?:{x:number;y:number};
}
/** Preview-space coordinates, matching TEXT compiler geometry. This reviews
 * the anchor only, not glyph/card bounds, faces or source-text collisions. */
export function reviewHookCanvasPosition(project:Pick<EditorProject,'tracks'|'canvas'>):HookCanvasPositionReview {
 const hook=projectHook(project);
 const track=hook&&project.tracks.find(t=>t.items.includes(hook));
 if(!hook||hook.hidden||track?.hidden)return {status:'unavailable',reason:'One visible hook is required.'};
 if(hook.keyframes?.length||(hook.text?.animation&&hook.text.animation!=='none'))return {status:'animated-review-required',hookId:hook.id,reason:'Animated hook position needs playback review.'};
 const width=project.canvas.aspect_ratio==='9:16'?360:project.canvas.aspect_ratio==='1:1'?480:640;
 const height=project.canvas.aspect_ratio==='9:16'?640:project.canvas.aspect_ratio==='1:1'?480:360;
 const x=hook.transform?.position_x??0,y=hook.transform?.position_y??0;
 if(![x,y].every(Number.isFinite))return {status:'unavailable',hookId:hook.id,reason:'Hook position is invalid.'};
 const anchor={x:.5+x/width,y:.5+y/height};
 if(anchor.x<0||anchor.x>1||anchor.y<0||anchor.y>1)return {status:'anchor-outside-canvas',hookId:hook.id,anchor,reason:'The hook anchor is outside this canvas. Move the hook or explicitly center it. Text size and collisions still need preview review.'};
 return {status:'anchor-on-canvas',hookId:hook.id,anchor,reason:'The hook anchor is on the canvas. This does not verify text bounds or collisions.'};
}
/** Explicit user-invoked recovery only. Never call during ratio normalization,
 * save, load or preset application. Preserve all words, size, style and timing.
 * Centering recovers an anchor, not a claim that the text avoids subjects. */
export function centerProjectHook(project:EditorProject):EditorProject {
 const hook=projectHook(project),track=hook&&project.tracks.find(t=>t.items.includes(hook));
 if(!hook||hook.hidden||track?.hidden)throw new Error('One visible hook is required before centering.');
 if(hook.locked||track?.locked)throw new Error('Unlock the hook layer before centering.');
 if(hook.keyframes?.length||(hook.text?.animation&&hook.text.animation!=='none'))throw new Error('Animated hook position needs an explicit keyframe edit.');
 if(![hook.transform?.position_x,hook.transform?.position_y].every(Number.isFinite))throw new Error('Hook position is invalid.');
 if(hook.transform.position_x===0&&hook.transform.position_y===0)return project;
 return {...project,tracks:project.tracks.map(t=>t!==track?t:{...t,items:t.items.map(i=>i!==hook?i:{...i,transform:{...i.transform,position_x:0,position_y:0}})})};
}
