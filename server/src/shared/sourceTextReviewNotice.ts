/** Read-only editor review notice. This is recorded evidence about selected
 * source bytes, not a current-object fetch, semantic subtitle classification,
 * interval-wide clearance or permission to crop/remove generated captions. */
export interface SourceTextReviewNotice {
 kind:'source-text-observed';
 blocking:false;
 message:string;
 evidence:'recorded-source-samples';
 sourceSha256:string;
 sourceStart:number;
 sourceEnd:number;
 observedClipTimes:number[];
 sampledClipTimes:number[];
 coverage:'sparse-positive-only';
 semanticVerification:'unknown';
 establishesTextAbsence:false;
 captionSettingsChanged:false;
}
export function sourceTextReviewNotice(clip:any):SourceTextReviewNotice|null {
 const review=clip?.reframe_metadata?.source_subtitle_review;
 const sha=clip?.selection_source_receipt?.source_receipt?.sha256;
 if(review?.status!=='suspected-source-text'||review.hasBurnedSubtitles!==true||typeof sha!=='string'||!/^[a-f0-9]{64}$/.test(sha)||review.sourceSha256!==sha)return null;
 const start=Number(clip.start_seconds)+Number(clip.trim_start_offset||0),end=Number(clip.end_seconds)-Number(clip.trim_end_offset||0);
 if(![start,end,review.sourceStart,review.sourceEnd].every(Number.isFinite)||start<0||end<=start||Math.abs(review.sourceStart-start)>.001||Math.abs(review.sourceEnd-end)>.001)return null;
 const duration=end-start,rows=Array.isArray(review.samples)?review.samples.slice(0,5):[];
 const valid=rows.filter((s:any)=>Number.isSafeInteger(s?.sampleIndex)&&s.sampleIndex>=0&&s.sampleIndex<5&&Number.isFinite(s.clipTime)&&s.clipTime>=0&&s.clipTime<duration&&Number.isFinite(s.sourceTime)&&Math.abs(s.sourceTime-start-s.clipTime)<=.001&&['suspected-source-text','not-observed','unavailable'].includes(s.status));
 // Preserve actual observation times only. Never invent times for legacy
 // clip-wide summaries, and never treat an empty list as absence.
 const times=(items:any[])=>[...new Set<number>(items.map(s=>s.clipTime))].sort((a,b)=>a-b);
 const observed=valid.filter((s:any)=>s.status==='suspected-source-text'&&Number.isFinite(s.candidateTop)&&s.candidateTop>=.72&&s.candidateTop<1);
 return {kind:'source-text-observed',blocking:false,message:'Text was observed in sampled source frames. Generated captions may overlap or repeat it. Review the preview; unobserved times remain unknown.',evidence:'recorded-source-samples',sourceSha256:sha,sourceStart:start,sourceEnd:end,observedClipTimes:times(observed),sampledClipTimes:times(valid),coverage:'sparse-positive-only',semanticVerification:'unknown',establishesTextAbsence:false,captionSettingsChanged:false};
}
