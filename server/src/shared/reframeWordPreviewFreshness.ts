import {sourceWindowReframeWords} from './sourceWindowReframeWords.js';
/** Preview-only read validation. Unconditioned visual geometry is independent
 * of transcript edits. Never reanalyze or mutate a saved camera track here. */
export function reframeWordPreviewFreshness(track:any,transcript:unknown):'not-conditioned'|'current'|'stale' {
 const m=track?.metadata;
 if(m?.word_energy_fused!==true)return 'not-conditioned';
 if(typeof m.analyzed_source_sha256!=='string'||!/^[a-f0-9]{64}$/.test(m.analyzed_source_sha256))return 'stale';
 const prior=m.transcript_word_join;
 if(prior?.status!=='accepted'||!Number.isSafeInteger(prior.windowWordCount)||prior.windowWordCount<=0||typeof prior.transcriptContentSha256!=='string')return 'stale';
 const current=sourceWindowReframeWords(transcript,{sourceReceipt:m.analyzed_source_receipt,sourceSha256:m.analyzed_source_sha256,start:m.analyzed_source_start,end:m.analyzed_source_end});
 return current.audit.status==='accepted'&&(current.audit.windowWordCount??0)>0&&current.audit.transcriptContentSha256===prior.transcriptContentSha256?'current':'stale';
}
