import {NEW_CAPTION_PRESET_ID} from './captionPresets.js';
/** Only untouched candidate settings. Explicit user choices win. */
export function freshCandidateSubtitle(saved?:{enabled:boolean;preset:string;wordMode?:'phrase'|'single'}){return saved??{enabled:true,preset:NEW_CAPTION_PRESET_ID,wordMode:'phrase' as const};}
/** A source-span review fallback has no authored hook/headline. Do not burn its filename. */
export function freshCandidateOverlay(metadata:any):{enabled:false;text:''}|undefined{return metadata?.selection_origin==='short-source-fallback'?{enabled:false,text:''}:undefined;}
