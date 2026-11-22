/** A review gate is not permission to retranscribe, charge, or trust old text. */
export interface ClippingFailure {
  code?: string | null;
  message?: string | null;
  name?: string;
}

export function transcriptReviewRequired(failure: ClippingFailure): boolean {
  return failure.code === 'TRANSCRIPT_SOURCE_REVIEW_REQUIRED'
    || failure.code === 'TRANSCRIPT_REVIEW_REQUIRED'
    || failure.code === 'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED';
}

/** Keep service setup details out of creator-facing recovery messages. */
export function clippingStartErrorMessage(error: ClippingFailure): string {
  if (error.name === 'AbortError' || error.message?.includes('cancelled')) {
    return 'Upload was cancelled.';
  }
  if (error.code === 'TRANSCRIPT_SOURCE_REVIEW_REQUIRED') {
    return 'The saved transcript could not be verified against the current video. Review the source and transcript before requesting another transcription.';
  }
  if (error.code === 'TRANSCRIPT_REVIEW_REQUIRED') {
    return 'The transcript needs review before it can be used for clips or captions. Check the source audio, language and transcript.';
  }
  if (error.code === 'TRANSCRIPT_WORD_TEXT_REVIEW_REQUIRED') {
    return 'Some transcript words do not match the saved text. Review the source audio and transcript before creating clips or captions.';
  }
  if (error.code === 'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED') {
    return 'Video processing is temporarily unavailable. Please try again once the service is restored.';
  }
  return error.message || 'Failed to start video clipping job.';
}

/** Older failed jobs stored only a review flag. Do not turn those into Retry. */
export function projectClippingFailure(project: {
  error_code?: string | null;
  error_message?: string | null;
  transcript_quality_status?: string | null;
}): ClippingFailure {
  return {
    code: project.error_code || (project.transcript_quality_status === 'needs_review'
      ? 'TRANSCRIPT_REVIEW_REQUIRED' : undefined),
    message: project.error_message,
  };
}

/** An explicit review link is read-only, even before a failure flag is saved. */
export function projectTranscriptReviewRequired(
  project: Parameters<typeof projectClippingFailure>[0] | null | undefined,
  reviewOnly = false,
): boolean {
  return reviewOnly || Boolean(project && transcriptReviewRequired(projectClippingFailure(project)));
}
