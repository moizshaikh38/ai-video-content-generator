/** Review context, never a substitute score or a claim of highlight quality. */
export function shortSourceReviewContext(duration:unknown,preference:unknown){
 const requested=preference==='15-30'?[15,30]:preference==='30-60'?[30,60]:preference==='60-90'?[60,90]:undefined;
 return {version:1,...(typeof duration==='number'&&Number.isFinite(duration)&&duration>0?{source_duration_seconds:duration}:{}),...(requested?{requested_duration_seconds:{min:requested[0],max:requested[1]}}:{})};
}
export function candidateReviewNotice(candidate:any):string|null{
 const metadata=candidate?.metadata;
 if(metadata?.selection_origin==='provider-proposal'&&metadata?.ranking_status==='unranked'){
  if(metadata.ranking_invalidated_reason==='spoken-content-changed-after-proposal')return 'Review adjusted clip: its spoken content changed after the original proposal, so the original rank was removed. Watch the opening and ending, and edit the boundaries if needed before exporting. A word-safe cut or the selected duration does not confirm a complete thought.';
  if(metadata.ranking_invalidated_reason==='changed-interval-speech-scope-unverified')return 'Review adjusted clip: its time range changed, but unchanged spoken content could not be verified. The original rank was removed. Watch the opening and ending, and edit the boundaries if needed before exporting.';
  if(metadata.ranking_invalidated_reason==='dependent-opening-needs-review')return 'Review the opening: this clip may depend on earlier speech. The original rank was removed. Watch the surrounding context and edit the boundaries if needed before exporting.';
 }
 if(metadata?.selection_origin!=='short-source-fallback')return null;
 const c=candidate.metadata.selection_review_context,d=c?.source_duration_seconds,r=c?.requested_duration_seconds;
 const length=c?.version===1&&typeof d==='number'&&Number.isFinite(d)&&d>0&&typeof r?.min==='number'&&Number.isFinite(r.min)&&typeof r.max==='number'&&Number.isFinite(r.max)&&r.min>0&&r.max>=r.min&&d<r.min?` Source is ${Number(d.toFixed(1))}s, shorter than your ${r.min}-${r.max}s preference.`:'';
 return `Review fallback: no highlight proposals were returned. This transcript span is unranked; review the action, captions and crop before sharing.${length}`;
}
