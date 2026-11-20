import type {EditorProject} from '../types/index.js';
import {CAPTION_WIDTH_METRICS} from './captionWidthMetrics.js';
import {projectHook} from './hookDisplayMode.js';

/** Fresh Configure initialization only. Width estimates use existing font
 * advances plus a reserve, not shaping or collision clearance. Never migrate a
 * saved/manual title. Keep all glyphs, selected style, position and timing. */
export function fitFreshAutoHook(project:EditorProject):EditorProject {
 const hook=projectHook(project);
 if(!hook?.text?.hook_style_linked) return project;
 const text=hook.text,raw=text.text;
 if(typeof raw!=='string'||!raw.trim()||raw.length>100)throw new Error('A fresh hook requires 1 to 100 characters.');
 const previewW=project.canvas.aspect_ratio==='9:16'?360:project.canvas.aspect_ratio==='1:1'?480:640;
 const previewH=project.canvas.aspect_ratio==='9:16'?640:project.canvas.aspect_ratio==='1:1'?480:360;
 const scale=project.canvas.height/previewH;
 const metrics=CAPTION_WIDTH_METRICS[text.font_family||'Arial'];
 const segments=(value:string)=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value),s=>s.segment);
 const width=(value:string,size:number)=>Array.from(value).reduce((sum,c)=>sum+(metrics?.[c]??1.2),0)*size*1.05;
 const padding=Math.max(4,(text.background_padding||8)*scale);
 const fits=(value:string,size:number)=>value.length<=Math.max(8,Math.floor(.9*project.canvas.width/(size*.5)))&&width(value,size)+2*padding+4*scale<=.9*project.canvas.width;
 const startSize=text.font_size||16;
 const initialLines=raw.split(/\r?\n/).filter(Boolean);
 if(initialLines.length<=4&&initialLines.every(line=>fits(line,Math.max(16,Math.round(startSize*scale)))))return project;
 const content=raw.replace(/\s+/g,' ').trim();
 for(let size=startSize;size>=16;size--){
  const exportSize=Math.max(16,Math.round(size*scale));const lines:string[]=[];let current='';
  for(const word of content.split(' ')){
   const joined=current?current+' '+word:word;
   if(fits(joined,exportSize)){current=joined;continue;}
   if(current){lines.push(current);current='';}
   if(fits(word,exportSize)){current=word;continue;}
   for(const glyph of segments(word)){
    if(current&&!fits(current+glyph,exportSize)){lines.push(current);current='';}
    if(!fits(glyph,exportSize))throw new Error('This hook needs a smaller supported style.');
    current+=glyph;
   }
  }
  if(current)lines.push(current);
  const fitted=lines.join('\n');
  if(lines.length>4||fitted.length>100)continue;
  return {...project,tracks:project.tracks.map(t=>({...t,items:t.items.map(i=>i!==hook?i:{...i,text:{...text,text:fitted,font_size:size}})}))};
 }
 throw new Error('This hook does not fit four lines without losing text. Shorten it or choose a smaller supported style.');
}
