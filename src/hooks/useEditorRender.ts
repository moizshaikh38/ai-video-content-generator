import { useState, useCallback, useRef, useEffect } from 'react';
import { RenderedClip } from '../types';
import { clipRenderService, type ExportResolution } from '../services/clipRenderService';

export interface UseEditorRenderOptions {
  clipId: string | null;
  onRenderComplete?: (freshClip: RenderedClip, previewUrl: string) => void;
  onRenderError?: (errorMsg: string) => void;
}
export interface UseEditorRenderReturn {
  isRendering: boolean;
  renderProgress: number;
  renderStage: string;
  renderError: string | null;
  renderSuccessMsg: string | null;
  triggerRender: (resolution?: ExportResolution) => Promise<boolean>;
  cancelRenderPolling: () => void;
  clearRenderStatus: () => void;
  resolveSavedRequest: () => Promise<void>;
}

export function useEditorRender({ clipId, onRenderComplete, onRenderError }: UseEditorRenderOptions): UseEditorRenderReturn {
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStage, setRenderStage] = useState('idle');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderSuccessMsg, setRenderSuccessMsg] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const renderSequenceRef = useRef(0);
  const renderRequestRef = useRef(false);
  const mountedRef = useRef(true);
  const activeClipIdRef = useRef(clipId);
  activeClipIdRef.current = clipId;

  const cancelRenderPolling = useCallback(() => {
    renderSequenceRef.current++;
    renderRequestRef.current = false;
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const triggerRender = useCallback(async (resolution?: ExportResolution, recoveryOnly = false): Promise<boolean> => {
    if (!clipId || !mountedRef.current || activeClipIdRef.current !== clipId || renderRequestRef.current) return false;
    cancelRenderPolling();
    const sequence = renderSequenceRef.current;
    const isCurrent = () => mountedRef.current && activeClipIdRef.current === clipId && sequence === renderSequenceRef.current;
    renderRequestRef.current = true;
    setIsRendering(true);
    setRenderProgress(0);
    setRenderStage('queued');
    setRenderError(null);
    setRenderSuccessMsg(null);

    try {
      const receipt = recoveryOnly ? await clipRenderService.recoverRender(clipId) : await clipRenderService.renderClip(clipId, resolution ? { render_resolution: resolution } : undefined);
      if (!receipt) {if (isCurrent()) {renderRequestRef.current=false;setIsRendering(false);setRenderStage('idle');}return false;}
      if (!isCurrent()) return false;
      const startedAt = Date.now();
      let pollInFlight = false;
      pollIntervalRef.current = setInterval(async () => {
        if (!isCurrent()) return;
        // A slow request must not fan out overlapping reads. The wall-clock
        // bound also applies when reads succeed but the clip remains queued.
        if (Date.now() - startedAt >= 300_000) {
          cancelRenderPolling();
          setIsRendering(false);
          setRenderStage('waiting');
          const message = 'Rendering is still being checked. Your clip is saved. Reopen the clip to check its status before starting another render.';
          setRenderError(message);
          onRenderError?.(message);
          return;
        }
        if (pollInFlight) return;
        pollInFlight = true;
        try {
          const fresh = await clipRenderService.getClip(clipId);
          if (!isCurrent()) return;
          if (fresh.id !== clipId) throw new Error('The render response did not match the requested clip.');
          // A successful HTTP submission is a receipt for one job, not a grant
          // to call any later ready output a success for this request.
          if (typeof fresh.render_version !== 'number' || fresh.render_version < receipt.renderVersion) return;
          const superseded = fresh.render_version > receipt.renderVersion ||
            (typeof fresh.editor_version === 'number' && fresh.editor_version !== receipt.editorVersion);
          if (superseded) {
            await clipRenderService.resolveRender(clipId,receipt.submissionId);
            if (!isCurrent()) return;
            cancelRenderPolling();
            setIsRendering(false);
            setRenderStage('superseded');
            const message = 'The clip changed after this render was queued. Reopen the clip to check the latest state before exporting.';
            setRenderError(message);
            onRenderError?.(message);
            return;
          }
          const job = fresh.latest_job;
          if (fresh.editor_version !== receipt.editorVersion || !job || job.id !== receipt.jobId || job.clip_id !== clipId ||
              job.render_version !== receipt.renderVersion || job.editor_version !== receipt.editorVersion) return;
          if (job.status === 'failed') {
            await clipRenderService.resolveRender(clipId,receipt.submissionId);
            if (!isCurrent()) return;
            cancelRenderPolling();
            setIsRendering(false);
            setRenderStage('failed');
            const message = job.error_message || fresh.render_error_message || 'Rendering failed.';
            setRenderError(message);
            onRenderError?.(message);
          } else if (job.status === 'completed' && fresh.render_status === 'ready' && fresh.output_storage_path) {
            // Keep polling on a transient preview-read failure. The backend pins
            // the signed URL to this receipt rather than whichever output is newest.
            const previewUrl = await clipRenderService.getPreviewUrl(clipId, receipt);
            if (!isCurrent()) return;
            await clipRenderService.resolveRender(clipId,receipt.submissionId);
            if (!isCurrent()) return;
            cancelRenderPolling();
            setIsRendering(false);
            setRenderProgress(100);
            setRenderStage('ready');
            setRenderSuccessMsg(`Rendered successfully as Revision v${fresh.render_version}!`);
            onRenderComplete?.(fresh, previewUrl);
          } else {
            const progress = fresh.latest_job?.progress;
            if (typeof progress === 'number' && Number.isFinite(progress)) {
              setRenderProgress(Math.max(0, Math.min(99, progress)));
            }
            setRenderStage(fresh.latest_job?.stage || fresh.render_status);
          }
        } catch (error: any) {
          if (!isCurrent()) return;
          if ([400, 401, 403, 404, 409].includes(error?.status)) {
            // A rejected status/preview read is not proof the encode failed.
            // Stop this receipt check and show its review/access reason.
            cancelRenderPolling();
            setIsRendering(false);
            setRenderStage('review');
            const message = error.message || 'The rendered preview could not be verified. Reopen the clip to check its latest state.';
            setRenderError(message);
            onRenderError?.(message);
          }
          // Transient reads keep checking until the wall-clock bound above,
          // without starting new work or claiming a failed encode.
        } finally {
          pollInFlight = false;
        }
      }, 2500);
      return true;
    } catch (err: any) {
      if (!isCurrent()) return false;
      cancelRenderPolling();
      setIsRendering(false);
      const message = err.message || 'Failed to start render.';
      setRenderError(message);
      onRenderError?.(message);
      return false;
    }
  }, [clipId, cancelRenderPolling, onRenderComplete, onRenderError]);

  const resolveSavedRequest = useCallback(async()=>{
    if(!clipId||!mountedRef.current||activeClipIdRef.current!==clipId||renderRequestRef.current)return;
    cancelRenderPolling();
    const sequence=renderSequenceRef.current;
    const current=()=>mountedRef.current&&activeClipIdRef.current===clipId&&sequence===renderSequenceRef.current;
    renderRequestRef.current=true;setIsRendering(true);setRenderError(null);setRenderStage('recovering');
    try{
      const receipt=await clipRenderService.closePendingRender(clipId);
      if(!current())return;
      renderRequestRef.current=false;
      if(receipt){await triggerRender(undefined,true);}
      else{setIsRendering(false);setRenderStage('idle');setRenderError('No unresolved saved request remains. No render was started. You can choose settings and start a new render.');}
    }catch(error:any){if(current()){renderRequestRef.current=false;setIsRendering(false);setRenderStage('review');setRenderError(error.message||'The saved request could not be resolved. Its recovery key was kept.');}}
  },[clipId,cancelRenderPolling,triggerRender]);

  useEffect(() => {
    mountedRef.current = true;
    setIsRendering(false);
    setRenderProgress(0);
    setRenderStage('idle');
    setRenderError(null);
    setRenderSuccessMsg(null);
    // Recovery is lookup-only. A reload never admits an absent request.
    let recoveryCancelled=false;
    void Promise.resolve().then(()=>{if(!recoveryCancelled&&!renderRequestRef.current)void triggerRender(undefined,true);});
    return () => { recoveryCancelled=true;mountedRef.current = false; cancelRenderPolling(); };
  }, [clipId, cancelRenderPolling]);

  const clearRenderStatus = useCallback(() => {
    setRenderSuccessMsg(null);
    setRenderError(null);
  }, []);
  return { isRendering, renderProgress, renderStage, renderError, renderSuccessMsg, triggerRender, cancelRenderPolling, clearRenderStatus, resolveSavedRequest };
}
