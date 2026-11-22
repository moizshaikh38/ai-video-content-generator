/** Read-only editor review notice. This is recorded evidence about selected
 * source bytes, not a current-object fetch, semantic subtitle classification,
 * interval-wide clearance or permission to crop/remove generated captions. */
interface NoticeBase {
 blocking:false;message:string;timeBasis:'selected-source-window-not-edited-timeline';observedSourceTimes:number[];sourceSha256:string;sourceStart:number;sourceEnd:number;observedClipTimes:number[];sampledClipTimes:number[];semanticVerification:'unknown';establishesTextAbsence:false;captionSettingsChanged:false;
}
export type SourceTextReviewNotice=NoticeBase&({kind:'source-text-observed';evidence:'recorded-source-samples';coverage:'sparse-positive-only'}|{kind:'source-text-unchecked';evidence:'recorded-review-unavailable';coverage:'unavailable'});
export function sourceTextReviewNotice(clip:any):SourceTextReviewNotice|null {
 const review=clip?.reframe_metadata?.source_subtitle_review;
 const sha=clip?.selection_source_receipt?.source_receipt?.sha256;
 const unchecked=review?.status==='unavailable';
 if((!unchecked&&(review?.status!=='suspected-source-text'||review.hasBurnedSubtitles!==true))||typeof sha!=='string'||!/^[a-f0-9]{64}$/.test(sha)||review.sourceSha256!==sha)return null;
 if(![clip.start_seconds,clip.end_seconds].every(x=>typeof x==='number'&&Number.isFinite(x))||['trim_start_offset','trim_end_offset'].some(k=>clip[k]!==undefined&&(typeof clip[k]!=='number'||!Number.isFinite(clip[k]))))return null;
 const start=clip.start_seconds+(clip.trim_start_offset??0),end=clip.end_seconds-(clip.trim_end_offset??0);
 if(![start,end,review.sourceStart,review.sourceEnd].every(Number.isFinite)||start<0||end<=start||Math.abs(review.sourceStart-start)>.001||Math.abs(review.sourceEnd-end)>.001)return null;
 if(unchecked)return {kind:'source-text-unchecked',blocking:false,message:'Source captions were not checked. Review the preview for repeated text. If the source already has captions, Captions Off keeps only those. Your caption settings have not changed.',evidence:'recorded-review-unavailable',timeBasis:'selected-source-window-not-edited-timeline',observedSourceTimes:[],sourceSha256:sha,sourceStart:start,sourceEnd:end,observedClipTimes:[],sampledClipTimes:[],coverage:'unavailable',semanticVerification:'unknown',establishesTextAbsence:false,captionSettingsChanged:false};
 const duration=end-start,rows=Array.isArray(review.samples)?review.samples.slice(0,5):[];
 const valid=rows.filter((s:any)=>Number.isSafeInteger(s?.sampleIndex)&&s.sampleIndex>=0&&s.sampleIndex<5&&Number.isFinite(s.clipTime)&&s.clipTime>=0&&s.clipTime<duration&&Number.isFinite(s.sourceTime)&&Math.abs(s.sourceTime-start-s.clipTime)<=.001&&['suspected-source-text','not-observed','unavailable'].includes(s.status));
 // Preserve actual observation times only. Never invent times for legacy
 // clip-wide summaries, and never treat an empty list as absence.
 const times=(items:any[])=>[...new Set<number>(items.map(s=>s.clipTime))].sort((a,b)=>a-b);
 const observed=valid.filter((s:any)=>s.status==='suspected-source-text'&&Number.isFinite(s.candidateTop)&&s.candidateTop>=.72&&s.candidateTop<1);
 return {kind:'source-text-observed',blocking:false,message:'Text was observed in sampled source frames. Generated captions may overlap or repeat it. Review the preview; unobserved times remain unknown.',evidence:'recorded-source-samples',timeBasis:'selected-source-window-not-edited-timeline',observedSourceTimes:[...new Set<number>(observed.map((s:any)=>s.sourceTime))].sort((a,b)=>a-b),sourceSha256:sha,sourceStart:start,sourceEnd:end,observedClipTimes:times(observed),sampledClipTimes:times(valid),coverage:'sparse-positive-only',semanticVerification:'unknown',establishesTextAbsence:false,captionSettingsChanged:false};
}
