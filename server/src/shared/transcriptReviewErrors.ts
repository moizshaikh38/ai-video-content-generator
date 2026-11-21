/** Only these existing transcript review outcomes cross the processing-result
 * boundary as user-actionable conflicts. Unknown provider/storage failures must
 * not be promoted into a client review decision. */
export const TRANSCRIPT_REVIEW_CODES = ['TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED','TRANSCRIPT_REVIEW_REQUIRED','TRANSCRIPT_SOURCE_REVIEW_REQUIRED'] as const;
export type TranscriptReviewCode = typeof TRANSCRIPT_REVIEW_CODES[number];
export function transcriptReviewCode(value:unknown):TranscriptReviewCode|undefined {
  return typeof value==='string' && (TRANSCRIPT_REVIEW_CODES as readonly string[]).includes(value) ? value as TranscriptReviewCode : undefined;
}
