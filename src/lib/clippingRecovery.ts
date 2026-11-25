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

import type { Project } from '../types';

/** An explicit review link is read-only, even before a failure flag is saved. */
export function projectTranscriptReviewRequired(
  project: Parameters<typeof projectClippingFailure>[0] | null | undefined,
  reviewOnly = false,
): boolean {
  return reviewOnly || Boolean(project && transcriptReviewRequired(projectClippingFailure(project)));
}

export interface EmptySelectionResolution {
  workflowState: 'processing' | 'error';
  message: string;
}

export const COMPLETED_EMPTY_SELECTION_MESSAGE = 'Selection completed without clip suggestions. Your source is saved.';
export const UNKNOWN_EMPTY_SELECTION_MESSAGE = 'No saved clips were found. Clip selection status is unavailable.';

export function resolveEmptySelectionOutcome(project: Partial<Project> | null | undefined): EmptySelectionResolution {
  const outcome = project?.selection_outcome_status;
  if (outcome?.state === 'completed_empty') {
    return { workflowState: 'error', message: COMPLETED_EMPTY_SELECTION_MESSAGE };
  }
  if (outcome?.state === 'source_processing') {
    return { workflowState: 'processing', message: 'Source video processing is in progress...' };
  }
  if (outcome?.state === 'selection_pending') {
    return {
      workflowState: 'processing',
      message: outcome.code === 'OUTBOX_PENDING'
        ? 'Saved request is queued for clip selection...'
        : 'Clip selection is in progress...',
    };
  }
  if (outcome?.state === 'failed') {
    return {
      workflowState: 'error',
      message: outcome.code
        ? clippingStartErrorMessage({ code: outcome.code, message: outcome.message || 'Clip selection failed. Your source is saved.' })
        : (outcome.message || 'Clip selection failed. Your source is saved.'),
    };
  }
  if (outcome?.state === 'review_required') {
    return {
      workflowState: 'error',
      message: outcome.code === 'CLIP_SELECTION_CONTEXT_CHANGED'
        ? 'Clip settings changed after selection. Review or run clip selection again; your source is saved.'
        : 'Clip selection needs review before results can be used. Your source is saved.',
    };
  }
  if (outcome?.state === 'unavailable' || outcome?.state === 'unknown') {
    return { workflowState: 'error', message: UNKNOWN_EMPTY_SELECTION_MESSAGE };
  }

  const videoStatus = project?.video_status || project?.status;
  if (videoStatus && ['queued', 'processing', 'transcribing', 'analyzing', 'generating'].includes(videoStatus)) {
    return { workflowState: 'processing', message: 'Source video processing is in progress...' };
  }
  if (videoStatus === 'failed') {
    const failure = projectClippingFailure(project || {});
    return {
      workflowState: 'error',
      message: clippingStartErrorMessage({ code: failure.code, message: failure.message || 'Video processing failed. Your source is saved.' }),
    };
  }
  return { workflowState: 'error', message: UNKNOWN_EMPTY_SELECTION_MESSAGE };
}
