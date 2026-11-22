/** All submitted windows must settle before the job releases reservations or
 * scratch files. Promise.all's early rejection leaves chargeable siblings live. */
export async function settleTranscriptionWindows<T>(work:Promise<T>[]):Promise<T[]>{
 const results=await Promise.allSettled(work),failed=results.flatMap((r,index)=>r.status==='rejected'?[{index,error:r.reason}]:[]);
 if(!failed.length)return results.map(r=>(r as PromiseFulfilledResult<T>).value);
 const review=failed.find(f=>['TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED','TRANSCRIPT_REVIEW_REQUIRED','TRANSCRIPTION_SEAM_REVIEW_REQUIRED','PARAKEET_WORD_TIMING_REQUIRED','MAI_WORD_TIMING_REQUIRED'].includes(f.error?.code));
 const credit=failed.find(f=>f.error?.code==='TRANSCRIPTION_PROVIDER_CREDITS_UNAVAILABLE');
 const primary=review??credit??failed[0];
 if(failed.length===1)throw primary.error;
 const message=review&&credit?'Transcription windows failed: provider credits were unavailable and another window needs transcript review. No automatic retry was started.':review?'Multiple transcription windows failed; transcript review is required. No automatic retry was started.':credit?'Transcription windows failed because provider credits were unavailable. No automatic retry was started.':'Multiple transcription windows failed. No automatic retry was started.';
 throw Object.assign(new Error(message),{code:primary.error?.code??'TRANSCRIPTION_WINDOWS_FAILED',statusCode:primary.error?.statusCode??409,noAutomaticRetry:true,windowFailures:failed.map(f=>({index:f.index,code:typeof f.error?.code==='string'?f.error.code:'TRANSCRIPTION_WINDOW_FAILED'}))});
}
/** Bounded launch queue. Once any window fails, do not dispatch new windows.
 * Already submitted work still drains before the outer error is returned. */
export async function runTranscriptionWindows<T>(tasks:Array<()=>Promise<T>>,concurrency=2):Promise<T[]>{
 const outcomes:Array<Promise<T>>=[];let next=0,stopped=false;
 const worker=async()=>{while(!stopped&&next<tasks.length){const index=next++;try{outcomes[index]=Promise.resolve(await tasks[index]());}catch(error){stopped=true;const failed=Promise.reject<T>(error);failed.catch(()=>{});outcomes[index]=failed;}}};
 await Promise.all(Array.from({length:Math.min(Math.max(1,Math.floor(concurrency)),tasks.length)},worker));
 return settleTranscriptionWindows(outcomes);
}
