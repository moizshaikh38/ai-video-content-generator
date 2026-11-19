export interface ClipReadiness {
  id: string;
  render_status: string;
  output_storage_path?: string | null;
}

/** Wait for the already-created render. Never starts or retries a paid render. */
export async function waitForClipReady<T extends ClipReadiness>(
  clipId: string,
  options: {
    readClip: (id: string, signal: AbortSignal) => Promise<T>;
    signal?: AbortSignal;
    onProgress?: (clip: T) => void;
    timeoutMs?: number;
    intervalMs?: number;
  },
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  if (options.signal?.aborted) cancel();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 300_000);
  const abortError = () => timedOut
    ? Object.assign(new Error('Rendering is still in progress. Your clip is saved. Try Export again shortly; no new render is needed.'), { code: 'RENDER_WAIT_TIMEOUT' })
    : Object.assign(new Error('Export wait cancelled.'), { name: 'AbortError' });
  // Bound even a stalled request, and stop all polling when the view leaves.
  const bounded = <R>(work: () => Promise<R>): Promise<R> => new Promise((resolve, reject) => {
    if (controller.signal.aborted) { reject(abortError()); return; }
    const abort = () => reject(abortError());
    controller.signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      if (controller.signal.aborted) throw abortError();
      return work();
    }).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort));
  });
  try {
    while (true) {
      const clip = await bounded(() => options.readClip(clipId, controller.signal));
      if (clip.id !== clipId) throw new Error('The render response did not match the requested clip.');
      options.onProgress?.(clip);
      if (clip.render_status === 'ready' && clip.output_storage_path) return clip;
      if (clip.render_status === 'failed') throw Object.assign(new Error('Rendering failed. Open the clip to review the error before retrying.'), { code: 'RENDER_FAILED' });
      if (clip.render_status === 'draft') throw Object.assign(new Error('This clip has no active render. Open it in the editor before exporting.'), { code: 'RENDER_NOT_STARTED' });
      await bounded(() => new Promise<void>((resolve) => {
        const pause = setTimeout(done, options.intervalMs ?? 2500);
        function done() { controller.signal.removeEventListener('abort', done); clearTimeout(pause); resolve(); }
        controller.signal.addEventListener('abort', done, { once: true });
      }));
    }
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}
