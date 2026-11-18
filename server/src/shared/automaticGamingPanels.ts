import type {ItemPanels} from './panelLayouts.js';
export interface VisualGenreFrame {time:number;genre:'gaming'|'software_tutorial'|'people_conversation'|'other'|'uncertain';confidence:number}
export interface VisualGenreReceipt {sourceSha256:string;sourceWidth:number;sourceHeight:number;frames:VisualGenreFrame[];model:string}
export interface MeasuredInsetReceipt {source_sha256:string;status:string;proposals:Array<{box:{x:number;y:number;w:number;h:number};anchor_samples:number;observed_frames:number;sampled_frames:number}>}
/** Offline candidate only. Semantic genre and camera geometry are independent
 * requirements. Raw model boxes, confidence alone or a title never assign views.
 * This does not bypass transcript/selection quality gates or enable defaults.
 */
export function proposeAutomaticGamingPanels(input:{sourceSha256:string;sourceWidth:number;sourceHeight:number;semantic:VisualGenreReceipt;inset:MeasuredInsetReceipt}):{panels:ItemPanels;limitations:string[]}|null {
 const {sourceSha256:sha,sourceWidth:w,sourceHeight:h,semantic:s,inset:r}=input;
 if(!/^[a-f0-9]{64}$/.test(sha)||s.sourceSha256!==sha||r.source_sha256!==sha||!(w>0&&h>0)||s.sourceWidth!==w||s.sourceHeight!==h||!s.model)return null;
 const frames=s.frames;
 if(frames.length<2||frames.some(f=>![f.time,f.confidence].every(Number.isFinite)||f.time<0||f.genre!=='gaming'||f.confidence<.9||f.confidence>1))return null;
 if(new Set(frames.map(f=>f.time)).size!==frames.length||Math.max(...frames.map(f=>f.time))-Math.min(...frames.map(f=>f.time))<2)return null;
 if(r.status!=='measured-rectangle'||r.proposals.length!==1)return null;
 const p=r.proposals[0],b=p.box;
 if(![b.x,b.y,b.w,b.h,p.anchor_samples,p.observed_frames,p.sampled_frames].every(Number.isFinite)||b.x<0||b.y<0||b.w<=0||b.h<=0||b.x+b.w>1||b.y+b.h>1||b.w*b.h>.2||p.anchor_samples<6||p.sampled_frames<8||p.observed_frames/p.sampled_frames<.85||p.observed_frames>p.sampled_frames)return null;
 return {panels:{layout:'gameplay',slots:[{focusX:.5,focusY:.5,scale:1,set:true,fit:'contain',sourceRect:{...b}},{focusX:.5,focusY:.5,scale:1,set:true,fit:'contain'}]},limitations:['Offline visual/geometry candidate, not normal end-to-end Genre Auto acceptance.','Main panel preserves the whole original source, including its burned-in camera. The streamer is therefore duplicated; covered gameplay cannot be recovered.','Contained gameplay preserves source HUD but may be too small or letterboxed. No action/HUD readability qualification.','No transcription, automatic highlight selection or active-speaker proof.']};
}
