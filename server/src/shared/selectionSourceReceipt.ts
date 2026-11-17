import type { TranscriptSourceBinding } from './transcriptSourceBinding.js';
import { transcriptContentIdentity } from './transcriptSourceBinding.js';
import { sourceObjectReceiptMatches } from './sourceObjectReceipt.js';

/** Pins an editorial decision to the transcript and source it actually read.
 * This is integrity, not a claim of speech or editorial accuracy. */
export interface SelectionSourceReceipt {
  version: 1;
  source_key: string;
  source_receipt: TranscriptSourceBinding['source_receipt'];
  transcript_content_sha256: string;
}
export function selectionSourceReceipt(transcript: Record<string, any>, key: string): SelectionSourceReceipt {
  return { version:1, source_key:key, source_receipt:transcript.source_binding.source_receipt,
    transcript_content_sha256:transcriptContentIdentity(transcript) };
}
export function selectionSourceReceiptMatches(receipt: any, transcript: Record<string, any>, key: string): boolean {
  const binding = transcript.source_binding as TranscriptSourceBinding | undefined;
  return receipt?.version === 1 && receipt.source_key === key && !!binding
    && receipt.transcript_content_sha256 === transcriptContentIdentity(transcript)
    && receipt.transcript_content_sha256 === binding.transcript_content_sha256
    && receipt.source_receipt?.sha256 === binding.source_receipt?.sha256
    && sourceObjectReceiptMatches(receipt.source_receipt,key,binding.source_receipt);
}
