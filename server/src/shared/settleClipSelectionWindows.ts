/** Drain the already-dispatched selection batch before reporting failure.
 * Never turn a failed window into a successful empty/partial ranked analysis.
 * Error content is intentionally fixed, no provider response is returned. */
export async function settleClipSelectionWindows<T>(work:Promise<T>[]):Promise<T[]> {
 const settled=await Promise.allSettled(work);
 const failed=settled.filter((r):r is PromiseRejectedResult=>r.status==='rejected');
 if(failed.length){
  const statuses=failed.map(r=>r.reason?.providerStatus);
  const credits=statuses.includes(402),rate=statuses.includes(429);
  const code=credits?'CLIP_SELECTION_PROVIDER_CREDITS_UNAVAILABLE':rate?'CLIP_SELECTION_PROVIDER_RATE_LIMITED':'CLIP_SELECTION_WINDOWS_FAILED';
  const message=credits?'Clip selection could not finish because provider credits were unavailable. Existing suggestions were kept.':rate?'Clip selection could not finish because the provider rate limit was reached. Existing suggestions were kept.':'Clip selection could not finish all source windows. Existing suggestions were kept.';
  throw Object.assign(new Error(message),{code,statusCode:credits?502:rate?429:502,stage:'clip_selection',failedWindowCount:failed.length,submittedWindowCount:work.length});
 }
 return settled.map(r=>(r as PromiseFulfilledResult<T>).value);
}
