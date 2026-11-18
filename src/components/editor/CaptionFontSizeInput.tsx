import React, {useLayoutEffect,useRef,useState} from 'react';
import {clampCaptionFontSize,getCaptionFontSizeBounds} from '../../lib/captionPresets';

/** Keep incomplete numeric text local. Only a deliberate commit changes captions. */
export function resolveCaptionFontSizeDraft(raw:string,current:number,fontFamily:string):number {
 const trimmed=raw.trim();
 if(!trimmed||!/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(trimmed))return current;
 const next=Number(trimmed);
 return Number.isFinite(next)?clampCaptionFontSize(next,fontFamily,current):current;
}
export const CaptionFontSizeInput:React.FC<{value:number;fontFamily:string;onCommit:(value:number)=>void;className?:string}>=({value,fontFamily,onCommit,className})=>{
 const [draft,setDraft]=useState(String(value));
 const skipBlur=useRef(false);
 const bounds=getCaptionFontSizeBounds(fontFamily);
 useLayoutEffect(()=>{setDraft(String(value));},[value,fontFamily]);
 const commit=()=>{const next=resolveCaptionFontSizeDraft(draft,value,fontFamily);setDraft(String(next));if(next!==value)onCommit(next);};
 return <input aria-label="Caption font size" title="Enter or leave this field to apply. Escape cancels." type="number" inputMode="numeric" min={bounds.min} max={bounds.max} step={1} value={draft}
  onChange={e=>setDraft(e.target.value)}
  onBlur={()=>{if(skipBlur.current){skipBlur.current=false;return;}commit();}}
  onKeyDown={e=>{
   if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit();skipBlur.current=true;e.currentTarget.blur();}
   else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setDraft(String(value));}
   else if(e.key==='ArrowUp'||e.key==='ArrowDown'){
    e.preventDefault();e.stopPropagation();
    const base=resolveCaptionFontSizeDraft(draft,value,fontFamily),next=clampCaptionFontSize(base+(e.key==='ArrowUp'?1:-1),fontFamily,value);
    setDraft(String(next));if(next!==value)onCommit(next);
   }
  }} className={className}/>;
};
