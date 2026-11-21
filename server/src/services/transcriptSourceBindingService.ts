import {headObject} from './objectStorageService.js';
import {AppError} from '../types/index.js';
import {assertTranscriptUsable} from './transcription/transcriptQuality.js';
import {hasValidTranscriptSourceBinding,transcriptSourceBindingMatches} from '../shared/transcriptSourceBinding.js';

/** Never fall through to a paid provider when an existing transcript's lineage
 * is absent/stale. That needs an explicit new transcription decision. */
export async function assertTranscriptReusable(transcript:Record<string,any>,sourceKey:string):Promise<void> {
  assertTranscriptUsable(transcript);
  const review=()=>new AppError('Existing transcript cannot be verified against this source. Review the source and transcript before requesting a new transcription; no automatic retranscription was started.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
  if(!hasValidTranscriptSourceBinding(transcript,sourceKey))throw review();
  // Unavailable storage is not evidence of a mismatched source. Remain closed,
  // but preserve its error so a render can use bounded retry instead of falsely
  // recording that a known transcript became stale. No provider fallback.
  const matches=transcriptSourceBindingMatches(transcript,sourceKey,await headObject('source',sourceKey));
  if(!matches)throw review();
}
