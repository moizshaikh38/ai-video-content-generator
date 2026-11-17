import {audioInputSha256,type TranscriptionInputReceipt} from '../../shared/transcriptSourceBinding.js';
import type {TranscriptionProvider} from './transcriptionProvider.js';

/** Capture bytes at the existing provider boundary, not provider transport
 * internals. A whole-file fallback can finish before sibling chunks settle. */
export function observeTranscriptionInputs(delegate:TranscriptionProvider){
  const requests:TranscriptionInputReceipt[]=[];
  const pending:Promise<unknown>[]=[];
  const provider:TranscriptionProvider={name:delegate.name,transcribeAudio(...args){
    const receipt:TranscriptionInputReceipt={sha256:audioInputSha256(args[0]),bytes:args[0].length,status:'submitted'};
    requests.push(receipt);
    const run=(async()=>{try{const result=await delegate.transcribeAudio(...args);receipt.status='completed';return result;}catch(error){receipt.status='failed';throw error;}})();
    pending.push(run);
    return run;
  }};
  return {provider,requests,settle:async()=>{await Promise.allSettled(pending);}};
}
