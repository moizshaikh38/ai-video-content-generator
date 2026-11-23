import crypto from 'node:crypto';
import {AppError,EditorProject,HookCandidate,EditorTrack,EditorTrackItem} from '../types/index.js';
import {fitHookSourcePreviewText} from '../services/hookLab/hookSourcePreview.js';
const review=(message:string)=>new AppError(message,409,'HOOK_OVERLAY_REVIEW_REQUIRED');
/** Explicit manual TEXT_OVERLAY projection only. Does not certify candidate
 * generation lineage, modify media/captions or overwrite another text layer. */
export function projectHookTextOverlay(project:EditorProject,candidate:HookCandidate):EditorProject{
 const p=candidate.text_overlay_plan;
 if(candidate.delivery_mode!=='TEXT_OVERLAY'||candidate.trim_plan||candidate.reorder_plan||!p)throw review('This hook delivery mode needs a separate source-bound edit workflow. Choose a text-overlay candidate to add text.');
 const text=candidate.text;
 if(typeof text!=='string'||!text.trim()||text.length>100||/[\x00-\x08\x0b-\x1f\x7f]/.test(text))throw review('The hook needs one to 100 visible text characters.');
 const aspect=project.canvas.aspect_ratio;
 if(!['9:16','16:9','1:1'].includes(aspect))throw review('This canvas aspect needs review.');
 if(![p.start_time,p.end_time,p.position_y,p.font_size,project.canvas.duration,project.canvas.width,project.canvas.height].every(v=>typeof v==='number'&&Number.isFinite(v))||p.start_time<0||p.end_time<=p.start_time||p.end_time>project.canvas.duration||p.position_y<.1||p.position_y>.9||project.canvas.width<=0||project.canvas.height<=0)throw review('The overlay timing or geometry does not fit this saved timeline.');
 if(!['Inter','Montserrat','Bangers'].includes(p.font_family)||!/^#[0-9a-f]{6}$/i.test(p.color)||p.font_size<16||p.font_size>96)throw review('This hook needs a supported font, size and color.');
 // No provenance can be inferred from auto_headline. Preserve even an old
 // generated-looking title and ask for review instead of replacing it.
 if(project.tracks.some(t=>t.type==='TEXT'&&!t.hidden&&t.items.some(i=>!i.hidden&&i.timeline_start<p.end_time&&i.timeline_end>p.start_time)))throw review('Another text layer overlaps this hook. Review or move that text in Studio first.');
 const reference=aspect==='9:16'?{w:360,h:640}:aspect==='1:1'?{w:480,h:480}:{w:640,h:360};
 const size=p.font_size*reference.w/1080;
 const exportSize=Math.max(16,Math.round(size*project.canvas.height/reference.h));
 const fitted=fitHookSourcePreviewText(text,p.font_family,exportSize,project.canvas.width*.84);
 const lines=fitted.split('\n').length,padding=8*project.canvas.height/reference.h,block=lines*exportSize*1.25+2*padding;
 if(project.canvas.height*p.position_y-block/2<4||project.canvas.height*p.position_y+block/2>project.canvas.height-4)throw review('The hook extends beyond the canvas. Move it inward or shorten it.');
 const next=structuredClone(project),track:EditorTrack={id:crypto.randomUUID(),type:'TEXT',name:'Hook Lab Text',items:[],locked:false,hidden:false,muted:false};
 const item:EditorTrackItem={id:crypto.randomUUID(),track_id:track.id,type:'TEXT',timeline_start:p.start_time,timeline_end:p.end_time,source_start:0,source_end:p.end_time-p.start_time,speed:{speed:1,pitch_preserved:true},transform:{position_x:0,position_y:(p.position_y-.5)*reference.h,scale:1,rotation:0,opacity:1},text:{text:fitted,font_family:p.font_family as any,font_size:size,font_weight:p.font_family==='Bangers'?'normal':'bold',italic:false,alignment:'center',color:p.color,background_color:'#000000',background_padding:8,animation:'none',auto_headline:true},keyframes:[],effects:[],locked:false,hidden:false,muted:true,z_index:10};
 track.items.push(item);next.tracks.push(track);return next;
}
