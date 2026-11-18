import type {EditorCaptionItem} from '../types';
/** Cue positioning cannot change the track's global positioning intent. */
export function applyCuePosition(caption:EditorCaptionItem|undefined,cueId:string,pos:{x?:number;y?:number}):EditorCaptionItem{
 const current=caption||{cues:[],style:'clean',position:'bottom',highlight_color:'#FF6B35',primary_color:'#FFFFFF'};
 if(!current.cues?.some(c=>c.id===cueId))return current;
 return {...current,cues:current.cues.map(c=>c.id!==cueId?c:{...c,...(pos.x!==undefined?{position_x:Number(pos.x.toFixed(3))}:{}),...(pos.y!==undefined?{position_y:Number(pos.y.toFixed(3))}:{})})};
}

/** Preview resync includes positioning and per-cue styling, not only word times. */
export function cueListsEqual(a:unknown[],b:unknown[]):boolean{return JSON.stringify(a)===JSON.stringify(b);}
