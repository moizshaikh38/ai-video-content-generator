/** Classified failures reported by the current settled transcription-window
 * aggregator only. Not provider billing, root cause ordering or retry advice. */
export interface TranscriptionWindowFailureSummary {version:1;basis:'settled-window-failures';failedWindows:number;transcriptReview:number;providerCreditsUnavailable:number;other:number}
const own=(v:unknown,k:string):unknown=>{try{if(!v||typeof v!=='object')return;const d=Object.getOwnPropertyDescriptor(v,k);return d&&'value'in d?d.value:undefined;}catch{return;}};
const review=new Set(['TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED','TRANSCRIPT_REVIEW_REQUIRED','TRANSCRIPTION_SEAM_REVIEW_REQUIRED','PARAKEET_WORD_TIMING_REQUIRED','MAI_WORD_TIMING_REQUIRED']);
export function transcriptionWindowFailureSummary(error:unknown):TranscriptionWindowFailureSummary|undefined {
 if(own(error,'noAutomaticRetry')!==true)return;
 const rows=own(error,'windowFailures'),length=own(rows,'length');if(typeof length!=='number'||!Number.isSafeInteger(length)||length<2||length>10000)return;
 try{if(!Array.isArray(rows))return;}catch{return;}
 const seen=new Set<number>(),summary:TranscriptionWindowFailureSummary={version:1,basis:'settled-window-failures',failedWindows:length,transcriptReview:0,providerCreditsUnavailable:0,other:0};
 for(let n=0;n<length;n++) {const row=own(rows,String(n)),index=own(row,'index'),code=own(row,'code');if(typeof index!=='number'||!Number.isSafeInteger(index)||index<0||index>9999||seen.has(index)||typeof code!=='string')return;seen.add(index);if(review.has(code))summary.transcriptReview++;else if(code==='TRANSCRIPTION_PROVIDER_CREDITS_UNAVAILABLE')summary.providerCreditsUnavailable++;else summary.other++;}
 return summary;
}
/** Read one bounded snapshot of stored own data before presenting fixed labels. */
export function readTranscriptionWindowFailureSummary(value:unknown):TranscriptionWindowFailureSummary|undefined {
 const version=own(value,'version'),basis=own(value,'basis'),failedWindows=own(value,'failedWindows'),transcriptReview=own(value,'transcriptReview'),providerCreditsUnavailable=own(value,'providerCreditsUnavailable'),other=own(value,'other');
 if(version!==1||basis!=='settled-window-failures'||![failedWindows,transcriptReview,providerCreditsUnavailable,other].every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000)||Number(failedWindows)<2||Number(transcriptReview)+Number(providerCreditsUnavailable)+Number(other)!==failedWindows)return;
 return {version,basis,failedWindows:failedWindows as number,transcriptReview:transcriptReview as number,providerCreditsUnavailable:providerCreditsUnavailable as number,other:other as number};
}
export function validTranscriptionWindowFailureSummary(value:unknown):value is TranscriptionWindowFailureSummary {
 return readTranscriptionWindowFailureSummary(value)!==undefined;
}
