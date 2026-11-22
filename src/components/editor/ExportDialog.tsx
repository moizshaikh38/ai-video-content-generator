import {initialExportResolution} from '../../../server/src/shared/initialExportResolution';
import { unassignedPanelViews } from '../../../server/src/shared/panelLayouts';
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
import { clipRenderService, type ExportResolution } from '../../services/clipRenderService';
import { triggerBrowserDownload } from '../../utils/downloadUtils';
import {
  generatePremiereXml,
  generateFcpxml,
  downloadXmlFile,
  getFilenameBase,
} from '../../utils/nleExport';

const RESOLUTION_OPTIONS: Array<{ value: ExportResolution; title: string; hint: string }> = [
  { value: '2160p', title: '4K Ultra HD', hint: '2160 short side. Sharpest, largest file' },
  { value: '1440p', title: '1440p QHD', hint: 'Sharper than Full HD, moderate size' },
  { value: '1080p', title: '1080p Full HD', hint: 'Recommended for TikTok, Shorts & Reels' },
  { value: '720p', title: '720p HD', hint: 'Faster export, compact size' },
];

interface ExportDialogProps {
  resolution?:ExportResolution;
  onResolutionChange?:(resolution:ExportResolution)=>void;
  hookControls?: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  clip?: RenderedClip | null;
  project?: EditorProject;
  duration: number;
  isRendering: boolean;
  renderProgress: number;
  renderStage: string;
  renderError: string | null;
  onResolveSavedRequest?: () => void;
  renderSuccessMsg: string | null;
  onTriggerRender: (resolution: ExportResolution) => void;
  downloadUrl?: string | null;
  watermarkRequired?: boolean;
  /** Current editor caption visibility - the burn-in checkbox reflects and
   * edits this, so export can never silently override editor captions-off. */
  captionsEnabled?: boolean;
  onToggleCaptions?: (enabled: boolean) => void;
  /** True when editor export settings changed after the last render; the
   * previously rendered file must not be offered as the changed export. */
  downloadStale?: boolean;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({
  resolution:controlledResolution,
  onResolutionChange,
  isOpen,
  onClose,
  clip,
  project,
  duration,
  isRendering,
  renderProgress,
  renderStage,
  renderError,
  onResolveSavedRequest,
  renderSuccessMsg,
  onTriggerRender,
  downloadUrl,
  watermarkRequired = false,
  captionsEnabled = true,
  onToggleCaptions,
  downloadStale = false,
  hookControls,
}) => {
  const [localResolution, setLocalResolution] = useState<ExportResolution>(() => initialExportResolution(clip));
  const resolution=controlledResolution??localResolution;
  const setResolution=(value:ExportResolution)=>{setLocalResolution(value);onResolutionChange?.(value);};
  const unassignedViews = project ? unassignedPanelViews(project) : [];
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [resolvedDownloadUrl, setResolvedDownloadUrl] = useState<string | null>(null);
  const [resolvedFilename, setResolvedFilename] = useState<string>('clip.mp4');

  // A stale render must not be offered as the changed export: drop the
  // pre-fetched signed URL while export settings differ from the last render.
  useEffect(() => {
    if (downloadStale) setResolvedDownloadUrl(null);
  }, [downloadStale]);

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
    if (unassignedViews.length > 0 || downloadStale) return;
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
    if (!project || unassignedViews.length > 0) return;
    const base = getFilenameBase(project, clip);
    const xml = generatePremiereXml(project, clip);
    downloadXmlFile(`${base}-premiere.xml`, xml);
  };

  const handleExportFcpxml = () => {
    if (!project || unassignedViews.length > 0) return;
    const base = getFilenameBase(project, clip);
    const xml = generateFcpxml(project, clip);
    downloadXmlFile(`${base}-fcp.fcpxml`, xml);
  };

  if (!isOpen) return null;

