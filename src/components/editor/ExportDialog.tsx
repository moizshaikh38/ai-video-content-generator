import React, { useState, useEffect } from 'react';
import {
  X,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  FileVideo,
  FileCode,
  Sparkles,
} from 'lucide-react';
import { RenderedClip, EditorProject } from '../../types';
import { clipRenderService } from '../../services/clipRenderService';
import { triggerBrowserDownload } from '../../utils/downloadUtils';
import {
  generatePremiereXml,
  generateFcpxml,
  downloadXmlFile,
  getFilenameBase,
} from '../../utils/nleExport';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  clip?: RenderedClip | null;
  project?: EditorProject;
  duration: number;
  isRendering: boolean;
  renderProgress: number;
  renderStage: string;
  renderError: string | null;
  renderSuccessMsg: string | null;
  onTriggerRender: () => void;
  downloadUrl?: string | null;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  isOpen,
  onClose,
  clip,
  project,
  duration,
  isRendering,
  renderProgress,
  renderStage,
  renderError,
  renderSuccessMsg,
  onTriggerRender,
  downloadUrl,
}) => {
  const [resolution, setResolution] = useState<'1080p' | '720p'>('1080p');
  const [burnCaptions, setBurnCaptions] = useState<boolean>(true);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string | null>(null);
  const [resolvedFilename, setResolvedFilename] = useState<string>('clip.mp4');

  // Pre-fetch signed download URL as soon as clip is ready or render completes
  useEffect(() => {
    if (!isOpen || !clip?.id) return;
    if (clip.render_status === 'ready' || renderSuccessMsg) {
      clipRenderService
        .getDownloadUrl(clip.id)
        .then((res) => {
          if (res.signedUrl) {
            setResolvedDownloadUrl(res.signedUrl);
            if (res.filename) setResolvedFilename(res.filename);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, clip?.id, clip?.render_status, renderSuccessMsg]);

  const handleDownloadClip = async () => {
    if (!clip?.id && !resolvedDownloadUrl && !downloadUrl) {
      setDownloadError('No clip ID or download URL is available.');
      return;
    }

    setIsDownloading(true);
    setDownloadError(null);

    try {
      let targetUrl = resolvedDownloadUrl || downloadUrl;
      let targetFilename = resolvedFilename || (clip?.title
        ? `${clip.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.mp4`
        : 'vireo-clip.mp4');

      if (!targetUrl && clip?.id) {
        try {
          const downloadData = await clipRenderService.getDownloadUrl(clip.id);
          if (downloadData.signedUrl) {
            targetUrl = downloadData.signedUrl;
            if (downloadData.filename) {
              targetFilename = downloadData.filename;
            }
            setResolvedDownloadUrl(targetUrl);
            setResolvedFilename(targetFilename);
          }
        } catch (fetchErr: any) {
          if (!targetUrl) {
            throw fetchErr;
          }
        }
      }

      if (!targetUrl) {
        throw new Error('Unable to resolve a valid download URL. The clip may still be processing.');
      }

      await triggerBrowserDownload(targetUrl, targetFilename);
    } catch (err: any) {
      setDownloadError(err.message || 'Failed to download video. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleExportPremiereXml = () => {
    if (!project) return;
    const base = getFilenameBase(project, clip);
    const xml = generatePremiereXml(project, clip);
    downloadXmlFile(`${base}-premiere.xml`, xml);
  };

  const handleExportFcpxml = () => {
    if (!project) return;
    const base = getFilenameBase(project, clip);
    const xml = generateFcpxml(project, clip);
    downloadXmlFile(`${base}-fcp.fcpxml`, xml);
  };

  if (!isOpen) return null;

  const estimatedSizeMb = Math.round((duration * 0.45 * (resolution === '1080p' ? 1.5 : 0.9)) * 10) / 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-scrim select-none">
      <div className="relative w-full max-w-lg glass-float rounded-3xl overflow-hidden text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <FileVideo className="w-5 h-5 text-neutral-300" />
            <h3 className="text-base font-semibold text-white">Export Video</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* Export Settings Options */}
          {!isRendering && !renderSuccessMsg && (
            <>
              {/* Resolution selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                  Resolution
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setResolution('1080p')}
                    className={`p-3 rounded-xl border text-left transition ${
                      resolution === '1080p'
                        ? 'bg-white/[0.06] border-white/40 text-white shadow-sm ring-1 ring-white/20'
                        : 'bg-vc-canvas border-white/[0.08] text-neutral-400 hover:border-white/20 hover:text-neutral-200'
                    }`}
                  >
                    <div className="text-sm font-semibold">1080p Full HD</div>
                    <div className="text-xs text-neutral-500 mt-0.5">Recommended for TikTok, Shorts & Reels</div>
                  </button>

                  <button
                    onClick={() => setResolution('720p')}
                    className={`p-3 rounded-xl border text-left transition ${
                      resolution === '720p'
                        ? 'bg-white/[0.06] border-white/40 text-white shadow-sm ring-1 ring-white/20'
                        : 'bg-vc-canvas border-white/[0.08] text-neutral-400 hover:border-white/20 hover:text-neutral-200'
                    }`}
                  >
                    <div className="text-sm font-semibold">720p HD</div>
                    <div className="text-xs text-neutral-500 mt-0.5">Faster export, compact size</div>
                  </button>
                </div>
              </div>

              {/* Subtitle burn-in toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-vc-canvas ">
                <div>
                  <div className="text-sm font-medium text-white">Burn-in Subtitles</div>
                  <div className="text-xs text-neutral-400">Hardcode kinetic captions directly into the MP4 video</div>
                </div>
                <input
                  type="checkbox"
                  checked={burnCaptions}
                  onChange={(e) => setBurnCaptions(e.target.checked)}
                  className="w-4 h-4 rounded accent-white cursor-pointer"
                />
              </div>

              {/* Pro NLE Timeline XML Export Bridge */}
              {project && (
                <div className="p-3.5 rounded-xl bg-vc-canvas space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <FileCode className="w-4 h-4 text-neutral-300" />
                      <span className="text-xs font-semibold text-white">Pro NLE Timeline XML Export</span>
                    </div>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.08] text-white ">
                      PREMIERE / DAVINCI / FCP
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 leading-snug">
                    Download timeline XML containing all sliced cuts, ripple trims, and synced caption markers for Premiere Pro, DaVinci Resolve, or Final Cut Pro X.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleExportPremiereXml}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-vc-surface1 border border-white/[0.08] hover:border-white/20 hover:text-white text-neutral-300 text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5 text-neutral-300" />
                      <span>Premiere / DaVinci XML</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportFcpxml}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-vc-surface1 border border-white/[0.08] hover:border-white/20 hover:text-white text-neutral-300 text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5 text-zinc-300" />
                      <span>Final Cut Pro (.fcpxml)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Existing rendered version available */}
              {clip?.render_status === 'ready' && (
                <div className="p-3.5 rounded-xl bg-emerald-950/20 flex items-center justify-between gap-3">
                  <div className="text-left">
                    <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Ready to Download</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      Revision v{clip.render_version || 1} is already rendered.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadClip}
                    disabled={isDownloading}
                    className="px-3.5 py-1.5 rounded-full bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] hover:bg-vc-ai active:bg-violet-700 active:translate-y-px disabled:opacity-60 text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {isDownloading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download</span>
                  </button>
                </div>
              )}

              {/* Clip Specs Summary */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-vc-canvas text-xs text-center font-mono">
                <div>
                  <div className="text-neutral-500">Duration</div>
                  <div className="text-neutral-200 font-semibold mt-0.5">{duration.toFixed(1)}s</div>
                </div>
                <div>
                  <div className="text-neutral-500">Est. Size</div>
                  <div className="text-neutral-200 font-semibold mt-0.5">~{estimatedSizeMb} MB</div>
                </div>
                <div>
                  <div className="text-neutral-500">Format</div>
                  <div className="text-neutral-200 font-semibold mt-0.5">MP4 (H.264)</div>
                </div>
              </div>
            </>
          )}

          {/* Rendering Progress View */}
          {isRendering && (
            <div className="py-6 space-y-4 text-center">
              <Loader2 className="w-10 h-10 animate-spin text-neutral-300 mx-auto" />
              <div>
                <h4 className="text-sm font-semibold text-white">Rendering Video Export...</h4>
                <p className="text-xs text-neutral-400 mt-1 capitalize font-mono">
                  Stage: {renderStage.replace('_', ' ')}
                </p>
              </div>

              <div className="w-full bg-vc-canvas border border-white/[0.08] h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-white/80 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(5, renderProgress)}%` }}
                />
              </div>
              <div className="text-xs font-mono text-neutral-400">{renderProgress}% complete</div>
            </div>
          )}

          {/* Success Result View */}
          {renderSuccessMsg && !isRendering && (
            <div className="py-4 space-y-4 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <div>
                <h4 className="text-base font-semibold text-white">Export Ready!</h4>
                <p className="text-xs text-neutral-400 mt-1">{renderSuccessMsg}</p>
              </div>

              <div className="flex flex-col items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadClip}
                  disabled={isDownloading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] hover:bg-vc-ai active:bg-violet-700 active:translate-y-px disabled:opacity-60 disabled:cursor-not-allowed font-semibold text-sm transition cursor-pointer"
                >
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>{isDownloading ? 'Downloading Video...' : 'Download MP4 Video'}</span>
                </button>

                {resolvedDownloadUrl && (
                  <p className="text-[11px] text-neutral-400 mt-1">
                    If download doesn&apos;t start automatically,{' '}
                    <a
                      href={resolvedDownloadUrl}
                      download={resolvedFilename}
                      className="text-emerald-400 underline hover:text-emerald-300 font-medium cursor-pointer"
                    >
                      click here to download directly
                    </a>.
                  </p>
                )}

                {downloadError && (
                  <div className="p-2.5 text-xs text-rose-300 bg-rose-950/40 rounded-xl max-w-sm text-center">
                    {downloadError}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          {renderError && !isRendering && (
            <div className="p-3 rounded-xl bg-rose-950/50 text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{renderError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 bg-vc-surface1 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-neutral-200 hover:text-white border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:bg-white/[0.04] text-xs font-medium transition"
          >
            {renderSuccessMsg ? 'Close' : 'Cancel'}
          </button>

          {!isRendering && !renderSuccessMsg && (
            <button
              onClick={onTriggerRender}
              className="px-5 py-2 rounded-full bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] hover:bg-vc-ai active:bg-violet-700 active:translate-y-px text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Start Render</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
