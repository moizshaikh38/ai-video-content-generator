import { useState, useCallback, useRef, useEffect } from 'react';
import { RenderedClip } from '../types';
import { clipRenderService } from '../services/clipRenderService';

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
  triggerRender: () => Promise<boolean>;
  cancelRenderPolling: () => void;
}

export function useEditorRender({
  clipId,
  onRenderComplete,
  onRenderError,
}: UseEditorRenderOptions): UseEditorRenderReturn {
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [renderStage, setRenderStage] = useState<string>('idle');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderSuccessMsg, setRenderSuccessMsg] = useState<string | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef<number>(0);

  const cancelRenderPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const triggerRender = useCallback(async (): Promise<boolean> => {
    if (!clipId) return false;

    cancelRenderPolling();
    setIsRendering(true);
    setRenderProgress(5);
    setRenderStage('queued');
    setRenderError(null);
    setRenderSuccessMsg(null);

    try {
      await clipRenderService.renderClip(clipId);

      // Start polling
      pollCountRef.current = 0;
      pollIntervalRef.current = setInterval(async () => {
        pollCountRef.current++;

        try {
          const fresh = await clipRenderService.getClip(clipId);

          if (fresh.render_status === 'rendering') {
            // Smooth simulated progress between known stages
            setRenderProgress((prev) => Math.min(92, Math.max(prev, 15 + pollCountRef.current * 4)));
            setRenderStage('encoding');
          } else if (fresh.render_status === 'ready') {
            cancelRenderPolling();
            setIsRendering(false);
            setRenderProgress(100);
            setRenderStage('ready');
            const msg = `Rendered successfully as Revision v${fresh.render_version || 1}!`;
            setRenderSuccessMsg(msg);

            const previewUrl = await clipRenderService.getPreviewUrl(clipId).catch(() => '');
            if (onRenderComplete) {
              onRenderComplete(fresh, previewUrl);
            }
          } else if (fresh.render_status === 'failed') {
            cancelRenderPolling();
            setIsRendering(false);
            setRenderStage('failed');
            const errText = fresh.render_error_message || 'Rendering failed.';
            setRenderError(errText);
            if (onRenderError) {
              onRenderError(errText);
            }
          }
        } catch {
          // Allow transient network failures up to 60 polls (150s)
          if (pollCountRef.current > 60) {
            cancelRenderPolling();
            setIsRendering(false);
            setRenderStage('failed');
            const timeoutErr = 'Rendering timed out. Please check back shortly.';
            setRenderError(timeoutErr);
            if (onRenderError) {
              onRenderError(timeoutErr);
            }
          }
        }
      }, 2500);

      return true;
    } catch (err: any) {
      setIsRendering(false);
      const msg = err.message || 'Failed to start render.';
      setRenderError(msg);
      if (onRenderError) {
        onRenderError(msg);
      }
      return false;
    }
  }, [clipId, cancelRenderPolling, onRenderComplete, onRenderError]);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      cancelRenderPolling();
    };
  }, [cancelRenderPolling]);

  return {
    isRendering,
    renderProgress,
    renderStage,
    renderError,
    renderSuccessMsg,
    triggerRender,
    cancelRenderPolling,
  };
}
