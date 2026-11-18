export const EDITOR_OVERLAY_MAX_BYTES = 16 * 1024 * 1024;
export const EDITOR_OVERLAY_TIMEOUT_MS = 10_000;

/** Buffer at most the stated budget, including streams without Content-Length. */
export async function readBoundedAssetResponse(response: Response, maxBytes = EDITOR_OVERLAY_MAX_BYTES): Promise<Buffer> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('Invalid asset byte budget.');
  const length = response.headers.get('content-length');
  if (length !== null) {
    const declared = /^\d+$/.test(length) ? Number(length) : NaN;
    if (!Number.isSafeInteger(declared) || declared > maxBytes) {
      await response.body?.cancel().catch(() => {});
      throw new Error('Overlay asset exceeds its byte budget or has invalid length.');
    }
  }
  if (!response.body) throw new Error('Overlay asset response has no body.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) throw new Error('Overlay asset exceeds its byte budget.');
      chunks.push(Buffer.from(next.value));
    }
    if (!bytes) throw new Error('Overlay asset response is empty.');
    return Buffer.concat(chunks, bytes);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}
