/** Keep service setup details out of creator-facing recovery messages. */
export function clippingStartErrorMessage(error: { code?: string; message?: string; name?: string }): string {
  if (error.name === 'AbortError' || error.message?.includes('cancelled')) {
    return 'Upload was cancelled.';
  }
  if (error.code === 'TRANSCRIPTION_PROVIDER_NOT_CONFIGURED') {
    return 'Video processing is temporarily unavailable. Please try again once the service is restored.';
  }
  return error.message || 'Failed to start video clipping job.';
}
