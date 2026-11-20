import type{EmojiCaptionCue}from'./sparseCaptionEmoji.js';
/** V1 deliberately supports one unshifted caption item only. Unknown edited
 * timing never becomes a guessed decoration clock. */
export function sparseEmojiProjectInput(project:any):{status:'ready';cues:EmojiCaptionCue[];signature:string}|{status:'unavailable';reason:string}{
 const tracks=project?.tracks?.filter((t:any)=>t.type==='CAPTION'&&!t.hidden)??[];
 if(tracks.length!==1)return{status:'unavailable',reason:'Turn on one caption track first.'};
 const items=tracks[0].items.filter((i:any)=>!i.hidden);
 if(items.length!==1)return{status:'unavailable',reason:'Split caption timelines need manual emoji review.'};
 const i=items[0],duration=project?.canvas?.duration;
 if(i.timeline_start!==0||i.source_start!==0||(i.speed?.speed??1)!==1||i.speed?.speed_ramp||!Number.isFinite(duration)||duration<=0||!Number.isFinite(i.timeline_end)||!Number.isFinite(i.source_end)||Math.abs(i.timeline_end-duration)>.001||Math.abs(i.source_end-duration)>.001||!Array.isArray(i.caption?.cues))return{status:'unavailable',reason:'Edited caption timing needs manual emoji review.'};
 const cues=i.caption.cues;
 return{status:'ready',cues,signature:JSON.stringify({duration,itemId:i.id,cues:cues.map((c:any)=>({id:c.id,start:c.start,end:c.end,text:c.text,words:c.words?.map((w:any)=>({text:w.text,start:w.start,end:w.end,customStyle:w.customStyle}))}))})};
}
export function isSparseCaptionEmojiTrack(track:any):boolean{return track?.type==='IMAGE'&&track?.caption_emoji?.version===1&&typeof track.caption_emoji.sourceSignature==='string';}
/** Output-only suppression shared by browser and renderer. Existing saved
 * tracks stay editable; changed/hidden captions do not leave stale emojis. */
export function suppressStaleCaptionEmojis<T extends{tracks:any[]}>(project:T):T{
 const input=sparseEmojiProjectInput(project);
 return{...project,tracks:project.tracks.map(t=>isSparseCaptionEmojiTrack(t)&&(input.status!=='ready'||t.caption_emoji.sourceSignature!==input.signature)?{...t,hidden:true}:t)};
}
