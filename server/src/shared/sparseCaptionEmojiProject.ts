import type{EmojiCaptionCue}from'./sparseCaptionEmoji.js';
/** V1 deliberately supports one unshifted caption item only. Unknown edited
 * timing never becomes a guessed decoration clock. */
export function sparseEmojiProjectInput(project:any):{status:'ready';cues:EmojiCaptionCue[];signature:string;legacySignature:string}|{status:'unavailable';reason:string}{
 const object=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 const unavailable=()=>({status:'unavailable' as const,reason:'Saved caption or visual arrays need review before adding emojis.'});
 if(!Array.isArray(project?.tracks)||project.tracks.some((t:any)=>!object(t)))return unavailable();
 const validCues=(cues:any)=>Array.isArray(cues)&&cues.every((c:any)=>object(c)&&(c.words==null||(Array.isArray(c.words)&&c.words.every(object))));
 for(const t of project.tracks){
  if(t.hidden||t.type==='AUDIO'||isSparseCaptionEmojiTrack(t))continue;
  if(!Array.isArray(t.items)||t.items.some((v:any)=>!object(v)||(v.caption?.cues!==undefined&&!validCues(v.caption.cues))))return unavailable();
 }
 const tracks=project.tracks.filter((t:any)=>t.type==='CAPTION'&&!t.hidden);
 if(tracks.length!==1)return{status:'unavailable',reason:'Turn on one caption track first.'};
 const items=tracks[0].items.filter((i:any)=>!i.hidden);
 if(items.length!==1)return{status:'unavailable',reason:'Split caption timelines need manual emoji review.'};
 const i=items[0],duration=project?.canvas?.duration;
 if(i.timeline_start!==0||i.source_start!==0||(i.speed?.speed??1)!==1||i.speed?.speed_ramp||!Number.isFinite(duration)||duration<=0||!Number.isFinite(i.timeline_end)||!Number.isFinite(i.source_end)||Math.abs(i.timeline_end-duration)>.001||Math.abs(i.source_end-duration)>.001||!Array.isArray(i.caption?.cues))return{status:'unavailable',reason:'Edited caption timing needs manual emoji review.'};
 const cues=i.caption.cues;
 const textClock={duration,itemId:i.id,cues:cues.map((c:any)=>({id:c.id,start:c.start,end:c.end,text:c.text,words:c.words?.map((w:any)=>({text:w.text,start:w.start,end:w.end,customStyle:w.customStyle}))}))};
 // New reviews bind placement to the visible composition, not only words.
 // Audio, playhead, transient URLs and the emoji track itself do not change it.
 const visualContext={canvas:project.canvas,tracks:project.tracks.filter((t:any)=>!t.hidden&&t.type!=='AUDIO'&&!isSparseCaptionEmojiTrack(t)).map((t:any)=>({id:t.id,type:t.type,items:t.items.filter((v:any)=>!v.hidden).map((v:any)=>({id:v.id,type:v.type,timeline_start:v.timeline_start,timeline_end:v.timeline_end,source_start:v.source_start,source_end:v.source_end,transform:v.transform,crop:v.crop,crop_config:v.crop_config,panels:v.panels,framing_window:v.framing_window,layout_mode:v.layout_mode,tracker:v.tracker,automatic_framing:v.automatic_framing,scene_layout_overrides:v.scene_layout_overrides,transition_in:v.transition_in,transition_out:v.transition_out,card:v.card,speed:v.speed,effects:v.effects,keyframes:v.keyframes,text:v.text,caption:v.caption?{...v.caption,cues:v.caption.cues?.map((c:any)=>{const{id,start,end,text,words,...appearance}=c;return appearance;})}:undefined,source_asset_id:v.source_asset_id,z_index:v.z_index}))}))};
 return{status:'ready',cues,signature:JSON.stringify({...textClock,visualContextVersion:1,visualContext}),legacySignature:JSON.stringify(textClock)};
}
export function isSparseCaptionEmojiTrack(track:any):boolean{return track?.type==='IMAGE'&&track?.caption_emoji?.version===1&&typeof track.caption_emoji.sourceSignature==='string';}
export function sparseEmojiReviewMatches(track:any,input:ReturnType<typeof sparseEmojiProjectInput>):boolean{
 return input.status==='ready'&&(track?.caption_emoji?.sourceSignature===input.signature||track?.caption_emoji?.sourceSignature===input.legacySignature);
}
/** Output-only suppression shared by browser and renderer. Existing saved
 * tracks stay editable; changed/hidden captions do not leave stale emojis. */
export function suppressStaleCaptionEmojis<T extends{tracks:any[]}>(project:T):T{
 const input=sparseEmojiProjectInput(project);
 return{...project,tracks:project.tracks.map(t=>isSparseCaptionEmojiTrack(t)&&!sparseEmojiReviewMatches(t,input)?{...t,hidden:true}:t)};
}
