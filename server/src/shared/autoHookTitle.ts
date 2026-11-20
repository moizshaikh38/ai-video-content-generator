import {AppError} from '../types/index.js';
/** New candidate default only. Existing editor layers and manual overlays win. */
export function candidateAutoHookTitle(preferences:any,candidate:any){
 if(preferences?.autoHookTitle!==true)return {auto_hook_title_enabled:false,auto_hook_title_text:null};
 const text=typeof candidate?.hook==='string'?candidate.hook.replace(/\s+/g,' ').trim():'';
 if(!text||candidate.metadata?.selection_origin==='short-source-fallback')throw new AppError('This candidate has no authored hook title. Turn off Auto Hook or choose a candidate with a hook.',409,'HOOK_TITLE_UNAVAILABLE');
 if(text.length>100)throw new AppError('This hook exceeds the 100-character title limit. Edit the hook before creating the clip.',409,'HOOK_TITLE_TOO_LONG');
 return {auto_hook_title_enabled:true,auto_hook_title_text:text};
}
/** undefined marker is a legacy clip, preserve its existing title behavior. */
export function automaticHeadlineText(clip:any):string|null {
 if(clip.overlay_config?.enabled===false||clip.overlay_config?.text)return null;
 const raw=clip.auto_hook_title_enabled===true?clip.auto_hook_title_text:clip.auto_hook_title_enabled===false?null:clip.title;
 if(typeof raw!=='string'||!raw.trim())return null;
 return raw.replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
}
