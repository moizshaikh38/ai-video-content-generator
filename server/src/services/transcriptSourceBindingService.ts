import {headObject} from './objectStorageService.js';
import {AppError} from '../types/index.js';
import {assertTranscriptUsable} from './transcription/transcriptQuality.js';
import {transcriptSourceBindingMatches} from '../shared/transcriptSourceBinding.js';

/** Never fall through to a paid provider when an existing transcript's lineage
 * is absent/stale. That needs an explicit new transcription decision. */
export async function assertTranscriptReusable(transcript:Record<string,any>,sourceKey:string,options?:{allowOrderedSegmentFallback?:boolean}):Promise<void> {
  assertTranscriptUsable(transcript,options);
  let matches=false;
  try {matches=transcriptSourceBindingMatches(transcript,sourceKey,await headObject('source',sourceKey));}catch{}
  if(!matches)throw new AppError('Existing transcript cannot be verified against this source. Review the source and transcript before requesting a new transcription; no automatic retranscription was started.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
}