  // Rough MB per second by tier at the render CRF (social-content footage).
  const sizePerSec: Record<ExportResolution, number> = { '720p': 0.4, '1080p': 0.68, '1440p': 1.2, '2160p': 2.6 };
  const estimatedSizeMb = Math.round(duration * sizePerSec[resolution] * 10) / 10;
  const renderedMatches = Boolean(clip?.render_output_width) && clip?.render_resolution_requested === resolution;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 glass-scrim select-none">
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col glass-float rounded-3xl overflow-hidden text-neutral-200">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <FileVideo className="w-5 h-5 text-neutral-300" />
            <h3 className="text-base font-semibold text-white">Export Video</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close export dialog"
            className="p-1 max-md:p-2.5 short:p-2.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 md:p-6 space-y-5 flex-1 min-h-0 overflow-y-auto">
          {/* Export Settings Options */}
          {!isRendering && !renderSuccessMsg && (
            <>
              {/* Resolution selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                  Resolution
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {RESOLUTION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setResolution(opt.value)}
                      className={`p-3 rounded-xl border text-left transition ${
                        resolution === opt.value
                          ? 'bg-white/[0.06] border-white/40 text-white shadow-sm ring-1 ring-white/20'
                          : 'bg-vc-canvas border-white/[0.08] text-neutral-400 hover:border-white/20 hover:text-neutral-200'
                      }`}
                    >
                      <div className="text-sm font-semibold">{opt.title}</div>
                      <div className="text-xs text-neutral-500 mt-0.5">{opt.hint}</div>
                    </button>
                  ))}
                </div>
                {(resolution === '1440p' || resolution === '2160p') && (
                  <p className="text-[11px] text-neutral-400 mt-2 leading-snug">
                    Always renders at the size you pick. If your source video has fewer pixels than that, the file is
                    enlarged (bigger, not sharper); the result below shows the exact enlargement factor. Larger files take longer.
                  </p>
                )}
                {renderedMatches && clip?.render_resolution_note && (
                  <p className="text-[11px] text-amber-200/90 mt-1 leading-snug">{clip.render_resolution_note}</p>
                )}
                {renderedMatches && clip?.render_output_width && clip?.render_output_height && (
                  <p className="text-[11px] text-neutral-300 mt-2 font-mono">
                    Last render: {clip.render_output_width}x{clip.render_output_height}
                    {clip.render_upscale_factor ? ` (${clip.render_upscale_factor.toFixed(2)}x from source crop)` : ''}
                  </p>
                )}
              </div>

              {hookControls}

              {/* Subtitle burn-in toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-vc-canvas ">
                <div>
                  <div className="text-sm font-medium text-white">Burn-in Subtitles</div>
                  <div className="text-xs text-neutral-400">Hardcode captions directly into the MP4 video (same as the editor captions toggle)</div>
                </div>
                <input
                  type="checkbox"
                  checked={captionsEnabled}
                  onChange={(e) => onToggleCaptions?.(e.target.checked)}
                  disabled={!onToggleCaptions}
                  className="w-5 h-5 shrink-0 rounded accent-white cursor-pointer disabled:opacity-50"
                />
              </div>

              {watermarkRequired && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-950/30 border border-amber-800/40">
                  <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-200/90 leading-snug">
                    Exports on your current plan include a VireoClip watermark.
                  </p>
                </div>
              )}

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
                      disabled={unassignedViews.length > 0}
                      onClick={handleExportPremiereXml}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-vc-surface1 border border-white/[0.08] hover:border-white/20 hover:text-white text-neutral-300 text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5 text-neutral-300" />
                      <span>Premiere / DaVinci XML</span>
                    </button>
                    <button
                      type="button"
                      disabled={unassignedViews.length > 0}
                      onClick={handleExportFcpxml}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-vc-surface1 border border-white/[0.08] hover:border-white/20 hover:text-white text-neutral-300 text-xs font-medium transition flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
                    >
                      <Download className="w-3.5 h-3.5 text-zinc-300" />
                      <span>Final Cut Pro (.fcpxml)</span>
                    </button>
                  </div>
                </div>
              )}

              {downloadStale && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200/90 leading-snug">
                  Export settings changed since the last render. Start Render again to download an updated video.
                </div>
              )}

              {clip?.render_status === 'ready' && !downloadStale && clip.encoded_audio_review?.status !== 'muted' && (
                <div role="status" data-testid="encoded-audio-review" className="p-3 rounded-xl border border-amber-800/40 bg-amber-950/20 text-[11px] text-amber-100 leading-snug space-y-1">
                  <p className="font-semibold">{clip.encoded_audio_review?.status === 'needs_review'
                    ? 'Audio needs review' : clip.encoded_audio_review?.status === 'measured'
                      ? 'Encoded audio measured' : 'Audio measurements unavailable'}</p>
                  {typeof clip.encoded_audio_review?.integrated_lufs === 'number' && Number.isFinite(clip.encoded_audio_review.integrated_lufs) &&
                    typeof clip.encoded_audio_review.true_peak_dbtp === 'number' && Number.isFinite(clip.encoded_audio_review.true_peak_dbtp) && <p>
                      {clip.encoded_audio_review.integrated_lufs.toFixed(1)} LUFS · {clip.encoded_audio_review.true_peak_dbtp.toFixed(1)} dBTP
                    </p>}
                  {clip.encoded_audio_review?.issues.includes('true_peak_above_zero') && <p>The encoded true peak reaches or exceeds 0 dBTP. Review the level before publishing.</p>}
                  <p>Listen to speech, music balance and cuts before publishing. Measurements do not verify listening quality.</p>
                </div>
              )}

              {/* Existing rendered version available */}
              {clip?.render_status === 'ready' && !downloadStale && unassignedViews.length === 0 && (
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
          {renderSuccessMsg && !isRendering && !downloadStale && unassignedViews.length === 0 && (
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
          {unassignedViews.length > 0 && (
            <div role="alert" className="mb-3 p-3 rounded-xl bg-amber-500/10 text-amber-300 text-sm">
              Set every panel view before exporting ({unassignedViews.length} unassigned). Open each scene, use its Panel buttons to review the source crop, then Apply each view.
            </div>
          )}
          {renderError && !isRendering && (
            <div className="p-3 rounded-xl bg-rose-950/50 text-xs text-rose-300 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p>{renderError}</p>
                {onResolveSavedRequest && (
                  <div className="mt-3">
                    <button type="button" onClick={onResolveSavedRequest} className="rounded-lg border border-rose-300/30 px-3 py-2 text-xs font-medium text-rose-100 hover:bg-rose-300/10">
                      Resolve saved request
                    </button>
                    <p className="mt-2 text-[11px] leading-relaxed text-rose-300/80">Recover a queued render, or close an unqueued request. This does not cancel a queued render or start a new one.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-2 px-4 md:px-6 py-3 md:py-4 bg-vc-surface1 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.10] text-neutral-200 hover:text-white border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:bg-white/[0.04] text-xs font-medium transition"
          >
            {renderSuccessMsg ? 'Close' : 'Cancel'}
          </button>

          {!isRendering && (!renderSuccessMsg || downloadStale) && (
            <button
              disabled={isRendering || unassignedViews.length > 0}
              onClick={() => onTriggerRender(resolution)}
              className="disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2 rounded-full bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] hover:bg-vc-ai active:bg-violet-700 active:translate-y-px text-xs font-semibold flex items-center gap-1.5 transition"
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
