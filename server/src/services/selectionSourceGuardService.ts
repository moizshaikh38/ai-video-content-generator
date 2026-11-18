import {dataRepository, ownerContext} from '../db/repositories/dataRepository.js';
import {AppError} from '../types/index.js';
import {assertTranscriptReusable} from './transcriptSourceBindingService.js';
import {selectionSourceReceiptMatches} from '../shared/selectionSourceReceipt.js';

/** Read-only gate. Never repairs, retranscribes, charges, or promotes legacy rows. */
export async function assertSelectionSourceCurrent(userId:string, projectId:string, receipt:unknown,
  clipSourceKey?:string|null):Promise<void> {
  return ownerContext.run(userId,async()=>{
    const {data:project} = await dataRepository.from('projects').select('source_url').eq('id',projectId).eq('user_id',userId).maybeSingle();
    const {data:transcript} = await dataRepository.from('transcripts').select('*').eq('project_id',projectId).eq('user_id',userId).maybeSingle();
    if (!project || !transcript || (clipSourceKey!==undefined && clipSourceKey!==project.source_url)
      || !selectionSourceReceiptMatches(receipt,transcript,project.source_url)) {
      throw new AppError('This clip decision cannot be verified against the current source and transcript. Review it before running selection or export again.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
    }
    // Existing selected clips may render genuine segment captions when only word clocks are unreliable.
    // General reuse/automatic clip analysis still calls the strict default directly.
    await assertTranscriptReusable(transcript,project.source_url);
  });
}
