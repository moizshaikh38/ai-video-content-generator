import type {ItemPanels} from './panelLayouts.js';
export interface VisualGenreFrame {time:number;genre:'gaming'|'software_tutorial'|'people_conversation'|'other'|'uncertain';confidence:number}
export interface VisualGenreReceipt {sourceSha256:string;sourceWidth:number;sourceHeight:number;frames:VisualGenreFrame[];model:string}
export interface MeasuredInsetReceipt {source_sha256:string;status:string;proposals:Array<{box:{x:number;y:number;w:number;h:number};anchor_samples:number;observed_frames:number;sampled_frames:number}>}
/** Offline candidate only. Semantic genre and camera geometry are independent
 * requirements. Raw model boxes, confidence alone or a title never assign views.
 * This does not bypass transcript/selection quality gates or enable defaults.
 */
export function proposeAutomaticGamingPanels(input:{sourceSha256:string;sourceWidth:number;sourceHeight:number;durationSeconds:number;semantic:VisualGenreReceipt;inset:MeasuredInsetReceipt;coverReview?:boolean}):{panels:ItemPanels;limitations:string[]}|null {
 const {sourceSha256:sha,sourceWidth:w,sourceHeight:h,durationSeconds:duration,semantic:s,inset:r}=input;
 if(!s||!r||!Array.isArray(s.frames)||!Array.isArray(r.proposals)||!/^[a-f0-9]{64}$/.test(sha)||s.sourceSha256!==sha||r.source_sha256!==sha||!(Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0)||s.sourceWidth!==w||s.sourceHeight!==h||!s.model)return null;
 // Match the bounded review ingest contract at every consumer, not only ingestion.
 if(!Number.isFinite(duration)||duration<6||duration>30)return null;
 const frames=s.frames;
 if(frames.length<3||frames.some(f=>![f.time,f.confidence].every(Number.isFinite)||f.time<0||f.time>=duration||f.genre!=='gaming'||f.confidence<.9||f.confidence>1))return null;
 if(new Set(frames.map(f=>f.time)).size!==frames.length||Math.max(...frames.map(f=>f.time))-Math.min(...frames.map(f=>f.time))<2)return null;
 // Beginning/middle/end samples are still sparse review evidence, not framewise truth.
 if(frames[0].time>.25||duration-frames[frames.length-1].time>.5||frames.some((f,i)=>i>0&&f.time<=frames[i-1].time)||!frames.some(f=>f.time>=duration*.25&&f.time<=duration*.75))return null;
 if(r.status!=='measured-rectangle'||r.proposals.length!==1)return null;
 const p=r.proposals[0],b=p?.box;if(!b)return null;
 if(![b.x,b.y,b.w,b.h,p.anchor_samples,p.observed_frames,p.sampled_frames].every(Number.isFinite)||b.x<0||b.y<0||b.w<=0||b.h<=0||b.x+b.w>1||b.y+b.h>1||b.w*b.h>.2||![p.anchor_samples,p.observed_frames,p.sampled_frames].every(Number.isInteger)||p.anchor_samples<6||p.sampled_frames<8||p.observed_frames/p.sampled_frames<.85||p.observed_frames>p.sampled_frames)return null;
 const fit=input.coverReview?{}:{fit:'contain' as const};
 const topFraction=input.coverReview?(9/16)/(b.w*w/(b.h*h)):undefined;
 if(topFraction!==undefined&&(topFraction<.25||topFraction>.5))return null;
 return {panels:{layout:'gameplay',...(topFraction?{topFraction}:{}),slots:[{focusX:.5,focusY:.5,scale:1,set:true,fit:'contain',sourceRect:{...b}},{focusX:.5,focusY:.5,scale:1,set:true,...fit}]},limitations:[...(input.coverReview?['Explicit offline cover review. Top panel keeps the full measured inset with source-aspect target height; game panel crops source sides and may remove HUD/context. Not an accepted default.']:[]),'Offline visual/geometry candidate, not normal end-to-end Genre Auto acceptance.',...(input.coverReview?['Covered source pixels cannot be recovered; center cover may remove side HUD/context. No game-action or HUD readability qualification.']:['Main panel preserves the whole original source, including its burned-in camera. The streamer is therefore duplicated; covered gameplay cannot be recovered.','Contained gameplay preserves source HUD but may be too small or letterboxed. No action/HUD readability qualification.']),'No transcription, automatic highlight selection or active-speaker proof.']};
}

/** Explicit local review only. The receipt is data, not authority to enable it. */
export function gamingGenreFromVisualReview(sourceSha256:string,evidence:Parameters<typeof proposeAutomaticGamingPanels>[0]|undefined,expectedDuration?:number){
 if(expectedDuration!==undefined&&(!Number.isFinite(expectedDuration)||!evidence||Math.abs(evidence.durationSeconds-expectedDuration)>.05))return null;
 if(!evidence||evidence.sourceSha256!==sourceSha256||!proposeAutomaticGamingPanels(evidence))return null;
 return {genre:'gaming' as const,confidence:Math.min(...evidence.semantic.frames.map(f=>f.confidence)),reasons:['Source-bound independent visual frames show gaming; measured inset receipt is present. Offline review route, not a calibrated confidence score.']};
}
