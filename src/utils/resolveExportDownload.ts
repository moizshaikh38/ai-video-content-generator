/** A clip always revalidates with its owner-scoped signing endpoint. Previously
 * signed URLs are usable only for legacy exports with no clip identity. */
export async function resolveExportDownload(input: {
  clipId?: string;
  fallbackUrl?: string | null;
  fallbackFilename: string;
  resolve: (clipId: string) => Promise<{signedUrl: string; filename?: string}>;
}): Promise<{signedUrl: string; filename: string}> {
  const result = input.clipId
    ? await input.resolve(input.clipId)
    : {signedUrl: input.fallbackUrl, filename: input.fallbackFilename};
  if (typeof result.signedUrl !== 'string' || !result.signedUrl.trim()) {
    throw new Error('Unable to resolve a valid download URL. The clip may still be processing.');
  }
  return {signedUrl: result.signedUrl, filename: result.filename || input.fallbackFilename};
}
