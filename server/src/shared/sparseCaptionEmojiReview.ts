import type{SparseCaptionEmojiPlan}from'./sparseCaptionEmoji.js';
/** Review-only adapter to ordinary editable IMAGE items. No new caption text or
 * token is introduced. Caller supplies trusted local/cached assets and a tested
 * canvas position; this is not collision detection or an automatic layout. */
export function sparseEmojiReviewTrack(plan:SparseCaptionEmojiPlan,input:{trackId:string;sourceSignature?:string;aspect:'9:16'|'16:9'|'1:1';centerX:number;centerY:number;assetPath:(id:string)=>string}){
 if(!input.trackId||![input.centerX,input.centerY].every(n=>Number.isFinite(n)&&n>=.08&&n<=.92))throw new Error('Explicit reviewed emoji position required.');
 if(plan.decorations.length>plan.limit||plan.limit>3)throw new Error('Sparse emoji cap exceeded.');
 const designW=input.aspect==='9:16'?360:input.aspect==='1:1'?480:640,designH=input.aspect==='9:16'?640:input.aspect==='1:1'?480:360;
 return{id:input.trackId,...(input.sourceSignature?{caption_emoji:{version:1 as const,sourceSignature:input.sourceSignature}}:{}),type:'IMAGE' as const,name:'Sparse caption emoji review',locked:false,muted:true,hidden:false,height:48,items:plan.decorations.map((d,i)=>({id:input.trackId+'-'+i,track_id:input.trackId,type:'IMAGE' as const,name:d.emoji+' '+d.matchedWord,source_path:input.assetPath(d.assetId),timeline_start:d.start,timeline_end:d.end,source_start:0,source_end:d.end-d.start,transform:{position_space:'design_center' as const,position_x:(input.centerX-.5)*designW,position_y:(input.centerY-.5)*designH,scale:.14,rotation:0,opacity:1},speed:{speed:1,pitch_preserved:true},effects:[],keyframes:[],locked:false,muted:true,hidden:false,z_index:25}))};
}
