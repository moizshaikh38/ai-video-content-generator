import {sourceTextReviewNotice,type SourceTextReviewNotice} from '../shared/sourceTextReviewNotice.js';
import { explicitCropScaleUpdate } from '../shared/explicitCropScaleUpdate.js';
import {completePendingHookInitialization,recoverPendingHookCompletion} from '../db/repositories/pendingHookInitializationRepository.js';
import {nonPortraitAutoFullSourceFit} from '../shared/nonPortraitAutoFit.js';
import {automaticHeadlineText} from '../shared/autoHookTitle.js';
import {BurnedSubtitleService} from './burnedSubtitleService.js';
import {supervisedExecFile} from './queue/supervisedExecFile.js';
import {renewRenderLeaseForCv} from './queue/renderLeaseClaim.js';
import {runsBackgroundWorkers,hostRenderCapacity,ffmpegThreadArgs,ffmpegEncoderThreadArgs} from './runtimePolicy.js';
import type {RenderQuotaPolicy} from '../db/repositories/renderQuotaRepository.js';
import {enforceSavedRenderFreshness} from './renderFreshnessGuard.js';
import {assertRenderAssetOwnership} from '../utils/renderAssetOwnership.js';
import {workLifecycle} from './queue/workLifecycle.js';
import {verifiedCaptionAssPath} from '../shared/captionBurnInArtifact.js';
import {syncClipEditorRevision} from '../db/repositories/editorRevisionRepository.js';
import {editorRenderSnapshot,type EditorRenderSnapshot} from '../shared/editorRenderSnapshot.js';
import { validateOutputFile } from '../shared/outputValidation.js';
import {quickCaptionWindows} from '../shared/sceneCaptionPlacement.js';
import {primaryVisibleVideoItems,usesGeneratedSliceGraph} from '../shared/primaryVideoItems.js';
import {singleItemSourceWindow} from '../shared/automaticSourceClock.js';
import {resolveMeasuredItemPlan} from './itemShotPlanService.js';
import {prepareSliceRender} from './sliceRenderPreparation.js';
import {sourceObjectReceiptMatches,type SourceObjectReceipt} from '../shared/sourceObjectReceipt.js';
import {reviewEncodedAudio} from './encodedAudioReviewService.js';
import {assertSelectionSourceCurrent} from './selectionSourceGuardService.js';

import {shotPlanOptions} from '../shared/shotPlanOptions.js';
import {candidateCompositionOptions} from '../shared/automaticLayoutCandidate.js';
import {legacyFit43Plan,legacyPolicyFallback} from '../shared/automaticLayoutPolicy.js';
import {storedScenePlanWindow} from '../shared/storedScenePlanWindow.js';
import {expandSceneLayoutProject} from '../shared/sceneLayoutOverrides.js';
import { resolveCaptionPreset } from '../shared/captionPresets.js';
import { clampCaptionFontSize } from '../shared/captionPresets.js';
import { assFontsDirArg } from './editorFontFiles.js';
import { canvasDims, parseRenderResolution, resolveEffectiveResolution, type EffectiveResolution } from '../shared/renderResolution.js';
import type {CandidateCreationPreparation} from '../db/repositories/clipRepository.js';
import { createClipWithJob } from '../db/repositories/clipRepository.js';
import { isMongoConfigured, getMongoDb, getMongoClient } from '../db/mongoClient.js';
import {renderRetryBudget} from '../shared/renderRetryBudget.js';
import {claimOwnerFairRenderLease as claimRenderLease,nextOwnerFairRenderJob} from './queue/ownerFairRenderQueue.js';
import {notifyRenderCapacityAvailable} from './queue/renderCapacitySignal.js';
import {recoverRenderQueue} from './queue/renderQueueRecovery.js';
import {failQueuedRenderJob, queuedRenderSnapshotFilter} from './queue/renderPreleaseOutcome.js';
import {commitFencedRenderOutcome} from './queue/renderLeaseCommit.js';
import {commitUploadedRenderOutcome} from './queue/renderUploadedCommit.js';
import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import { getRenderFfmpeg } from '../utils/drawtextFfmpeg.js';
import { clipObjectPrefix, deletePrefix, downloadObjectToFile, headObject, computeFileStreamSha256, renderAttemptObjectKey, signObjectGet, uploadFile } from './objectStorageService.js';
import { deleteClipRecords } from '../db/repositories/deletionRepository.js';
import { admitClipDeletion } from './deletionAdmissionService.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  ClipRecord,
  EditorTrackItem,
  RenderJobRecord,
  ClipAspectRatio,
  ClipCropMode,
  CropMode,
  CaptionStyle,
  CaptionPosition,
  CropConfig,
  OverlayConfig,
  CaptionConfig,
  ClipEditorUpdateDTO,
  AppError,
  isValidUUID,
  ReframeKeyframe,
  ReframeLayoutMode,
  QuickClipMusicConfig,
} from '../types/index.js';
import { CaptionService } from './captionService.js';
import { ALL_CAPTION_STYLES, CAPTION_PRESET_IDS, isCaptionPresetId, sanitizePresetOverrides } from '../shared/captionPresets.js';
import { SmartReframeService, activeReframeAnalysisSet } from './smartReframeService.js';
import { JobReliabilityService } from './queue/jobReliabilityService.js';
import { ProEditorService } from './proEditorService.js';
import { AudioDuckingService } from './audioDuckingService.js';
import { FilterGraphBuilder } from './ffmpeg/filterGraphBuilder.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ClipPosterService } from './clipPosterService.js';
import { WatermarkService } from './watermarkService.js';
import { EntitlementService } from './entitlementService.js';
import { HardwareEncoderService } from './hardwareEncoderService.js';

const execFileAsync = promisify(execFile);

/**
 * drawtext (watermark, headline and text overlays) needs libfreetype, which
 * the bundled ffmpeg-static build lacks; renders under it fail with ffmpeg's
 * opaque "Error opening output files: Filter not found". getRenderFfmpeg is
 * the single resolution every fluent-ffmpeg configuration in this process
 * must share: setFfmpegPath writes a process-wide module cache, so any
 * module pinning a different binary (e.g. ffmpeg-static) at import time
 * silently overrides the render binary for the whole process.
 */
const ffmpegBin = getRenderFfmpeg();

// Configure fluent-ffmpeg to use the same resolved binary
if (ffmpegBin) {
  ffmpeg.setFfmpegPath(ffmpegBin);
}

// In-memory set to prevent duplicate simultaneous render jobs for the same clip
export const activeRenderSet = new Set<string>();

// CPU-bound FFmpeg renders must not run unbounded inside the web process.
// Inline (request-triggered) launches defer to the background sweep once the
// per-process cap is reached; the job stays 'queued' and is picked up later.
export function maxConcurrentRenders(): number {
  return hostRenderCapacity(renderOccupancy());
}

// Admission slots are reserved synchronously, BEFORE any await, by every path that
// starts a render (inline launch and background sweep). activeRenderSet only fills
// after renderClipJob's first awaits (clip fetch, Mongo lease claim), so counting it
// alone let two launches in the same tick both pass the cap, and the sweep never
// checked the cap at all. A slot is always released in a finally.
const reservedRenderSlots = new Set<string>();
const leasedRenderSlots = new Set<string>();
// Never free local capacity on an unverified process stop. Supervisor recovery
// must prove exit before a restart/recovery plan can clear this quarantine.
const quarantinedRenderSlots = new Set<string>();
export function quarantineRenderSlot(clipId:string){quarantinedRenderSlots.add(clipId);}

/** Clip ids that hold a slot, either reserved by a launcher or actively rendering. */
function occupiedRenderClipIds(): string[] {
  return Array.from(new Set<string>([...reservedRenderSlots, ...activeRenderSet,...quarantinedRenderSlots]));
}

export function renderOccupancy(): number {
  return occupiedRenderClipIds().length;
}

/**
 * Reserves one render slot for a clip. Returns false (and reserves nothing) when the
 * clip already holds a slot or the cap is reached. `cap` is injectable for tests.
 */
export function tryReserveRenderSlot(clipId: string, cap: number = maxConcurrentRenders()): boolean {
  if (workLifecycle.isDraining() || reservedRenderSlots.has(clipId) || activeRenderSet.has(clipId)) return false;
  if (renderOccupancy() >= cap) return false;
  reservedRenderSlots.add(clipId);
  return true;
}

export function releaseRenderSlot(clipId: string, requestDrain = true): void {
  if(quarantinedRenderSlots.has(clipId))return;
  const acquired=leasedRenderSlots.delete(clipId);
  if(reservedRenderSlots.delete(clipId)&&(requestDrain||acquired)&&!workLifecycle.isDraining())notifyRenderCapacityAvailable();
}

export function shouldLaunchInlineRender(): boolean {
  return runsBackgroundWorkers() && !workLifecycle.isDraining() && renderOccupancy() < maxConcurrentRenders();
}

/**
 * Fires an inline render only when the per-process concurrency cap allows it.
 * When deferred, the job stays 'queued' in render_jobs and the background sweep
 * started in index.ts picks it up.
 */
export function launchInlineRender(clipId: string, userId: string, jobId: string | undefined): boolean {
  if(!runsBackgroundWorkers())return false;
  if (!tryReserveRenderSlot(clipId)) {
    logger.warn(`[ClipRender] Inline render deferred to background sweep for clip ${clipId} (concurrency cap ${maxConcurrentRenders()} reached or clip already holds a slot)`);
    return false;
  }
  try {
    ownerContext.run(userId, () => {
      void workLifecycle.run('inline-render-slot',async()=>{
        try{await ClipRenderService.renderClipJob(clipId,userId,jobId);}
        catch(renderErr){logger.error('Background clip rendering caught top-level error',{clipId,error:renderErr instanceof Error?renderErr.message:String(renderErr)});}
        finally{releaseRenderSlot(clipId);}
      }).catch(launchErr=>{releaseRenderSlot(clipId);logger.warn('Inline render stopped before admission',{clipId,error:String(launchErr)});});
    });
  } catch (launchErr) {
    releaseRenderSlot(clipId);
    throw launchErr;
  }
  return true;
}

export interface CreateClipResult {
  creationId?:string;
  preparation?:string;
  replayed?:boolean;
  clip: ClipRecord;
  renderJob: RenderJobRecord;
}

export interface SignedUrlResult {
  signedUrl: string;
  filename?: string;
  expiresInSeconds: number;
}

export interface QuickClipAudioGraph {
  hasBackgroundMusic: boolean;
  musicPath?: string;
  inputArgs: string[];
  filterComplex: string[];
  audioMap: string;
}

/**
 * Checks if a clip is currently rendering in-memory
 */
export function isClipRenderActive(clipId: string): boolean {
  return activeRenderSet.has(clipId) || reservedRenderSlots.has(clipId);
}

/**
 * Sanitizes a title string into a safe, valid filename without special characters
 */
export function sanitizeFilename(name: string): string {
  const sanitized = name
    .replace(/\.\.+/g, '')
    .replace(/[^\w\s.-]/gi, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80);
  return sanitized || 'clip';
}

/**
 * Generates the FFmpeg video filter string for scaling and center/manual cropping
 * to the requested target aspect ratio without distortion.
 */
/**
 * Composes the quick-render video filter chain for ffmpeg execution.
 * Simple chains (no link labels) run under -vf via fluent-ffmpeg videoFilters.
 * Labeled layout graphs (screencast/split outputs of SmartReframeService.buildLayoutCropFilter)
 * cannot go through -vf: labels require -filter_complex with an explicit [0:v] input
 * pad and a labeled [out_v] final output. Previously both were fed to -vf verbatim,
 * which made every smart render resolving to a labeled layout fail permanently.
 */
export function composeQuickVideoGraph(videoFilters: string[]): { graph: string; labeled: boolean } {
  const chain = videoFilters.join(',');
  if (!chain.includes('[')) {
    return { graph: `[0:v]${chain}[out_v]`, labeled: false };
  }
  let stripped = chain.startsWith('[0:v]') ? chain.slice('[0:v]'.length) : chain;
  // Layout builders terminate their graph with a labeled [out] link; leaving it labeled
  // when more filters follow makes ffmpeg reject the graph (labeled link unused). Unlabel
  // it so the trailing simple filters (captions, watermark) auto-chain from it.
  stripped = stripped.replace(/\[out\](?=,|$)/g, '');
  return { graph: `[0:v]${stripped}[out_v]`, labeled: true };
}

export function buildCropFilter(
  aspectRatio: ClipAspectRatio = '9:16',
  cropConfig?: { focusX?: number; focusY?: number; scale?: number },
  canvasScale = 1
): string {
  const fx = Math.min(1.0, Math.max(0.0, Number(cropConfig?.focusX ?? 0.5)));
  const fy = Math.min(1.0, Math.max(0.0, Number(cropConfig?.focusY ?? 0.5)));
  // Zoom factor: 1 = cover window fills the frame, >1 crops a smaller window
  // around the focus and scales it back up (single-pass to avoid double blur).
  const zoom = Math.min(4.0, Math.max(1.0, Number(cropConfig?.scale ?? 1)));
  const { width: ow, height: oh } = canvasDims(aspectRatio, canvasScale);
  const arW = aspectRatio === '16:9' ? 16 : aspectRatio === '1:1' ? 1 : 9;
  const arH = aspectRatio === '16:9' ? 9 : aspectRatio === '1:1' ? 1 : 16;

  if (zoom > 1) {
    return (
      `crop=w='min(iw,ih*${arW}/${arH})/${zoom}':h='min(ih,iw*${arH}/${arW})/${zoom}'` +
      `:x='(in_w-out_w)*${fx}':y='(in_h-out_h)*${fy}',scale=${ow}:${oh}`
    );
  }

  const base = `scale=${ow}:${oh}:force_original_aspect_ratio=increase,crop=${ow}:${oh}`;
  // Default focus is the canonical center-crop filter.
  if (fx === 0.5 && fy === 0.5) return base;
  // Manual framing crop using exact clamped focus offsets
  return `${base}:(in_w-out_w)*${fx}:(in_h-out_h)*${fy}`;
}

/**
 * Builds a letterbox "fit" filter: whole frame visible, black bars to fill the
 * target canvas. Mirrors the studio preview's fit mode so export matches it.
 */
export function buildFitFilter(
  aspectRatio: ClipAspectRatio = '9:16',
  zoom: number = 1,
  focusX: number = 0.5,
  focusY: number = 0.5,
  canvasScale: number = 1
): string {
  const cd = canvasDims(aspectRatio, canvasScale);
  const ar = { w: cd.width, h: cd.height };
  const z = Math.min(4, Math.max(1, Number(zoom) || 1));
  if (z <= 1) {
    return `scale=${ar.w}:${ar.h}:force_original_aspect_ratio=decrease,pad=${ar.w}:${ar.h}:(ow-iw)/2:(oh-ih)/2:color=black`;
  }
  // Zoom within fit: scale the contained frame by z around the focus point,
  // pad back up to at least the frame size, then crop the frame window.
  return (
    `scale=${ar.w}:${ar.h}:force_original_aspect_ratio=decrease` +
    `,scale=trunc(iw*${z}/2)*2:trunc(ih*${z}/2)*2` +
    `,pad='max(iw,${ar.w})':'max(ih,${ar.h})':(ow-iw)/2:(oh-ih)/2:color=black` +
    `,crop=${ar.w}:${ar.h}:x='(in_w-${ar.w})*${focusX}':y='(in_h-${ar.h})*${focusY}'`
  );
}

/**
 * Chain-safe blurred-background fill ("Fit with Blur") for the pro editor
 * compiler. Unlike SmartReframeService.buildBlurBackgroundFilter (labeled
 * [0:v]...[out] form), this returns a fragment that drops into the middle of a
 * comma-joined slice chain: it consumes the incoming stream with split and
 * ends on an unlabeled overlay output, so callers can keep appending filters.
 * `tag` must be unique per graph (slice labels collide otherwise).
 */
export function buildBlurFitChain(
  aspectRatio: ClipAspectRatio = '9:16',
  zoom: number = 1,
  tag: string = 'vcb',
  canvasScale: number = 1,
  focusX: number = 0.5,
  focusY: number = 0.5
): string {
  const cd = canvasDims(aspectRatio, canvasScale);
  const ar = { w: cd.width, h: cd.height };
  const z = Math.min(4, Math.max(1, Number(zoom) || 1));
  // Contain on BOTH axes before zoom. Width-only scaling cuts tall sources.
  const zoomFilter = z > 1 ? `,scale=trunc(iw*${z}/2)*2:trunc(ih*${z}/2)*2` : '';
  const focus = (v: number) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5;
  const axis = (upper: string, lower: string, v: number) => focus(v) === 0.5 ? `(${upper}-${lower})/2` : `(${upper}-${lower})*${focus(v)}`;
  return (
    `split=2[${tag}_bgs][${tag}_fgs];` +
    `[${tag}_bgs]scale=${ar.w}:${ar.h}:force_original_aspect_ratio=increase,crop=${ar.w}:${ar.h},boxblur=${Math.round(25 * canvasScale)}:5,eq=brightness=-0.15:contrast=0.95[${tag}_bg];` +
    `[${tag}_fgs]scale=${ar.w}:${ar.h}:force_original_aspect_ratio=decrease${zoomFilter}[${tag}_fg];` +
    `[${tag}_bg][${tag}_fg]overlay=${axis('W', 'w', focusX)}:${axis('H', 'h', focusY)}`
  );
}

export interface CanvasBackdropSpec {
  /** 'blur' = blurred copy of the source; 'color' = solid fill. */
  kind: 'blur' | 'color';
  /** #RRGGBB for kind 'color'. */
  color?: string;
  /** Inset of the video from every canvas edge, percent of canvas width (0-20). */
  spacingPct?: number;
  /** Video corner radius in output pixels (0-120). */
  cornerRadius?: number;
  /** When set (w/h, e.g. 4/3), the source is cover-cropped to this band before placement (Fit band). */
  bandAspect?: number;
  /** Crop focus 0-1 inside the source for the band crop. */
  focusX?: number;
  focusY?: number;
}

export function normalizeBackdropHex(input: unknown, fallback = '000000'): string {
  const m = String(input ?? '').trim().replace(/^#/, '');
  return /^[0-9a-fA-F]{6}$/.test(m) ? m.toUpperCase() : fallback;
}

/**
 * Chain-safe backdrop layout used by the pro editor for the Background panel:
 * the whole frame is scaled to fit inside a spaced inset, optionally rounded,
 * and composited over a blurred copy of the source or a solid colour. Callers
 * keep legacy filters when spacing and radius are both 0 (see proEditorService).
 */
export function buildBackdropFitChain(
  aspectRatio: ClipAspectRatio = '9:16',
  zoom: number = 1,
  spec: CanvasBackdropSpec,
  tag: string = 'vcd',
  /** Output scale vs the 1080-based canvas (1 = 1080p, 2 = 4K-class). Geometry, radius and blur scale with it. */
  canvasScale: number = 1
): string {
  const cs = Math.min(4, Math.max(0.25, Number(canvasScale) || 1));
  const base = aspectRatio === '16:9' ? { w: 1920, h: 1080 } : aspectRatio === '1:1' ? { w: 1080, h: 1080 } : { w: 1080, h: 1920 };
  const ar = { w: Math.round(base.w * cs / 2) * 2, h: Math.round(base.h * cs / 2) * 2 };
  const z = Math.min(4, Math.max(1, Number(zoom) || 1));
  const space = Math.round((ar.w * Math.min(20, Math.max(0, Number(spec.spacingPct) || 0))) / 100 / 2) * 2;
  const radius = Math.round(Math.min(120, Math.max(0, Number(spec.cornerRadius) || 0)) * cs);
  const boxW = Math.max(2, ar.w - 2 * space);
  const boxH = Math.max(2, ar.h - 2 * space);
  const fgW = Math.max(2, Math.round((boxW * z) / 2) * 2);
  const bg = spec.kind === 'color'
    ? `scale=${ar.w}:${ar.h},drawbox=x=0:y=0:w=${ar.w}:h=${ar.h}:color=0x${normalizeBackdropHex(spec.color)}:t=fill`
    : `scale=${ar.w}:${ar.h}:force_original_aspect_ratio=increase,crop=${ar.w}:${ar.h},boxblur=${Math.round(25 * cs)}:5,eq=brightness=-0.15:contrast=0.95`;
  // Zoom the contained frame, not the inset width, so tall sources do not jump to width-fit.
  const zoomFilter = z > 1 ? `,scale=trunc(iw*${z}/2)*2:trunc(ih*${z}/2)*2` : '';
  const fgScale = `scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease${zoomFilter}`;
  let fg = `${fgScale}`;
  if (spec.bandAspect && spec.bandAspect > 0) {
    const B = Number(spec.bandAspect).toFixed(5);
    const fx = Math.min(1, Math.max(0, Number(spec.focusX ?? 0.5))).toFixed(4);
    const fy = Math.min(1, Math.max(0, Number(spec.focusY ?? 0.5))).toFixed(4);
    const bandH = Math.max(2, Math.round(fgW / spec.bandAspect / 2) * 2);
    fg = `crop=w='min(iw,ih*${B})':h='min(ih,iw/${B})':x='(iw-ow)*${fx}':y='(ih-oh)*${fy}',scale=${fgW}:${bandH}`;
  }
  if (radius > 0) {
    const r = radius;
    fg += `,format=yuva420p,geq=lum='p(X,Y)':cb='p(X,Y)':cr='p(X,Y)':a='if(gt(max(abs(X+0.5-W/2)-(W/2-${r}),0)*max(abs(X+0.5-W/2)-(W/2-${r}),0)+max(abs(Y+0.5-H/2)-(H/2-${r}),0)*max(abs(Y+0.5-H/2)-(H/2-${r}),0),${r}*${r}),0,255)'`;
  }
  return (
    `split=2[${tag}_bgs][${tag}_fgs];` +
    `[${tag}_bgs]${bg}[${tag}_bg];` +
    `[${tag}_fgs]${fg}[${tag}_fg];` +
    `[${tag}_bg][${tag}_fg]overlay=(W-w)/2:(H-h)/2:format=auto`
  );
}

/**
 * Builds an FFmpeg dynamic crop filter graph expression for smart auto-reframe
 */
export function buildSmartCropFilter(
  keyframes: ReframeKeyframe[],
  aspectRatio: ClipAspectRatio = '9:16',
  sourceWidth = 1920,
  sourceHeight = 1080,
  duration = 30.0
): string {
  return SmartReframeService.buildSmartCropFilter(keyframes, aspectRatio, sourceWidth, sourceHeight, duration);
}

/**
 * Parses FFmpeg timemark strings (HH:MM:SS.ms) into total seconds
 */

export function parseTimemarkToSeconds(timemark: string): number {
  if (!timemark || typeof timemark !== 'string') return 0;
  const parts = timemark.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]) || 0;
    const minutes = parseFloat(parts[1]) || 0;
    const seconds = parseFloat(parts[2]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return parseFloat(timemark) || 0;
}

export class ClipRenderService {
  /**
   * Creates a new clip record grounded strictly in an existing AI candidate,
   * creates an initial render_jobs row, and triggers async rendering.
   */
  public static async createClipFromCandidate(
    projectId: string,
    userId: string,
    candidateId: string,
    aspectRatio: ClipAspectRatio = '9:16',
    cropMode: ClipCropMode = 'center',
    options?: { caption_enabled?: boolean; caption_style?: string; caption_config?: any },
    creation?:CandidateCreationPreparation,
    quotaPolicy?:RenderQuotaPolicy
  ): Promise<CreateClipResult> {
    if (!isMongoConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    if (!isValidUUID(projectId) || !isValidUUID(candidateId)) {
      const err = new Error('Valid UUIDs required for project and candidate.');
      (err as any).code = 'INVALID_UUID';
      throw err;
    }

    const validRatios: ClipAspectRatio[] = ['9:16', '1:1', '16:9'];
    const validAspectRatio = validRatios.includes(aspectRatio) ? aspectRatio : '9:16';
    const {data:candidateForSource,error:candidateReadError} = await dataRepository.from('clip_candidates').select('metadata').eq('id',candidateId).eq('project_id',projectId).eq('user_id',userId).maybeSingle();
    if(candidateReadError)throw new AppError('Clip candidate could not be read.',503,candidateReadError.code||'DATABASE_UNAVAILABLE');
    if(!candidateForSource)throw new AppError('Clip candidate not found.',404,'CANDIDATE_NOT_FOUND');
    await assertSelectionSourceCurrent(userId,projectId,candidateForSource?.metadata?.selection_source_receipt);
    const result = await createClipWithJob(projectId, candidateId, userId, validAspectRatio, cropMode, options,creation,quotaPolicy);
    const {clip,renderJob}=result;

    // 6. Launch in-process background rendering (deferred to the sweep when at cap)
    if(!result.replayed)launchInlineRender(clip.id, userId, renderJob.id);

    return {
      ...(creation?{creationId:creation.intent.id,preparation:creation.intent.preparation,replayed:result.replayed}:{}),
      clip: clip as ClipRecord,
      renderJob: renderJob as RenderJobRecord,
    };
  }

  /**
   * Puts a read-only working copy of a source video at targetLocalPath. A hard link is instant
   * where a full copy of a multi-GB source takes seconds; callers only read and then unlink the
   * target, which never touches the cached file. Falls back to a copy across filesystems.
   */
  private static placeSourceFile(sourcePath: string, targetLocalPath: string): void {
    try {
      fs.linkSync(sourcePath, targetLocalPath);
    } catch {
      fs.copyFileSync(sourcePath, targetLocalPath);
    }
  }

  /**
   * Resolves, caches, or downloads the source video to targetLocalPath.
   * 1. Checks if sourceStoragePath points to a valid local file on disk (absolute or repo-relative).
   * 2. Checks if the source is already cached in a shared project/source disk cache in os.tmpdir().
   * 3. Otherwise downloads from R2 with strict timeout protection and caches it atomically.
   */
  public static async ensureSourceVideo(
    sourceStoragePath: string | null | undefined,
    targetLocalPath: string,
    options: { timeoutMs?: number; projectId?: string; clipId?: string; snapshotOut?:{receipt?:SourceObjectReceipt} } = {}
  ): Promise<'local_fallback' | 'cache_hit' | 'downloaded'> {
    if (!sourceStoragePath) {
      throw new AppError('Source storage path is missing for clip.', 400, 'SOURCE_PATH_MISSING');
    }

    if(options.snapshotOut)delete options.snapshotOut.receipt;
    // 1. Local filesystem fallback check
    const candidatePaths = [
      sourceStoragePath,
      path.resolve(process.cwd(), sourceStoragePath),
      path.resolve(process.cwd(), '..', sourceStoragePath),
      path.resolve(process.cwd(), '../..', sourceStoragePath),
    ];

    for (const p of candidatePaths) {
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile() && fs.statSync(p).size > 0) {
          logger.info(`[ClipRender] Using local source video fallback: ${p}`);
          ClipRenderService.placeSourceFile(p, targetLocalPath);
          return 'local_fallback';
        }
      } catch {}
    }

    // 2. Shared Source Disk Cache Check
    const cacheDir = path.join(os.tmpdir(), 'vireo-source-cache');
    try {
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }
    } catch {}

    // A path identifies an object location, not immutable source bytes. Recheck
    // its validator before reusing disk cache; unversioned objects are fetched.
    const snapshot = await headObject('source',sourceStoragePath);
    const validator = snapshot.etag && !snapshot.etag.startsWith('W/') ? snapshot.etag : undefined;
    const hash = crypto.createHash('sha256').update(JSON.stringify([sourceStoragePath,validator || crypto.randomUUID(),snapshot.size])).digest('hex');
    const cachedFile = path.join(cacheDir, `${hash}.mp4`);

    try {
      if (validator && fs.existsSync(cachedFile) && fs.statSync(cachedFile).size === snapshot.size && snapshot.size > 0) {
        const receipt=JSON.parse(fs.readFileSync(cachedFile+'.receipt.json','utf8'));
        if(sourceObjectReceiptMatches(receipt,sourceStoragePath,snapshot,await computeFileStreamSha256(cachedFile))){
          logger.info(`[ClipRender] Reused cached source video: ${cachedFile}`);
          ClipRenderService.placeSourceFile(cachedFile, targetLocalPath);
          if(options.snapshotOut)options.snapshotOut.receipt=receipt;
          return 'cache_hit';
        }
      }
    } catch {}

    // 3. Strict Download from R2 with Timeout and Atomic Cache Placement
    const downloadTimeout = Math.max(options.timeoutMs || 120000, 120000);
    const stagingFile = path.join(cacheDir, `${hash}.tmp.${crypto.randomUUID()}`);

    try {
      const downloaded=await downloadObjectToFile('source', sourceStoragePath, stagingFile, { timeoutMs: downloadTimeout,requireSnapshotReceipt:true });
      const after = await headObject('source',sourceStoragePath);
      if (after.size !== snapshot.size || after.etag !== snapshot.etag || after.versionId !== snapshot.versionId) {
        throw new AppError('Source object changed while preparing the render. Retry with the current source.',409,'SOURCE_VERSION_CHANGED');
      }

      if (!fs.existsSync(stagingFile) || fs.statSync(stagingFile).size === 0) {
        throw new AppError('Downloaded source file is empty.', 500, 'EMPTY_SOURCE_FILE');
      }

      if (!validator) {
        ClipRenderService.placeSourceFile(stagingFile,targetLocalPath);
        fs.unlinkSync(stagingFile);
        return 'downloaded';
      }

      // Atomically move staging file into cache
      try {
        fs.renameSync(stagingFile, cachedFile);
      } catch {
        fs.copyFileSync(stagingFile, cachedFile);
        try { fs.unlinkSync(stagingFile); } catch {}
      }

      if(downloaded.sourceReceipt&&sourceObjectReceiptMatches(downloaded.sourceReceipt,sourceStoragePath,snapshot)){
        const receiptStage=cachedFile+'.receipt.'+crypto.randomUUID()+'.tmp';
        fs.writeFileSync(receiptStage,JSON.stringify(downloaded.sourceReceipt));
        fs.renameSync(receiptStage,cachedFile+'.receipt.json');
        if(options.snapshotOut)options.snapshotOut.receipt=downloaded.sourceReceipt;
      }
      ClipRenderService.placeSourceFile(cachedFile, targetLocalPath);
      logger.info(`[ClipRender] Downloaded and cached source video to ${cachedFile}`);
      return 'downloaded';
    } catch (err: any) {
      try {
        if (fs.existsSync(stagingFile)) fs.unlinkSync(stagingFile);
      } catch {}
      throw err;
    }
  }

  /**
   * Executes the real FFmpeg cut, reframe, encode, and storage upload pipeline.
   */
  public static async renderClipJob(clipId:string,userId:string,existingJobId?:string):Promise<void>{
    return workLifecycle.run('clip-render',()=>this.executeRenderClipJob(clipId,userId,existingJobId));
  }
  private static async executeRenderClipJob(
    clipId: string,
    userId: string,
    existingJobId?: string
  ): Promise<void> {
    if (activeRenderSet.has(clipId)) {
      const err = new Error('Render is already in progress for this clip.');
      (err as any).code = 'RENDER_ALREADY_ACTIVE';
      throw err;
    }

    // Execution is never admission. Every producer must commit a job first.
    if(!existingJobId||!isValidUUID(existingJobId))throw new AppError('A committed render job ID is required.',409,'RENDER_JOB_REQUIRED');

    // Fetch clip and verify ownership
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    // A failed read is not evidence that the clip was deleted. Preserve the
    // repository code so the sweep can use its bounded pre-lease retry path.
    if (clipErr) throw Object.assign(new Error(clipErr.message), { code: clipErr.code || 'DATABASE_UNAVAILABLE' });
    if (!clip) {
      const err = new Error('Clip not found or access denied.');
      (err as any).code = 'CLIP_NOT_FOUND';
      throw err;
    }

    if((clip as any).editor_project_sync_pending)throw new AppError('Editor save is incomplete. Save again before rendering.',409,'EDITOR_SYNC_PENDING');

    // Concurrency check on DB state (allow recovery if stuck > 15m)
    const isStale =
      Date.now() - new Date(clip.updated_at || clip.created_at).getTime() > 15 * 60 * 1000;
    if (['rendering', 'uploading'].includes(clip.render_status) && !isStale) {
      const err = new Error('Clip is currently being rendered. Please wait.');
      (err as any).code = 'RENDER_ALREADY_ACTIVE';
      throw err;
    }

    // Distributed worker and lease identification
    const workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
    const attemptId=crypto.randomUUID();
    const expectedClipVersion={renderVersion:Number(clip.render_version||1),editorVersion:Number(clip.editor_version||1)};
    const now = new Date();

    const jobId = existingJobId;
    const db = await getMongoDb();
    const renderJobsCol = db.collection('render_jobs');

    // Atomic distributed lease acquisition:
    // Claim only if queued OR processing with an expired stale lock
    const claim=await claimRenderLease(db,{jobId:jobId!,clipId,userId,workerId,...expectedClipVersion},now,await getMongoClient());
    // Inline launches and sweeps share ordering. An out-of-turn job remains
    // queued with no acquired attempt or pre-lease failure. Slot release nudges
    // the drain after this inline reservation is gone.
    if(claim?.status==='deferred'){logger.info(`[ClipRender] Fair queue deferred job ${jobId}`);return;}
    const claimedJob=claim?.status==='claimed'?claim.job:null;

    if (!claimedJob) {
      const currentJob = await renderJobsCol.findOne({ id: jobId,clip_id:clipId,user_id:userId });
      if (currentJob?.admission_version!=null && (currentJob.admission_version!==1 || currentJob.render_version!==expectedClipVersion.renderVersion || currentJob.editor_version!==expectedClipVersion.editorVersion)) {
        throw new AppError('Queued render inputs changed. Start a fresh render.',409,'RENDER_INPUT_CHANGED');
      }
      if (currentJob?.status === 'completed') {
        logger.info(`[ClipRender] Clip ${clipId} is already rendered and completed.`);
        return;
      }
      const err = new Error('Render is already in progress for this clip by another worker.');
      (err as any).code = 'RENDER_ALREADY_ACTIVE';
      throw err;
    }

    if(reservedRenderSlots.has(clipId))leasedRenderSlots.add(clipId);
    activeRenderSet.add(clipId);

    // Heartbeat timer to renew lease during long rendering operations
    const renderCancellation=new AbortController();
    const heartbeatTimer = setInterval(() => {void workLifecycle.run('render-heartbeat',async()=>{
      const renewed=await renewRenderLeaseForCv(db,{jobId:jobId!,clipId,userId,workerId},renderCancellation);
      if(!renewed)logger.warn('[ClipRender] Lease renewal unverified; supervised CV cancelled',{jobId});
    }).catch(error=>{renderCancellation.abort(Object.assign(Error('Render heartbeat stopped.'),{code:'FENCING_TOKEN_MISMATCH',cause:error}));});},15000);
    heartbeatTimer.unref();

    const uniqueTag = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const tempDir = path.join(os.tmpdir(), `vireo-render-${clipId}-${uniqueTag}`);

    let expectedEditorProject:EditorRenderSnapshot|null|undefined;
    try {
      await assertSelectionSourceCurrent(userId,clip.project_id,(clip as any).selection_source_receipt,clip.source_storage_path);
      fs.mkdirSync(tempDir, { recursive: true });

      // Update stage: downloading (5%)
      await ClipRenderService.updateJobStage(jobId, clipId, 'downloading', 5, 'rendering', workerId,expectedClipVersion);

      // 1. Download private source video
      const sourcePath = path.join(tempDir, 'source.mp4');
      const outputPath = path.join(tempDir, 'rendered.mp4');

      const timeoutMs = config.clipRenderTimeoutMs || 300000;

      logger.info(`[ClipRender] Downloading source video from Storage: ${clip.source_storage_path}`, {
        clipId,
        sourcePath: clip.source_storage_path,
      });

      const sourceSnapshot:{receipt?:SourceObjectReceipt}={};
      await ClipRenderService.ensureSourceVideo(clip.source_storage_path, sourcePath, {
        snapshotOut:sourceSnapshot,
        timeoutMs,
        projectId: clip.project_id,
        clipId,
      });

      const sourceSha256 = await computeFileStreamSha256(sourcePath);
      if (sourceSha256 !== (clip as any).selection_source_receipt?.source_receipt?.sha256) {
        throw new AppError('Downloaded source bytes do not match the source used for selection. Export stopped.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
      }

      // 2. FFmpeg cut, manual framing, ASS subtitles, text overlay, and MP4 encode
      await ClipRenderService.updateJobStage(jobId, clipId, 'cutting', 10, 'rendering', workerId,expectedClipVersion);

      const trimStart = Number(clip.trim_start_offset || 0);
      const trimEnd = Number(clip.trim_end_offset || 0);
      const startSec = Number(clip.start_seconds) + trimStart;
      const originalDuration = Number(clip.duration_seconds || (clip.end_seconds - clip.start_seconds));
      const durationSec = Math.max(0.1, Number((originalDuration - trimStart - trimEnd).toFixed(3)));

      // Speaker-following guarantee: generate the smart-reframe track on demand
      // so active-speaker framing works out of the box.
      await ClipRenderService.ensureReframeTrackAtRender(clip, sourcePath, jobId, sourceSha256, sourceSnapshot.receipt,workerId,expectedClipVersion,renderCancellation.signal);
      if(renderCancellation.signal.aborted)throw renderCancellation.signal.reason;
      if(config.pendingHookInitialization){
        const pending=await db.collection('pending_hook_initializations').findOne({clip_id:clipId,user_id:userId,state:{$in:['pending','completed']},job_id:jobId});
        if(pending){
          const baseline=await db.collection('editor_projects').findOne({clip_id:clipId,user_id:userId});
          let completion;
          if(pending.state==='completed')completion=await recoverPendingHookCompletion(await getMongoClient(),db,{userId,clipId,jobId:jobId!,workerId});
          else if(baseline){
            const track=await SmartReframeService.getReframeTrack(clipId,userId,sourceSha256,true);
            const review=ProEditorService.prepareFreshHookPictureBand(baseline as any,clip,track);
            completion=await completePendingHookInitialization(await getMongoClient(),db,{userId,clipId,jobId:jobId!,workerId,clip,baseline,review});
          }
          if(completion?.editorVersion){
            expectedClipVersion.editorVersion=completion.editorVersion;
            clip.editor_version=completion.editorVersion;
            claimedJob.editor_version=completion.editorVersion;
            claimedJob.editor_project_snapshot=completion.editorProject;
          }
        }
      }

      // Shared reframing decision (Quick path filter + Pro per-slice context).
      // Export resolution: requested tier from the clip (set by the export
      // dialog), lowered only when the source cannot carry it.
      const srcDims = await ClipRenderService.probeSourceDimensions(sourcePath);
      const resolution = resolveEffectiveResolution(
        parseRenderResolution((clip as any).render_resolution),
        clip.aspect_ratio as string,
        srcDims?.width,
        srcDims?.height
      );
      const canvasScale = resolution.scale;
      const outputCanvas = { width: resolution.width, height: resolution.height };
      let expectedCanvas = outputCanvas;
      logger.info(
        `[ClipRender] Resolution for clip ${clipId}: requested=${resolution.requested} effective=${resolution.effective} ` +
        `canvas=${outputCanvas.width}x${outputCanvas.height} source=${srcDims ? `${srcDims.width}x${srcDims.height}` : 'unknown'}` +
        (resolution.warning ? ` WARNING: ${resolution.warning}` : '')
      );
      // Source pixels can contain captions independently of the generated cue
      // layer. Record bounded evidence, never silently disable the user's style.
      const sourceSubtitleReview = await BurnedSubtitleService.reviewVideo({sourcePath,start:startSec,duration:durationSec,sourceSha256,tempDirectory:tempDir,sourceWidth:srcDims?.width,sourceHeight:srcDims?.height,signal:renderCancellation.signal});
      // Bind review to the same analysis bytes/span before preview/export plan
      // selection. Never attach it to another version or a differently trimmed source.
      await db.collection('reframe_tracks').updateMany({clip_id:clipId,user_id:userId,status:'ready',
        'metadata.analyzed_source_sha256':sourceSha256,'metadata.analyzed_source_start':startSec,
        'metadata.analyzed_source_end':Number((startSec+durationSec).toFixed(6))},
        {$set:{'metadata.source_subtitle_review':sourceSubtitleReview}});
      const reframeDecision = await ClipRenderService.resolveReframeDecision(clip, durationSec, canvasScale, sourceSha256, srcDims);
      const cropFilter = reframeDecision.cropFilter;
      const actualReframeMode = reframeDecision.mode;
      const reframeMetadata = {...reframeDecision.metadata,source_subtitle_review:sourceSubtitleReview};

      const videoFilters: string[] = [cropFilter];

      // Check if a multi-track EditorProject exists with custom pro edits (splits, cuts, B-roll, secondary audio, keyframes, text layers).
      // Loaded before headline/caption burn-in decisions because studio state
      // is authoritative for the opening headline once a project exists.
      let hasCustomProTracks = false;
      let editorProject: any = null;
      let editorProjectExists = false;
      let savedEditorProject:any=null;
      try {
        const { data: proj, error:projectReadError } = await dataRepository
          .from('editor_projects')
          .select('*')
          .eq('clip_id', clipId)
          .eq('user_id', userId)
          .maybeSingle();

        if(projectReadError)throw projectReadError;
        savedEditorProject=proj;
        expectedEditorProject=editorRenderSnapshot(proj);
        if(claimedJob.admission_version===1&&JSON.stringify(claimedJob.editor_project_snapshot)!==JSON.stringify(expectedEditorProject))throw new AppError('Saved editor changed after render admission. Start a fresh render.',409,'RENDER_INPUT_CHANGED');
        const bound=await db.collection('render_jobs').updateOne({id:jobId,clip_id:clipId,user_id:userId,worker_id:workerId,status:'processing'},{$set:{editor_project_snapshot:expectedEditorProject}});
        if(bound.matchedCount!==1)throw new AppError('Render lease was expired or claimed by another worker.',409,'FENCING_TOKEN_MISMATCH');
        if (proj && Array.isArray(proj.tracks)) {
          editorProjectExists = true;
          hasCustomProTracks = ClipRenderService.hasCustomProEdits(proj, clip);
          if (hasCustomProTracks) {
            editorProject = proj;
          }
        }
      } catch (err: any) {
        throw err;
      }

      // ASS Subtitles burn-in
      if (clip.caption_enabled !== false) {
        await ClipRenderService.updateJobStage(jobId, clipId, 'preparing_captions', 12, 'rendering',workerId,expectedClipVersion);
        const assPath = path.join(tempDir, 'subtitles.ass');
        try {
          // Blur-fit layouts letterbox the source; anchor bottom captions to
          // the sharp content band so they do not sit on the blurred fill.
          // Screencast inset modes with a blurred stage letterbox the main
          // content the same way; split_stacked has its own geometry.
          // The pro-graph blur fill (per-item crop.mode 'blur', set by the
          // editor Layout toggle / panel) letterboxes the sharp band over a
          // blurred background exactly like reframe 'blur' layouts, so its
          // captions need the same band anchor. reframeDecision only reflects
          // the clip-level crop_config channel and cannot see item.crop.
          const proPrimaryCropMode =
            hasCustomProTracks && editorProject
              ? (editorProject.tracks || [])
                  .filter((t: any) => t.type === 'VIDEO' && !t.hidden)
                  .flatMap((t: any) => t.items || [])
                  .find((i: any) => !i.hidden && !i.is_title_card)?.crop?.mode
              : undefined;
          let proBlurSourceWidth: number | undefined;
          let proBlurSourceHeight: number | undefined;
          if (editorProject && !reframeDecision.track) {
            const dimensions = await ClipRenderService.probeSourceDimensions(sourcePath);
            proBlurSourceWidth = dimensions?.width;
            proBlurSourceHeight = dimensions?.height;
          }
          const blurFitStage =
            reframeDecision.layoutMode === 'blur' ||
            proPrimaryCropMode === 'blur' ||
            (reframeDecision.layoutMode === 'screencast' &&
              clip.crop_config?.screencast?.background === 'blur' &&
              (clip.crop_config?.screencast?.mode === 'circular_inset' ||
                clip.crop_config?.screencast?.mode === 'rounded_card_inset'));
          const bandAnchorPositionY = blurFitStage
            ? CaptionService.computeBlurFitBandAnchor(
                clip.aspect_ratio as ClipAspectRatio,
                reframeDecision.track?.source_width ?? proBlurSourceWidth ?? undefined,
                reframeDecision.track?.source_height ?? proBlurSourceHeight ?? undefined
              )
            : undefined;
          // Speaker-split captions (OpenShorts): only in the two-speaker
          // split layout, with zones + followed-subject keyframes from the
          // smart-reframe track. Otherwise captions render unchanged.
          const splitZones =
            reframeDecision.layoutMode === 'split' && reframeDecision.track
              ? {
                  speaker1X: Number(
                    (reframeDecision.track.metadata as any)?.speaker1X ?? clip.crop_config?.split?.speaker1X
                  ),
                  speaker2X: Number(
                    (reframeDecision.track.metadata as any)?.speaker2X ?? clip.crop_config?.split?.speaker2X
                  ),
                }
              : null;
          const speakerSplit =
            splitZones &&
            Number.isFinite(splitZones.speaker1X) &&
            Number.isFinite(splitZones.speaker2X) &&
            Array.isArray(reframeDecision.track?.smoothed_keyframes) &&
            reframeDecision.track.smoothed_keyframes.length > 0
              ? {
                  keyframes: reframeDecision.track!.smoothed_keyframes.map((k: any) => ({
                    time: Number(k.time),
                    centerX: Number(k.centerX),
                  })),
                  speaker1X: splitZones.speaker1X,
                  speaker2X: splitZones.speaker2X,
                }
              : undefined;
          const captionResult = await CaptionService.generateCaptionsForClip({
            clip,
            editorProjectSnapshot:savedEditorProject,
            targetAspectRatio: clip.aspect_ratio as ClipAspectRatio,
            outputPath: assPath,
            bandAnchorPositionY,
            sourceWidth: reframeDecision.track?.source_width ?? proBlurSourceWidth,
            sourceHeight: reframeDecision.track?.source_height ?? proBlurSourceHeight,
            sceneLayoutFallback: reframeDecision.layoutMode,
            automaticSceneWindows: editorProject ? ProEditorService.captionSceneWindows(editorProject,{mode:reframeDecision.mode,layoutMode:reframeDecision.layoutMode,track:reframeDecision.track,clipStartSec:startSec,cropConfig:clip.crop_config,aspectRatio:clip.aspect_ratio,sourceSha256,sourceAssetId:clip.id,sourceStoragePath:clip.source_storage_path,decodedSource:srcDims,canvasScale}) : (reframeDecision.metadata as any)?.caption_windows,
            speakerSplit,
          });

          if (verifiedCaptionAssPath(captionResult,assPath)) {
            const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
            videoFilters.push(`ass=${safeAss}${assFontsDirArg()}`);
            logger.info(`[ClipRender] Burning ${captionResult.cues.length} caption cues using style "${clip.caption_style || 'clean'}"`);
          }
        } catch (capErr: any) {
          // Requested captions are part of the output contract, not a best-effort overlay.
          throw capErr;
        }
      }

      // Text Overlay burn-in. With no overlay configured, the clip title is
      // burned as an opening headline (Opus shows its headline for the first
      // seconds only, observed on the 15 Nov 2026 comparison set); an
      // explicit overlay_config.enabled === false (e.g. editor reset) opts
      // out. overlay_config.headline_duration_sec overrides the 5s default;
      // <= 0 keeps the headline for the whole clip.
      // Once an editor project exists, studio state is authoritative for the
      // opening headline/hook: if the user deleted the auto hook item there,
      // the legacy auto-title must not resurrect on export. (A visible hook
      // item makes the project pro-render eligible above, so this gate only
      // affects the deleted-hook case.)
      const headline = editorProjectExists ? null : ClipRenderService.buildHeadlineSpec(clip);
      if (headline) {
        // textfile transport: no drawtext text expansion, so user text is
        // rendered byte-for-byte (apostrophes, %, backslashes, unicode).
        // One drawtext per wrapped line: text_align is unavailable before
        // ffmpeg 5, and per-line filters center each line exactly anyway.
        const lines = headline.text.split('\n');
        const style =
          `fontcolor=white:borderw=${Math.max(1, Math.round(3 * canvasScale))}:bordercolor=black@0.9:shadowcolor=black@0.6:shadowx=0:shadowy=${Math.max(1, Math.round(2 * canvasScale))}`;
        const enable =
          headline.durationSec > 0 ? `:enable='lt(t,${headline.durationSec.toFixed(2)})'` : '';
        // Hook placement away from faces/captions (OpenShorts). The auto
        // headline only exists when no editor project does, so clip-level
        // caption_position is the effective caption band here. Face zone from
        // the reframe track's keyframes inside the headline window.
        const headlineWindowSec = headline.durationSec > 0 ? headline.durationSec : durationSec;
        const windowKeyframes = (reframeDecision.track?.smoothed_keyframes || []).filter(
          (k: any) => typeof k?.time === 'number' && k.time >= 0 && k.time <= headlineWindowSec &&
            typeof k?.centerY === 'number' && Number.isFinite(k.centerY)
        );
        const faceCenterY01 = windowKeyframes.length > 0
          ? windowKeyframes.reduce((acc: number, k: any) => acc + k.centerY, 0) / windowKeyframes.length
          : undefined;
        const canvasH = clip.aspect_ratio === '16:9' || clip.aspect_ratio === '1:1' ? 1080 : 1920;
        const placement = clip.auto_hook_title_enabled===true ? {yBase:150,zone:'top',reason:'configure_auto_hook_top'} : ClipRenderService.resolveHeadlinePlacement({
          captionPosition: (clip.caption_position as any) || 'bottom',
          canvasHeight: canvasH,
          faceCenterY01,
        });
        if (placement.zone !== 'top') {
          logger.info(`[ClipRender] Hook headline moved to ${placement.zone} (reason: ${placement.reason}) for clip ${clipId}`);
        }
        const firstY = placement.zone === 'bottom'
          ? placement.yBase - (lines.length - 1) * (headline.fontSize + 8)
          : placement.yBase;
        lines.forEach((line, idx) => {
          const linePath = path.join(tempDir, `headline-${idx}.txt`);
          fs.writeFileSync(linePath, line, 'utf8');
          const safeLine = linePath.replace(/\\/g, '/').replace(/:/g, '\\:');
          const y = Math.round((firstY + idx * (headline.fontSize + 8)) * canvasScale);
          videoFilters.push(
            `drawtext=textfile='${safeLine}':${style}:fontsize=${Math.round(headline.fontSize * canvasScale)}:x=(w-text_w)/2:y=${y}${enable}`
          );
        });
      } else if (clip.overlay_config?.enabled && clip.overlay_config?.text) {
        const rawText = String(clip.overlay_config.text);
        const safeText = rawText
          .replace(/[\r\n]+/g, ' ')
          .replace(/['\\%]/g, '')
          .replace(/:/g, '\\:')
          .slice(0, 90)
          .trim();
        if (safeText) {
          const pos = clip.overlay_config.position || 'top';
          const size = clip.overlay_config.size || 'md';
          const fontSize = Math.round((size === 'sm' ? 36 : size === 'lg' ? 60 : 46) * canvasScale);
          let yExpr = String(Math.round(120 * canvasScale));
          if (pos === 'center') yExpr = '(h-text_h)/2';
          else if (pos === 'bottom') yExpr = `h-text_h-${Math.round(260 * canvasScale)}`;

          videoFilters.push(
            `drawtext=text='${safeText}':fontcolor=white:fontsize=${fontSize}:box=1:boxcolor=black@0.65:boxborderw=${Math.round(10 * canvasScale)}:x=(w-text_w)/2:y=${yExpr}`
          );
        }
      }

      // Phase F: Authoritative Server-Side Watermark Enforcement
      const watermarkRequired = await WatermarkService.shouldWatermark(userId);
      if (watermarkRequired) {
        videoFilters.push(WatermarkService.getFfmpegFilterString({ canvasScale }));
        logger.info(`[ClipRender] Watermark enforced for user ${userId} on clip ${clipId}`);
      }

      logger.info(
        `[ClipRender] Preparing FFmpeg for clip ${clipId}: start=${startSec}s, dur=${durationSec}s, filters=${videoFilters.length}`
      );

      // Resolve optional background music for Quick Clips
      let resolvedMusicPath: string | null = null;
      if (clip.background_music && clip.background_music.enabled !== false && !clip.muted) {
        resolvedMusicPath = await ClipRenderService.resolveBackgroundMusicPath(clip.background_music, userId);
        if (!resolvedMusicPath) {
          logger.warn(`[ClipRender] Background music configured for clip ${clipId} but file could not be resolved. Falling back to dialogue-only audio.`);
        }
      }

      let expectedDurationSec = durationSec;
      if (hasCustomProTracks && editorProject) {
        logger.info(`[ClipRender] Compiling and executing multi-track EditorProject graph for clip ${clipId}`);
        editorProject=ProEditorService.prepareTrackerHandoffs(editorProject,{track:reframeDecision.track,clipStartSec:startSec,cropConfig:clip.crop_config});
        editorProject=expandSceneLayoutProject(editorProject);
        assertRenderAssetOwnership(editorProject, tempDir);
        await ProEditorService.preloadRemoteOverlayAssets(editorProject, tempDir);
        assertRenderAssetOwnership(editorProject, tempDir);
        const videoTrackItems = primaryVisibleVideoItems<EditorTrackItem>(editorProject);
        const isMultiSlice = usesGeneratedSliceGraph(videoTrackItems,editorProject.canvas.duration);
        // Single-slice renders seek the input; the loudnorm measurement pass must
        // apply the same seek so it measures the exact audio window being rendered.
        // A layout choice must never change the selected source interval.
        // Manual Fit/Fill/Split/panels use the same input content as Auto.
        const singleItem = !isMultiSlice ? videoTrackItems[0] : undefined;
        const sourceClockWindow = singleItemSourceWindow(singleItem,startSec,Number(editorProject.canvas.duration||durationSec));
        const candidateSourceStart = sourceClockWindow?.sourceStart ?? startSec;
        const candidateSourceDuration = sourceClockWindow?.sourceDuration ?? durationSec;
        const inputSeekArgs = !isMultiSlice
          ? ['-ss', candidateSourceStart.toFixed(3), '-t', candidateSourceDuration.toFixed(3)]
          : [];
        // Two-pass loudness normalization: measures dialogue audio first (audio-only
        // pass), then compiles with linear loudnorm when feasible, or a pre-rendered
        // dynamic-normalized dialogue WAV when peak/range-limited. Throws
        // LoudnormNormalizationError only for degenerate/silent measurements.
        const storedPlan=clip.crop_config?.mode==='smart' ? storedScenePlanWindow(editorProject,clip,reframeDecision.track,sourceSha256) : null;
        let graph = await ProEditorService.compileRenderGraphWithNormalization(
          editorProject,
          sourcePath,
          outputPath,
          tempDir,
          {
            aspectRatio: clip.aspect_ratio as ClipAspectRatio,
            cropConfig: clip.crop_config || null,
            clipStartSec: storedPlan?.sourceAnchor ?? startSec,
            decodedSource: srcDims,
            sourceHasAudio: srcDims?.hasAudio,
            sourceStoragePath: clip.source_storage_path,
            sourceSha256,
            sourceAssetId: clip.id,
            mode: storedPlan ? 'smart' : actualReframeMode,
            layoutMode: reframeDecision.layoutMode,
            track: storedPlan?.track ?? reframeDecision.track,
            canvasScale,
          },
          inputSeekArgs
        );
        // Single-slice renders input-seek with -t durationSec, so the output
        // can never exceed the trimmed input window; a stale canvas.duration
        // beyond it stalls ffmpeg on buffer backpressure until it is killed
        // (reproduced locally). Clamp the output duration to the input window.
        const canvasDuration = Number((editorProject.canvas?.duration || durationSec).toFixed(3));
        const renderDuration = !isMultiSlice ? Math.min(canvasDuration, sourceClockWindow?.outputDuration ?? durationSec) : canvasDuration;
        expectedDurationSec = renderDuration;
        if (graph.canvas) expectedCanvas = graph.canvas;

        const stagedDeadline=config.clipRenderSliceStagingQualification?Date.now()+timeoutMs:undefined;
        const preparedSlices=config.clipRenderSliceStagingQualification
          ? await prepareSliceRender(graph,{parentDirectory:tempDir,timeoutMs:Math.min(timeoutMs,120000),ffmpegPath:ffmpegBin}) : null;
        if(config.clipRenderSliceStagingQualification&&!preparedSlices)throw new AppError('This graph is outside the bounded slice-render qualification scope.',422,'STAGED_RENDER_UNSUPPORTED');
        if(preparedSlices){
          graph=preparedSlices.finalGraph;
          logger.info(`[ClipRender] Qualification slice staging prepared ${preparedSlices.intermediateBytes} bytes; sampled child peak ${preparedSlices.peakRssKiB} KiB`);
        }

        if (watermarkRequired) {
          const wmFilter = WatermarkService.getFfmpegFilterString({ canvasScale });
          const nextLabel = '[v_watermarked]';
          graph.filterComplex.push(`${graph.videoMap}${wmFilter}${nextLabel}`);
          graph.videoMap = nextLabel;
        }

        const filterBuilder = new FilterGraphBuilder(graph.filterComplex);
        const scriptExec = await filterBuilder.compileForExecution(tempDir);

        try {
          await HardwareEncoderService.executeWithFallback(async (encoderFlags) => {
            const ffmpegArgs = [
              '-y',
              ...encoderFlags.initArgs,
              ...ffmpegThreadArgs(),
              ...inputSeekArgs,
              ...graph.inputArgs,
              ...scriptExec.args,
              '-map', graph.videoMap,
              '-map', graph.audioMap,
              ...encoderFlags.videoCodecArgs,
              ...encoderFlags.qualityArgs,
              ...ffmpegEncoderThreadArgs(),
              '-c:a', 'aac',
              '-b:a', '128k',
              '-movflags', '+faststart',
              '-t', renderDuration.toFixed(3),
              outputPath,
            ];

            try {
              const remaining=stagedDeadline===undefined?timeoutMs:stagedDeadline-Date.now();
              if(remaining<=0)throw new AppError('Bounded staged render deadline exceeded.',504,'RENDER_TIMEOUT');
              await ClipRenderService.executeEncoderProcess(ffmpegBin,ffmpegArgs,remaining,renderCancellation.signal);
            } catch (err: any) {
              const detail = String(err?.stderr || '').trim().split('\n').slice(-12).join('\n');
              if (detail) err.message = `${err.message}\nffmpeg stderr: ${detail}`;
              throw err;
            }
          });
        } catch(error:any){
          if(error?.code==='PROCESS_STOP_UNVERIFIED')quarantineRenderSlot(clipId);
          throw error;
        } finally {
          if(!quarantinedRenderSlots.has(clipId)){
            await scriptExec.cleanup();
            preparedSlices?.cleanup();
          }
        }
        await ClipRenderService.updateJobProgress(jobId, 85, 'encoding',workerId);
      } else {
        const audioGraph = ClipRenderService.compileQuickClipAudioGraph({
          durationSec,
          clipVolume: clip.volume,
          backgroundMusic: clip.background_music,
          resolvedMusicPath,
        });

        if (audioGraph.hasBackgroundMusic && !clip.muted) {
          logger.info(`[ClipRender] Executing Quick Clips render with background music and ducking: ${audioGraph.musicPath}`);
          await ClipRenderService.updateJobProgress(jobId, 25, 'encoding',workerId);

          const fullFilterComplex = [
            composeQuickVideoGraph(videoFilters).graph,
            ...audioGraph.filterComplex,
          ];

          await HardwareEncoderService.executeWithFallback(async (encoderFlags) => {
            const ffmpegArgs = [
              '-nostdin',
              '-y',
              ...encoderFlags.initArgs,
              ...ffmpegThreadArgs(),
              '-ss', startSec.toFixed(3),
              '-t', durationSec.toFixed(3),
              '-i', sourcePath,
              ...audioGraph.inputArgs,
              '-filter_complex', fullFilterComplex.join(';'),
              '-map', '[out_v]',
              '-map', audioGraph.audioMap,
              ...encoderFlags.videoCodecArgs,
              ...encoderFlags.qualityArgs,
              ...ffmpegEncoderThreadArgs(),
              '-c:a', 'aac',
              '-b:a', '128k',
              '-pix_fmt', 'yuv420p',
              '-movflags', '+faststart',
              '-t', durationSec.toFixed(3),
              outputPath,
            ];

            try {
              await ClipRenderService.executeEncoderProcess(ffmpegBin,ffmpegArgs,timeoutMs,renderCancellation.signal);
            } catch (err: any) {
              const detail = String(err?.stderr || '').trim().split('\n').slice(-12).join('\n');
              if (detail) err.message = `${err.message}\nffmpeg stderr: ${detail}`;
              throw err;
            }
          });
          await ClipRenderService.updateJobProgress(jobId, 85, 'encoding',workerId);
        } else {
          await new Promise<void>((resolve, reject) => {
          let isResolved = false;
          let lastProgressUpdate = 0;
          const reportProgress=(timemark:string)=>{
            const now=Date.now();if(now-lastProgressUpdate<=1500)return;
            lastProgressUpdate=now;
            const currentSec=parseTimemarkToSeconds(timemark);
            const clampedProgress=Math.min(85,Math.max(15,15+Math.round((currentSec/durationSec)*70)));
            void ClipRenderService.updateJobProgress(jobId, clampedProgress, 'encoding',workerId).catch(()=>{});
          };

          const videoGraph = composeQuickVideoGraph(videoFilters);
          const cmd = ffmpeg(sourcePath)
            .inputOptions(ffmpegThreadArgs())
            .setStartTime(startSec)
            .setDuration(durationSec);
          // -filter_complex disables ffmpeg's default stream selection, so the
          // labeled-graph path must map the source audio explicitly.
          const labeledGraph = videoGraph.labeled;
          if (labeledGraph) {
            cmd.complexFilter([videoGraph.graph], ['out_v']);
          } else {
            cmd.videoFilters(videoFilters);
          }
          cmd.videoCodec('libx264');

          if (clip.muted) {
            cmd.noAudio();
          } else {
            cmd.audioCodec('aac');
            if (clip.volume !== undefined && Number(clip.volume) !== 1.0) {
              const vol = Math.min(2.0, Math.max(0.0, Number(clip.volume)));
              cmd.audioFilters(`volume=${vol}`);
            }
          }

          const outputOpts = [
            ...ffmpegEncoderThreadArgs(),
            '-pix_fmt yuv420p',
            `-preset ${config.renderPreset}`,
            '-crf', '22',
            '-movflags +faststart',
          ];
          if (!clip.muted) {
            outputOpts.push('-b:a 128k');
            if (labeledGraph) {
              // fluent-ffmpeg brackets bare complexFilter map labels, so the
              // optional source-audio map goes through outputOptions instead.
              outputOpts.push('-map 0:a?');
            }
          }

          cmd.outputOptions(outputOpts)
          .output(outputPath);


          // Keep fluent's existing argv construction, but own the Linux
          // encoder process group instead of settling immediately after kill.
          if(process.platform==='linux'){
            let progressTail='';
            void ClipRenderService.executeFluentEncoder(cmd,ffmpegBin,timeoutMs,renderCancellation.signal,chunk=>{
              progressTail=(progressTail+chunk).slice(-2048);
              const times=[...progressTail.matchAll(/time=(\d+:\d+:\d+(?:\.\d+)?)/g)];
              const last=times[times.length-1];if(last)reportProgress(last[1]);
            }).then(()=>resolve(),reject);
            return;
          }

          // Explicit timeout enforcement for the unchanged non-Linux path.
          const timer = setTimeout(() => {
            if (!isResolved) {
              isResolved = true;
              try {
                cmd.kill('SIGKILL');
              } catch (kErr) {}
              const err = new Error(`FFmpeg rendering timed out after ${timeoutMs / 1000}s`);
              (err as any).code = 'RENDER_TIMEOUT';
              reject(err);
            }
          }, timeoutMs);

          // Progress listener
          cmd.on('progress',progress=>reportProgress(progress.timemark));

          cmd.on('end', () => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timer);
              resolve();
            }
          });

          cmd.on('error', (err, stdout, stderr) => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timer);
              // ffmpeg's final lines ("Error opening output files: ...") hide
              // the real cause earlier in stderr; keep a tail for diagnosis.
              const stderrTail = String(stderr || '').trim().split('\n').slice(-8).join('\n');
              const wrappedErr = new Error(`FFmpeg processing failed: ${err.message}${stderrTail ? `\nffmpeg stderr: ${stderrTail}` : ''}`);
              (wrappedErr as any).code = 'FFMPEG_FAILED';
              reject(wrappedErr);
            }
          });

          cmd.run();
        });
        }
      }

      // Verify output file exists and has size
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        const err = new Error('Rendered output file was not generated or is empty.');
        (err as any).code = 'FFMPEG_FAILED';
        throw err;
      }

      // Output validation gate: streams + duration must match what was requested.
      const outputDims = await ClipRenderService.validateRenderedOutput(outputPath, expectedDurationSec, {
        expectAudio: !clip.muted,
        expectDimensions: expectedCanvas,
      });

      const encodedAudioReview = await reviewEncodedAudio(outputPath,Boolean(clip.muted),timeoutMs);
      await assertSelectionSourceCurrent(userId,clip.project_id,(clip as any).selection_source_receipt,clip.source_storage_path);
      // 3. Upload rendered MP4 to storage with revision versioning
      await ClipRenderService.updateJobStage(jobId, clipId, 'uploading', 90, 'uploading', workerId,expectedClipVersion);

      const renderedSize = (await fs.promises.stat(outputPath)).size;
      const renderVersion = Number(clip.render_version || 1);
      const outputStoragePath = renderAttemptObjectKey(clip.user_id, clip.project_id, clip.id, renderVersion,attemptId);

      logger.info(
        `[ClipRender] Uploading rendered MP4 v${renderVersion} (${(renderedSize / (1024 * 1024)).toFixed(2)} MB) to path: ${outputStoragePath}`
      );
      await uploadFile('clips', outputStoragePath, outputPath, renderedSize, 'video/mp4');
      const finalStoragePath = outputStoragePath;

      // Output verification guard: ensure deliverable exists before marking ready
      JobReliabilityService.verifyRequiredOutputs('clip_render', { output_storage_path: finalStoragePath });

      // Publish clip and job atomically. A stale upload has its own immutable
      // attempt key and cannot overwrite the current worker's output bytes.
      await commitUploadedRenderOutcome(await getMongoClient(),db,{jobId:jobId!,clipId,userId,workerId,renderVersion,editorVersion:Number(clip.editor_version||1),editorProject:expectedEditorProject},{
        job:{status:'completed',progress:100,stage:'completed',completed_at:new Date(),updated_at:new Date(),worker_id:null,locked_at:null,next_retry_at:null},
        clip:{
          render_status: 'ready',
          rendered_editor_version:expectedEditorProject?.version??null,
          rendered_editor_digest:expectedEditorProject?.digest??null,
          encoded_audio_review: encodedAudioReview,
          output_storage_path: finalStoragePath,
          output_object_key: finalStoragePath,
          reframe_mode: actualReframeMode,
          reframe_metadata: reframeMetadata || null,
          is_watermarked: watermarkRequired,
          render_resolution_requested: resolution.requested,
          render_resolution_effective: resolution.effective,
          render_output_width: outputDims?.width ?? outputCanvas.width,
          render_output_height: outputDims?.height ?? outputCanvas.height,
          render_source_width: srcDims?.width ?? null,
          render_source_height: srcDims?.height ?? null,
          render_resolution_note: resolution.warning ?? null,
          render_upscale_factor: resolution.upscaleFactor,
          render_error_code: null,
          render_error_message: null,
          updated_at: new Date(),
        }
      },{projectId:clip.project_id,attemptId,objectKey:finalStoragePath,validateSource:()=>assertSelectionSourceCurrent(userId,clip.project_id,(clip as any).selection_source_receipt,clip.source_storage_path)});

      // 4b. Poster frame for the Media Library while the rendered file is still local (best-effort).
      await ClipPosterService.generateFromRenderedFile(
        { ...clip, output_storage_path: finalStoragePath, render_version: renderVersion },
        outputPath,
      );

      // The completed job and ready clip were committed together above.

      logger.info(`[ClipRender] Successfully rendered and published clip ${clipId} to ${finalStoragePath}`);
    } catch (err: any) {
      const code = err.code || 'RENDER_FAILED';
      if(code==='PROCESS_STOP_UNVERIFIED'){quarantineRenderSlot(clipId);logger.error('[ClipRender] Local capacity quarantined until owned process exit is proved',{clipId,jobId,processGroupId:err.owned_process_group});}
      const isTransient = JobReliabilityService.isTransientError(err) || ['RENDER_TIMEOUT', 'STORAGE_UNAVAILABLE', 'FFMPEG_FAILED', 'NETWORK_ERROR'].includes(code);
      const message = JobReliabilityService.sanitizeErrorMessage(err.message || 'Video rendering failed.');

      logger.error(`[ClipRender] Clip rendering failed for clip ${clipId}`, {
        clipId,
        code,
        message,
      });

      // A lease-loss exception must never mark another worker's clip/job failed.
      // The transaction also rechecks ownership after the diagnostic read below.
      if(jobId&&code!=='FENCING_TOKEN_MISMATCH'){
        try{
          const currentJob=await db.collection('render_jobs').findOne({id:jobId,clip_id:clipId,user_id:userId,worker_id:workerId,status:'processing'});
          if(currentJob){
            const {attempts,maximum:maxAttempts}=renderRetryBudget(currentJob);
            const retry=code!=='RENDER_INPUT_CHANGED'&&isTransient&&attempts<maxAttempts;
            const nextRetryAt=retry?new Date(Date.now()+JobReliabilityService.computeBackoffDelayMs(attempts,{baseDelayMs:2000,maxDelayMs:30000,jitter:true})):null;
            await commitFencedRenderOutcome(await getMongoClient(),db,{jobId,clipId,userId,workerId,renderVersion:Number(clip.render_version||1),editorVersion:Number(clip.editor_version||1),editorProject:expectedEditorProject},{
              preserveSupersedingClip:true,
              job:{status:retry?'queued':'failed',stage:retry?'queued':'failed',worker_id:null,locked_at:null,next_retry_at:nextRetryAt,error_code:code,error_message:message,updated_at:new Date()},
              clip:{render_status:retry?'queued':'failed',render_error_code:code,render_error_message:message,updated_at:new Date()},
            });
            logger.warn('[ClipRender] Fenced render failure recorded',{clipId,jobId,retry,attempts,maxAttempts});
          }else{
            logger.warn('[ClipRender] Discarded stale worker failure',{clipId,jobId});
          }
        }catch(dbErr){
          // No unguarded fallback. Leave lease recovery to the queue if the
          // transaction is unavailable, rather than partially publishing state.
          logger.error('Failed to commit fenced render failure',{jobId,dbErr});
        }
      }
    } finally {
      clearInterval(heartbeatTimer);
      // 6. Reliable cleanup of all temporary directories and files
      try {
        if (!quarantinedRenderSlots.has(clipId)&&fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      } catch (rmErr) {
        logger.warn(`Failed to clean up temp render directory: ${tempDir}`);
      }
      activeRenderSet.delete(clipId);
    }
  }

  /**
   * Helper to update job progress safely
   */
  private static async updateJobProgress(
    jobId?:string,progress?:number,stage?:string,expectedWorkerId?:string
  ):Promise<void>{
    if(!jobId||!expectedWorkerId)return;
    const clamped=Math.min(100,Math.max(0,progress||0));
    try{
      const db=await getMongoDb();
      await db.collection('render_jobs').updateOne({id:jobId,worker_id:expectedWorkerId,status:'processing'},{$set:{progress:clamped,stage:stage||'encoding',updated_at:new Date()}});
    }catch{}
  }

  /**
   * Helper to update stage and clip render_status
   */
  public static async updateJobStage(
    jobId: string | undefined,
    clipId: string,
    stage: string,
    progress: number,
    clipStatus: string,
    expectedWorkerId?: string,
    expectedClipVersion?:{renderVersion:number;editorVersion:number}
  ): Promise<void> {
    if(!jobId||!expectedWorkerId)throw new AppError('A render worker lease is required.',409,'FENCING_TOKEN_MISMATCH');
    const db=await getMongoDb();
    const current=await db.collection('render_jobs').findOne({id:jobId,clip_id:clipId,worker_id:expectedWorkerId,status:'processing'});
    if(!current?.user_id)throw new AppError('Render lease was expired or claimed by another worker.',409,'FENCING_TOKEN_MISMATCH');
    await commitFencedRenderOutcome(await getMongoClient(),db,{jobId,clipId,userId:current.user_id,workerId:expectedWorkerId,...expectedClipVersion},{
      job:{stage,progress,status:'processing',updated_at:new Date()},
      clip:{render_status:clipStatus,updated_at:new Date()},
    });
  }

  /**
   * Render-time speaker-following guarantee (quality roadmap: active-speaker
   * framing). When the clip's crop mode is 'smart' but no ready reframe track
   * exists, run the CV analyzer on the ALREADY-downloaded source and persist
   * the track before the reframing decision. Failures fall back to the
   * existing center-crop path for ordinary analyzer failures. Cancellation,
   * unverified process stop, admission policy and fencing errors must propagate.
   */
  private static async ensureReframeTrackAtRender(
    clip: ClipRecord,
    localSourcePath: string,
    jobId?: string,
    expectedSourceSha256?: string,
    sourceReceipt?:SourceObjectReceipt,
    expectedWorkerId?:string,
    expectedClipVersion?:{renderVersion:number;editorVersion:number},
    signal?:AbortSignal
  ): Promise<void> {
    if(signal?.aborted)throw signal.reason||Object.assign(Error('Render cancelled.'),{code:'WORK_CANCELLED'});
    if (!config.smartReframeEnabled || !config.reframeAutoGenerate) return;
    if (clip.crop_config?.mode !== 'smart') return;

    const existing = await SmartReframeService.getReframeTrack(clip.id, clip.user_id, expectedSourceSha256);
    if (existing && existing.status === 'ready' && !existing.isStale &&
        Array.isArray(existing.smoothed_keyframes) && existing.smoothed_keyframes.length > 0) {
      return;
    }

    if (existing && activeReframeAnalysisSet.has(clip.id)) return; // analysis already in flight

    logger.info(`[ClipRender] No ready reframe track for smart clip ${clip.id}; auto-generating from local source`);
    try {
      if (jobId) {
        await ClipRenderService.updateJobStage(jobId, clip.id, 'analyzing_speakers', 8, 'rendering',expectedWorkerId,expectedClipVersion);
      }
      await SmartReframeService.analyzeClipFraming(clip.id, clip.user_id, { localSourcePath,sourceReceipt,signal });
    } catch (err: any) {
      // Missing exit proof outranks a concurrent lease-loss cancellation: the
      // caller must quarantine capacity, not downgrade this to fencing only.
      if(err?.code==='PROCESS_STOP_UNVERIFIED')throw err;
      if(signal?.aborted)throw signal.reason||err;
      if(['GENRE_SELECTION_STALE','GENRE_CONTEXT_CHANGED','FENCING_TOKEN_MISMATCH','RENDER_INPUT_CHANGED','WORK_CANCELLED','PROCESS_STOP_UNVERIFIED','SUPERVISION_UNAVAILABLE','RESOURCE_POLICY_MISMATCH','RESOURCE_WORK_TOO_LARGE'].includes(err?.code))throw err;
      logger.warn(`[ClipRender] Auto reframe analysis failed for clip ${clip.id}: ${err?.message || err}. Falling back to center crop.`);
    }
  }

  /**
   * Shared reframing decision for both render paths (audit H-1).
   * Quick Clip render consumes `cropFilter` directly; the Pro editor path consumes
   * `track`/`layoutMode` to build per-slice dynamic crops in compileRenderGraph,
   * guaranteeing both paths frame identical source identically.
   *
   * Reframe keyframes are clip-relative (t=0 at clip start incl. trim), matching
   * the `-ss startSec` input seek used by both quick and single-slice pro renders.
   */
  /**
   * Auto-headline spec for the render path, or null when the headline is not
   * shown. Pure and unit-tested; the drawtext string assembly stays inline.
   * Fit model: drawtext cannot auto-fit, so text is capped (45 chars +
   * ellipsis) and font size tiered by character count (~0.58em average glyph
   * width, 40px side margins on a 1080 canvas - verified 15 Nov 2026: a
   * 41-char title overflowed at 60px, fits at 38px).
   */
  /**
   * Hook/headline placement (OpenShorts): keep the opening hook headline off
   * the caption band and off the subject's face. Pure and unit-tested.
   * Zone rules: default top (legacy y=150). Move to the lower zone when
   * captions occupy the top, or when the followed face sits in the top 40% of
   * the frame during the headline window. If the lower zone is also blocked
   * (face below 65%), drop to an upper-middle band instead of covering either.
   * Only the auto hook headline uses this; an explicit overlay_config position
   * is the user's own choice and is never moved.
   */
  public static resolveHeadlinePlacement(opts: {
    captionPosition: 'top' | 'center' | 'bottom';
    canvasHeight: number;
    faceCenterY01?: number;
  }): { yBase: number; zone: 'top' | 'bottom' | 'upper_middle'; reason: string } {
    const topY = 150;
    const bottomY = Math.round(opts.canvasHeight * 0.72);
    const face = typeof opts.faceCenterY01 === 'number' && Number.isFinite(opts.faceCenterY01)
      ? Math.min(1, Math.max(0, opts.faceCenterY01))
      : undefined;
    const topBlocked = opts.captionPosition === 'top' || (face !== undefined && face < 0.4);
    if (!topBlocked) return { yBase: topY, zone: 'top', reason: 'default_top' };
    const bottomBlocked = face !== undefined && face > 0.65;
    if (!bottomBlocked) {
      return {
        yBase: bottomY,
        zone: 'bottom',
        reason: opts.captionPosition === 'top' ? 'caption_band_top' : 'face_in_top_zone',
      };
    }
    return { yBase: Math.round(opts.canvasHeight * 0.3), zone: 'upper_middle', reason: 'top_caption_plus_low_face' };
  }

  public static buildHeadlineSpec(
    clip: Pick<ClipRecord, 'title' | 'overlay_config' | 'auto_hook_title_enabled' | 'auto_hook_title_text'>
  ): { text: string; fontSize: number; durationSec: number } | null {
    const stripped = automaticHeadlineText(clip);
    if (!stripped) return null;
    const capped = clip.auto_hook_title_enabled===true ? stripped : stripped.length > 60 ? stripped.slice(0, 57).trimEnd() + '...' : stripped;
    // Two-line wrap at a word boundary near the midpoint; single line when
    // short. Rendered via drawtext textfile so user text (apostrophes,
    // percent, backslashes, unicode) is preserved byte-for-byte.
    let lines = [capped];
    if (capped.length > 26) {
      const words = capped.split(' ');
      let best = -1;
      let bestImbalance = Infinity;
      let acc = 0;
      for (let i = 0; i < words.length - 1; i++) {
        acc += words[i].length + 1;
        const imbalance = Math.abs(capped.length - 2 * acc);
        if (imbalance < bestImbalance) {
          bestImbalance = imbalance;
          best = i;
        }
      }
      if (best >= 0) {
        lines = [words.slice(0, best + 1).join(' '), words.slice(best + 1).join(' ')];
      }
    }
    const longest = Math.max(...lines.map((l) => l.length));
    const fontSize = longest <= 22 ? 64 : longest <= 28 ? 56 : longest <= 34 ? 48 : 40;
    const rawDur = (clip.overlay_config as any)?.headline_duration_sec;
    const durationSec = typeof rawDur === 'number' && Number.isFinite(rawDur) ? rawDur : 5.0;
    return { text: lines.join('\n'), fontSize, durationSec };
  }

  public static async resolveReframeDecision(
    clip: ClipRecord,
    durationSec: number,
    canvasScale = 1,
    expectedSourceSha256?: string,
    decodedSource?: {width:number;height:number}|null
  ): Promise<{
    cropFilter: string;
    mode: 'smart' | 'fallback_center' | 'manual';
    metadata?: Record<string, any>;
    layoutMode: ReframeLayoutMode | string;
    track: Awaited<ReturnType<typeof SmartReframeService.getReframeTrack>>;
  }> {
    const centerCrop = () => clip.crop_config?.layout_mode_source==='auto' ? buildBackdropFitChain(clip.aspect_ratio as ClipAspectRatio,1,{kind:'blur',bandAspect:4/3},'autosafe',canvasScale) : buildCropFilter(clip.aspect_ratio as ClipAspectRatio, { focusX: 0.5, focusY: 0.5 }, canvasScale);

    if (clip.crop_config?.mode === 'manual') {
      return { cropFilter: buildCropFilter(clip.aspect_ratio as ClipAspectRatio, clip.crop_config, canvasScale), mode: 'manual', layoutMode: 'manual', track: null };
    }

    if (clip.crop_config?.mode === 'fit_blur') {
      const zoom = Math.min(4, Math.max(1, Number(clip.crop_config.scale ?? 1)));
      return { cropFilter: buildBlurFitChain(clip.aspect_ratio as ClipAspectRatio, zoom, 'vcb', canvasScale, clip.crop_config.focusX, clip.crop_config.focusY), mode: 'manual', layoutMode: 'manual', track: null };
    }

    if (clip.crop_config?.mode === 'fit') {
      const zoom = Math.min(4, Math.max(1, Number(clip.crop_config.scale ?? 1)));
      const clampF = (v: number | undefined): number => Math.min(1, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : 0.5));
      return { cropFilter: buildFitFilter(clip.aspect_ratio as ClipAspectRatio, zoom, clampF(clip.crop_config.focusX), clampF(clip.crop_config.focusY), canvasScale), mode: 'manual', layoutMode: 'manual', track: null };
    }

    if (clip.crop_config?.mode !== 'smart') {
      return { cropFilter: buildCropFilter(clip.aspect_ratio as ClipAspectRatio, clip.crop_config, canvasScale), mode: 'fallback_center', layoutMode: 'manual', track: null };
    }

    try {
      const track = await SmartReframeService.getReframeTrack(clip.id, clip.user_id, expectedSourceSha256);
      if (
        track &&
        track.status === 'ready' &&
        Array.isArray(track.smoothed_keyframes) &&
        track.smoothed_keyframes.length > 0
      ) {
        if (track.isStale) {
          logger.warn(`[ClipRender] Smart reframe track is stale for clip ${clip.id}. Falling back to center crop.`);
          return { cropFilter: centerCrop(), mode: 'fallback_center', metadata: { reason: 'stale_track', detected_face_count: track.detected_face_count || 0 }, layoutMode: 'track', track };
        }

        const explicitAuto=SmartReframeService.explicitAutoLayoutPlan(track,clip.crop_config,durationSec,clip.aspect_ratio);
        if(nonPortraitAutoFullSourceFit(explicitAuto,clip.aspect_ratio))return {cropFilter:buildBackdropFitChain(clip.aspect_ratio,1,{kind:'blur'},'autoWhole',canvasScale),mode:'smart',layoutMode:'track',metadata:{reason:'automatic_full_source_fit',caption_windows:quickCaptionWindows(explicitAuto!,durationSec,track.source_width||1920,track.source_height||1080,clip.aspect_ratio,canvasDims(clip.aspect_ratio,canvasScale))},track};
        const legacyFit=explicitAuto||(clip.crop_config?.layout_mode_source!=='user'?legacyFit43Plan(track,durationSec,SmartReframeService.computeGroupFrameGeometry({rawSamples:track.raw_samples,sourceWidth:track.source_width||1920,sourceHeight:track.source_height||1080}),SmartReframeService.isLowConfidenceTrack(track)):undefined);
        if(legacyFit&&(clip.aspect_ratio||'9:16')==='9:16')return {cropFilter:SmartReframeService.buildShotCompositionFilter({plan:legacyFit,duration:durationSec,sourceWidth:track.source_width||1920,sourceHeight:track.source_height||1080,canvasScale}),mode:'smart',layoutMode:'track',metadata:{reason:explicitAuto?'automatic_layout_plan':'legacy_fit_43_review',caption_windows:quickCaptionWindows(legacyFit,durationSec,track.source_width||1920,track.source_height||1080,'9:16',canvasDims('9:16',canvasScale))},track};
        const legacyFallback=clip.crop_config?.layout_mode_source!=='user'?legacyPolicyFallback(clip.crop_config?.layoutPolicy,track,durationSec):undefined;
        if(legacyFallback)return {cropFilter:buildBackdropFitChain(clip.aspect_ratio as ClipAspectRatio,1,{kind:'blur',bandAspect:4/3},'legacyPolicy',canvasScale),mode:'smart',layoutMode:'blur',metadata:{reason:'layout_policy_review_fit'},track};
        if ((track.detected_face_count || 0) === 0 || !track.dominant_track_id) {
          // Auto placeholders and genre recommendations are not authoritative; with no
          // detected subject the measured outcome is the modern blurred layout.
          const cropLayout = !['genre_recommendation','auto'].includes((clip.crop_config as any)?.layout_mode_source) ? clip.crop_config?.layout_mode : undefined;
          const targetLayout = cropLayout || 'blur';
          if (targetLayout === 'blur' && (clip.aspect_ratio === '9:16' || !clip.aspect_ratio)) {
            logger.info(`[ClipRender] No subject detected in smart reframe track for clip ${clip.id}. Using modern blurred background layout.`);
            return {
              cropFilter: SmartReframeService.buildBlurBackgroundFilter({ canvasWidth: canvasDims('9:16', canvasScale).width, canvasHeight: canvasDims('9:16', canvasScale).height }),
              mode: 'smart',
              metadata: { layout_mode: 'blur', reason: 'broll_or_no_face', detected_face_count: 0 },
              layoutMode: 'blur',
              track,
            };
          }
          logger.info(`[ClipRender] No subject detected in smart reframe track for clip ${clip.id}. Using fallback center.`);
          return { cropFilter: centerCrop(), mode: 'fallback_center', metadata: { reason: 'no_subject_detected', detected_face_count: 0 }, layoutMode: targetLayout, track };
        }

        // Provenance-aware precedence: user/legacy crop layout wins; Auto
        // placeholders and genre hints yield to current measured layout. Otherwise
        // the measured track layout (which already applies the genre hint
        // rules) beats a genre-stamped crop_config value.
        const cropLayout = !['genre_recommendation','auto'].includes((clip.crop_config as any)?.layout_mode_source) ? clip.crop_config?.layout_mode : undefined;
        const targetLayout = cropLayout || track.layout_mode || clip.crop_config?.layout_mode || 'track';
        const splitGeometry =
          targetLayout === 'split'
            ? SmartReframeService.computeSplitSpeakerGeometry({
                rawSamples: track.raw_samples,
                sourceWidth: track.source_width || 1920,
                sourceHeight: track.source_height || 1080,
                speaker1X: clip.crop_config?.split?.speaker1X,
                speaker2X: clip.crop_config?.split?.speaker2X,
              })
            : null;
        if (clip.crop_config?.layout_mode_source!=='user' && targetLayout === 'track' && (clip.aspect_ratio === '9:16' || !clip.aspect_ratio) && track.metadata?.shot_composition_candidate === true) {
          const sourceStart=clip.start_seconds+(clip.trim_start_offset||0);
          const resolution=resolveMeasuredItemPlan({id:clip.id,source_asset_id:clip.id,source_path:clip.source_storage_path,source_start:sourceStart,source_end:clip.end_seconds-(clip.trim_end_offset||0),crop_config:clip.crop_config},
            {track,sourceSha256:expectedSourceSha256,sourceStoragePath:clip.source_storage_path,sourceAssetId:clip.id,clipStartSec:sourceStart,aspectRatio:clip.aspect_ratio||'9:16',decodedSource,cropConfig:clip.crop_config},
            options=>SmartReframeService.computeShotComposition(options));
          if(resolution.status!=='ready')throw new AppError(`Automatic framing needs source review: ${resolution.reason}`,409,'AUTOMATIC_PLAN_REVIEW_REQUIRED');
          const plan=resolution.shots as ReturnType<typeof SmartReframeService.computeShotComposition>;
          if (plan.length) return {cropFilter:SmartReframeService.buildShotCompositionFilter({plan,duration:durationSec,
            sourceWidth:track.source_width||1920,sourceHeight:track.source_height||1080,canvasScale}),mode:'smart',
            metadata:{layout_mode:'track',shot_composition_candidate:true,automatic_plan_identity:resolution.identity},layoutMode:'track',track};
        }
        // Multi-person single-view: keep the whole group visible (blur-fill
        // fit) instead of tight tracking that crops people at the edges.
        const groupFrame =
          targetLayout === 'track'
            ? SmartReframeService.computeGroupFrameGeometry({
                rawSamples: track.raw_samples,
                sourceWidth: track.source_width || 1920,
                sourceHeight: track.source_height || 1080,
              })
            : null;
        // Tracking-quality floor: when the dominant subject is only weakly
        // established (low presence/area/confidence mix), a tight track is
        // confidently wrong more often than right (e.g. it locks onto a lamp
        // or a background artifact). With no credible group frame either,
        // degrade to the modern blurred layout instead of a bad tight track.
        const dominantScore = Number(track.metadata?.dominant_score);
        if (
          targetLayout === 'track' &&
          !groupFrame &&
          SmartReframeService.isLowConfidenceTrack(track)
        ) {
          logger.warn(
            `[ClipRender] Dominant track score ${dominantScore.toFixed(3)} below tracking floor 0.30 for clip ${clip.id}. Degrading to blurred layout.`
          );
          if (clip.aspect_ratio === '9:16' || !clip.aspect_ratio) {
            return {
              cropFilter: SmartReframeService.buildBlurBackgroundFilter({ canvasWidth: canvasDims('9:16', canvasScale).width, canvasHeight: canvasDims('9:16', canvasScale).height }),
              mode: 'smart',
              metadata: {
                layout_mode: 'blur',
                reason: 'low_tracking_confidence',
                dominant_score: dominantScore,
                detected_face_count: track.detected_face_count || 0,
              },
              layoutMode: 'blur',
              track,
            };
          }
          return {
            cropFilter: centerCrop(),
            mode: 'fallback_center',
            metadata: { reason: 'low_tracking_confidence', dominant_score: dominantScore, detected_face_count: track.detected_face_count || 0 },
            layoutMode: 'track',
            track,
          };
        }
        const cropFilter = SmartReframeService.buildLayoutCropFilter({
          layoutMode: targetLayout as any,
          aspectRatio: clip.aspect_ratio as ClipAspectRatio,
          keyframes: track.smoothed_keyframes,
          sourceWidth: track.source_width || 1920,
          sourceHeight: track.source_height || 1080,
          duration: durationSec,
          speaker1X: clip.crop_config?.split?.speaker1X,
          speaker2X: clip.crop_config?.split?.speaker2X,
          splitGeometry,
          splitFit: (clip.crop_config?.split as any)?.fit,
          splitDividerX: (clip.crop_config?.split as any)?.dividerX,
          groupFrame,
          screencastMode: clip.crop_config?.screencast?.mode,
          screencastInsetPosition: clip.crop_config?.screencast?.insetPosition,
          screencastInsetDiameter: clip.crop_config?.screencast?.insetDiameter,
          screencastScreenRatio: clip.crop_config?.screencast?.screenRatio,
          screencastBackground: clip.crop_config?.screencast?.background,
          screencastFacecamBox: SmartReframeService.resolveFacecamBox(clip.crop_config?.screencast, track.metadata),
          canvasScale,
        });
        logger.info(`[ClipRender] Applied dynamic smart reframe filter (${targetLayout}) with ${track.smoothed_keyframes.length} keyframes for clip ${clip.id}`);
        return {
          cropFilter,
          mode: 'smart',
          metadata: {
            layout_mode: targetLayout,
            dominant_track_id: track.dominant_track_id,
            detected_face_count: track.detected_face_count,
            keyframe_count: track.smoothed_keyframes.length,
            dominant_score: track.metadata?.dominant_score,
          },
          layoutMode: targetLayout,
          track,
        };
      }

      logger.warn(`[ClipRender] No ready smart reframe track found for clip ${clip.id}. Falling back to center crop.`);
      return { cropFilter: centerCrop(), mode: 'fallback_center', metadata: { reason: 'no_ready_track' }, layoutMode: clip.crop_config?.layout_mode || 'track', track };
    } catch (reframeErr: any) {
      if(reframeErr?.code==='AUTOMATIC_PLAN_REVIEW_REQUIRED')throw reframeErr;
      logger.warn(`[ClipRender] Smart reframe resolution error for clip ${clip.id}: ${reframeErr.message}. Falling back to center crop.`);
      return { cropFilter: centerCrop(), mode: 'fallback_center', metadata: { reason: 'error', error: reframeErr.message }, layoutMode: clip.crop_config?.layout_mode || 'track', track: null };
    }
  }

  /**
   * Post-render output gate (audit M-1): the rendered file must contain a video
   * stream, the expected audio presence, and a duration within 0.5s of the
   * requested render duration before the job may be marked ready.
   * Failures are permanent (non-transient) — a retry re-renders, it does not
   * re-validate the same broken file.
   * Probe failure is fail-closed: no upload or ready status without verification.
   * Source-dimension probing remains best-effort, output verification does not.
   */
  public static async validateRenderedOutput(
    filePath: string,
    expectedDurationSec: number,
    options: { expectAudio: boolean; expectDimensions?: { width: number; height: number } }
  ): Promise<{ width: number; height: number } | null> {
    return validateOutputFile(filePath, expectedDurationSec, options);
  }

  /** Compatibility boundary for the pinned fluent-ffmpeg argv builder. The
   * actual fixed H.264/AAC MP4 options require no experimental codec additions.
   * Tests compare this argv to fluent's prepared argv before actual encoding. */
  public static async executeFluentEncoder(command:unknown,binary:string,timeoutMs:number,signal?:AbortSignal,onStderr?:(chunk:string)=>void){
    const args=(command as any)?._getArguments?.();
    if(!Array.isArray(args)||!args.every((arg:unknown)=>typeof arg==='string'||(typeof arg==='number'&&Number.isFinite(arg))))throw Object.assign(Error('FFmpeg argv construction is unavailable.'),{code:'FFMPEG_FAILED'});
    // Native spawn stringifies numeric duration/seek arguments from fluent.
    return this.executeEncoderProcess(binary,args.map(String),timeoutMs,signal,onStderr);
  }

  /** Executes encoder argv with lifecycle cancellation on Linux.
   * Offline qualification-only slice staging remains a separate scope. */
  public static async executeEncoderProcess(binary:string,args:string[],timeoutMs:number,signal?:AbortSignal,onStderr?:(chunk:string)=>void){
    try{
      return process.platform==='linux'
        ? await supervisedExecFile(binary,args,{timeoutMs,maxBuffer:1024*1024,signal,onStderr})
        : await execFileAsync(binary,args,{timeout:timeoutMs,killSignal:'SIGKILL',signal});
    }catch(error:any){
      if(error?.code==='PROCESS_STOP_UNVERIFIED')throw error;
      if(signal?.aborted)throw signal.reason||Object.assign(Error('Render cancelled.'),{code:'WORK_CANCELLED'});
      if(error?.code==='PROCESS_TIMEOUT'||(process.platform!=='linux'&&error.killed&&error.signal==='SIGKILL'))throw Object.assign(Error('FFmpeg rendering timed out.'),{code:'RENDER_TIMEOUT',cause:error});
      throw Object.assign(Error(`FFmpeg processing failed: ${error.message}`),{code:'FFMPEG_FAILED',stderr:error.stderr,cause:error});
    }
  }

  /** Native frame size of the first video stream, or null when ffprobe is unavailable. */
  public static async probeSourceDimensions(filePath: string): Promise<{ width: number; height: number; hasAudio: boolean } | null> {
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        ['-v', 'error', '-show_streams', '-of', 'json', filePath],
        { timeout: 15000, maxBuffer: 1024 * 1024 }
      );
      const streams = ((JSON.parse(stdout) as any).streams || []);
      const st = streams.find((s:any)=>s.codec_type === 'video') || {};
      let w = Number(st.width);
      let h = Number(st.height);
      if (!(w > 0 && h > 0)) return null;
      const rot = Math.abs(Number(st.tags?.rotate ?? st.side_data_list?.[0]?.rotation ?? 0)) % 180;
      if (rot === 90) [w, h] = [h, w];
      return { width: w, height: h, hasAudio: streams.some((s:any)=>s.codec_type === 'audio') };
    } catch {
      return null;
    }
  }

  /**
   * Background processor: claims due queued render jobs and recovers stale leases
   */
  public static async processDueRenderJobs(): Promise<number> {
    if (!runsBackgroundWorkers() || workLifecycle.isDraining() || !isMongoConfigured) return 0;
    const db = await getMongoDb();
    const now = new Date();

    // Exact heartbeat/token recovery with per-job retry budgets.
    await recoverRenderQueue(await getMongoClient(),db,now);

    // 2. Admission: no free slot means leave the job queued. Checked before the
    // query so the sweep never claims past the per-process cap shared with inline launches.
    if (renderOccupancy() >= maxConcurrentRenders()) return 0;

    // 3. Pick the next due job, skipping clips that already hold a slot.
    const busyClipIds = occupiedRenderClipIds();
    const dueJob = await nextOwnerFairRenderJob(db,now,{busyClipIds});

    if (!dueJob) return 0;

    // Invariant check: job must have a valid string owner identity
    if (!dueJob.user_id || typeof dueJob.user_id !== 'string' || !dueJob.user_id.trim()) {
      logger.error(`[ClipRender] Invariant violation: render job ${dueJob.id} is missing a valid user_id`);
      const invalidated=await db.collection('render_jobs').updateOne(
        {
          id: dueJob.id,
          status: 'queued',
          worker_id: null,
          locked_at: null,
        },
        {
          $set: {
            status: 'failed',
            stage: 'failed',
            error_code: 'INVALID_OWNER_ID',
            error_message: 'Job cannot be processed: missing or invalid owner context.',
            updated_at: new Date(),
          },
        }
      );
      if(invalidated.matchedCount===1)notifyRenderCapacityAvailable();
      return 1;
    }

    // Reserve synchronously (no await since the check above) so a concurrent inline
    // launch cannot also pass the cap; released in the finally below.
    if (!tryReserveRenderSlot(dueJob.clip_id)) return 0;

    let queueAdvanced=false;
    try {
      // Part 1: Propagate authenticated owner context using trusted persisted owner ID
      await ownerContext.run(dueJob.user_id, async () => {
        await this.renderClipJob(dueJob.clip_id, dueJob.user_id, dueJob.id);
      });
      return 1;
    } catch (err: any) {
      const code = err.code || 'RENDER_FAILED';
      const rawMessage = err.message || 'Render processing failed.';
      logger.warn(`[ClipRender] Error processing due render job ${dueJob.id}: ${rawMessage}`, {
        jobId: dueJob.id,
        clipId: dueJob.clip_id,
        userId: dueJob.user_id,
        code,
      });

      // Part 2: Permanent pre-lease failure handling
      if (code === 'CLIP_NOT_FOUND' || code === 'RENDER_INPUT_CHANGED') {
        queueAdvanced=await failQueuedRenderJob(await getMongoClient(), db, dueJob as any, {
          code, message: JobReliabilityService.sanitizeErrorMessage(rawMessage),
        }, new Date());
      } else if (code === 'RENDER_ALREADY_ACTIVE') {
        // A live remote/older render can leave a newer queued job at the fair
        // head. Defer that exact unclaimed snapshot without spending attempts,
        // so unrelated owners can use otherwise idle capacity.
        const deferred=await db.collection('render_jobs').updateOne(
          queuedRenderSnapshotFilter(dueJob as any),
          {$set:{next_retry_at:new Date(Date.now()+2000),updated_at:new Date()}}
        );
        queueAdvanced=deferred.matchedCount===1;
      } else if (code === 'RENDER_ADMISSION_UNAVAILABLE') {
        // A fairness query/transaction outage is not an acquired execution or
        // evidence of bad media. Preserve queued work for bounded next pickup.
        logger.warn('[ClipRender] Queue admission unavailable; job remains queued',{jobId:dueJob.id});
      } else if (code === 'AUTH_REQUIRED') {
        // Invariant violation: do not mark permanently failed; log for investigation
        logger.error(`[ClipRender] Invariant violation: Authenticated owner context was not established for job ${dueJob.id} (user ${dueJob.user_id}): ${rawMessage}`);
      } else if (code !== 'RENDER_ALREADY_ACTIVE') {
        // Any other pre-lease error needs a bounded decision, not an immediate
        // oldest-first hot loop that starves the queue. This includes incomplete
        // editor saves and unclassified database errors. Exact queued/empty-lease
        // guards below prevent touching an acquired or replaced execution.
        {
          const {attempts,maximum:maxAttempts}=renderRetryBudget({attempts:dueJob.prelease_failures,max_attempts:3});
          if (attempts + 1 < maxAttempts) {
            const delayMs = JobReliabilityService.computeBackoffDelayMs(attempts + 1, { baseDelayMs: 2000, maxDelayMs: 30000, jitter: true });
            const nextRetryAt = new Date(Date.now() + delayMs);
            const scheduled = await db.collection('render_jobs').updateOne(
              queuedRenderSnapshotFilter(dueJob as any),
              {
                $set: {
                  next_retry_at: nextRetryAt,
                  prelease_failures: attempts + 1,
                  updated_at: new Date(),
                },
              }
            );
            queueAdvanced=scheduled.matchedCount===1;
            if (scheduled.matchedCount === 1) logger.warn(`[ClipRender] Pre-lease failure for job ${dueJob.id}. Scheduled retry at ${nextRetryAt.toISOString()}`);
          } else {
            queueAdvanced=await failQueuedRenderJob(await getMongoClient(), db, dueJob as any, {
              code: code || 'MAX_ATTEMPTS_EXCEEDED',
              message: JobReliabilityService.sanitizeErrorMessage(rawMessage),
            }, new Date());
          }
        }
      }

      return 1;
    } finally {
      releaseRenderSlot(dueJob.clip_id,queueAdvanced);
    }
  }

  /**
   * Fetches all clips belonging to a project and user, attaching the latest render job.
   */
  public static async getProjectClips(projectId: string, userId: string): Promise<ClipRecord[]> {
    if (!isMongoConfigured) {
      throw Object.assign(new Error('Database service is not configured.'), { code: 'SERVICE_UNAVAILABLE' });
    }

    const { data: clips, error } = await dataRepository
      .from('clips')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DATABASE_UNAVAILABLE' });
    if (!Array.isArray(clips)) throw new Error('Saved clips response is invalid.');

    // Attach latest render job for each clip
    const enrichedClips: ClipRecord[] = await Promise.all(
      clips.map(async (clip: any) => {
        const { data: job, error: jobError } = await dataRepository
          .from('render_jobs')
          .select('*')
          .eq('clip_id', clip.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (jobError) throw Object.assign(new Error(jobError.message), { code: jobError.code || 'DATABASE_UNAVAILABLE' });

        return {
          ...clip,
          latest_job: job || null,
        } as ClipRecord;
      })
    );

    return enrichedClips;
  }

  /**
   * Fetches a single clip and its latest render job.
   */
  public static async getClip(clipId: string, userId: string): Promise<ClipRecord> {
    if (!isMongoConfigured) {
      const err = new Error('Database service is not configured.');
      (err as any).code = 'SERVICE_UNAVAILABLE';
      throw err;
    }

    const { data: clip, error } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw Object.assign(new Error(error.message), { code: error.code || 'DATABASE_UNAVAILABLE' });
    if (!clip) {
      const err = new Error('Clip not found or access denied.');
      (err as any).code = 'CLIP_NOT_FOUND';
      throw err;
    }

    const { data: job, error: jobError } = await dataRepository
      .from('render_jobs')
      .select('*')
      .eq('clip_id', clipId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (jobError) throw Object.assign(new Error(jobError.message), { code: jobError.code || 'DATABASE_UNAVAILABLE' });

    return {
      ...clip,
      latest_job: job || null,
    } as ClipRecord;
  }

  /**
   * Generates a short-lived signed URL for previewing the rendered MP4.
   */
  public static async getSignedPreviewUrl(clipId: string, userId: string, expected?: {renderVersion: number; editorVersion: number; jobId: string}): Promise<SignedUrlResult> {
    const clip = await ClipRenderService.getClip(clipId, userId);
    await assertSelectionSourceCurrent(userId,clip.project_id,(clip as any).selection_source_receipt,clip.source_storage_path);

    if (expected && (clip.render_version !== expected.renderVersion || clip.editor_version !== expected.editorVersion ||
        clip.latest_job?.id !== expected.jobId || clip.latest_job?.clip_id !== clipId || clip.latest_job?.status !== 'completed' ||
        clip.latest_job.render_version !== expected.renderVersion || clip.latest_job.editor_version !== expected.editorVersion)) {
      throw new AppError('Clip inputs changed after this render request. Reopen the clip before exporting.', 409, 'RENDER_INPUT_CHANGED');
    }

    if (clip.render_status !== 'ready' || !clip.output_storage_path) {
      const err = new Error('Clip is not ready for preview.');
      (err as any).code = 'CLIP_NOT_READY';
      throw err;
    }

    await enforceSavedRenderFreshness(clip, userId);

    const entitlements = await EntitlementService.resolveUserEntitlements(userId);
    WatermarkService.assertExportAccess(entitlements, clip);

    const expiresIn = 300;
    const signedUrl = await signObjectGet('clips', clip.output_storage_path);

    return {
      signedUrl,
      expiresInSeconds: expiresIn,
    };
  }

  /**
   * Generates a short-lived signed URL with content-disposition download attachment header.
   */
  public static async getSignedDownloadUrl(clipId: string, userId: string): Promise<SignedUrlResult> {
    const clip = await ClipRenderService.getClip(clipId, userId);
    await assertSelectionSourceCurrent(userId,clip.project_id,(clip as any).selection_source_receipt,clip.source_storage_path);

    if (clip.render_status !== 'ready' || !clip.output_storage_path) {
      const err = new Error('Clip is not ready for download.');
      (err as any).code = 'CLIP_NOT_READY';
      throw err;
    }

    await enforceSavedRenderFreshness(clip, userId);

    const entitlements = await EntitlementService.resolveUserEntitlements(userId);
    WatermarkService.assertExportAccess(entitlements, clip);

    // Fetch project title and candidate title for human-friendly filename
    const { data: project } = await dataRepository
      .from('projects')
      .select('title')
      .eq('id', clip.project_id)
      .maybeSingle();

    let candidateTitle = 'clip';
    if (clip.candidate_id) {
      const { data: cand } = await dataRepository
        .from('clip_candidates')
        .select('title')
        .eq('id', clip.candidate_id)
        .maybeSingle();
      if (cand?.title) candidateTitle = cand.title;
    }

    const safeProj = sanitizeFilename(project?.title || 'vireo');
    const safeTitle = sanitizeFilename(candidateTitle);
    const downloadFilename = `vireo-${safeProj}-${safeTitle}.mp4`;

    const expiresIn = 300;
    const signedUrl = await signObjectGet('clips', clip.output_storage_path, downloadFilename);

    return {
      signedUrl,
      filename: downloadFilename,
      expiresInSeconds: expiresIn,
    };
  }

  /**
   * Deletes a clip record, cleans up all rendered video revisions from Storage, and cascades to render_jobs.
   */
  public static async deleteClip(clipId: string, userId: string): Promise<void> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    // Admit deletion BEFORE the storage prefix listing: the marker fences
    // poster/render publication that could land after the listing. A failed
    // cleanup below leaves marker + records in place, so the clip stays
    // retryable and is never reported deleted early.
    const admitted = await admitClipDeletion(userId, clipId);
    if (!admitted) {
      const err = new Error('Clip not found or access denied.');
      (err as any).code = 'CLIP_NOT_FOUND';
      throw err;
    }

    await deletePrefix('clips', clipObjectPrefix(clip.user_id, clip.project_id, clip.id));

    await deleteClipRecords(userId, clipId);
  }

  /**
   * Updates editor configuration (trim, aspect ratio, framing, captions, text overlay, audio).
   * Validates limits strictly and increments editor_version.
   */
  public static async updateClipEditorConfig(
    clipId: string,
    userId: string,
    update: ClipEditorUpdateDTO
  ): Promise<ClipRecord> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    const validRatios: ClipAspectRatio[] = ['9:16', '1:1', '16:9'];
    if (update.aspectRatio && !validRatios.includes(update.aspectRatio)) {
      const err = new Error(`Invalid aspect ratio. Supported: ${validRatios.join(', ')}`);
      (err as any).code = 'INVALID_ASPECT_RATIO';
      throw err;
    }

    const validStyles = ALL_CAPTION_STYLES as readonly CaptionStyle[];
    if (update.captionStyle && !validStyles.includes(update.captionStyle)) {
      const err = new Error(`Invalid caption style. Supported: ${validStyles.join(', ')}`);
      (err as any).code = 'INVALID_CAPTION_STYLE';
      throw err;
    }

    const validPositions: CaptionPosition[] = ['top', 'center', 'bottom'];
    if (update.captionPosition && !validPositions.includes(update.captionPosition)) {
      const err = new Error(`Invalid caption position. Supported: ${validPositions.join(', ')}`);
      (err as any).code = 'INVALID_CAPTION_POSITION';
      throw err;
    }

    // Trim validation: trimStart cannot exceed the candidate start; trimEnd may be
    // NEGATIVE to extend the tail beyond the candidate boundary (beyond-candidate
    // extend), bounded by the source media duration.
    const originalDuration = Number(clip.end_seconds - clip.start_seconds);
    const trimStart = update.trimStartOffset !== undefined
      ? Math.max(0, Number(update.trimStartOffset))
      : Number(clip.trim_start_offset || 0);

    const trimEnd = update.trimEndOffset !== undefined
      ? Number(update.trimEndOffset)
      : Number(clip.trim_end_offset || 0);

    if (isNaN(trimStart) || isNaN(trimEnd) || trimStart < 0) {
      const err = new Error('Trim offsets must be non-negative numbers.');
      (err as any).code = 'INVALID_TRIM';
      throw err;
    }

    const effectiveDuration = Number((originalDuration - trimStart - trimEnd).toFixed(3));
    if (effectiveDuration < 3.0) {
      const err = new Error(`Trimmed duration (${effectiveDuration.toFixed(1)}s) cannot be shorter than 3 seconds.`);
      (err as any).code = 'TRIM_TOO_SHORT';
      throw err;
    }

    if (trimEnd < 0) {
      // Beyond-candidate extension: the effective end (end_seconds - trimEnd) must not
      // exceed the source media duration from the owning project.
      const { data: proj } = await dataRepository
        .from('projects')
        .select('duration_seconds')
        .eq('id', clip.project_id)
        .maybeSingle();
      const sourceDuration = typeof proj?.duration_seconds === 'number' && proj.duration_seconds > 0
        ? proj.duration_seconds
        : null;
      const requestedEnd = Number((clip.end_seconds - trimEnd).toFixed(3));
      if (sourceDuration === null || requestedEnd > Number((sourceDuration + 0.05).toFixed(3))) {
        throw new AppError(
          sourceDuration === null
            ? 'Cannot extend beyond the candidate boundary: source duration is unknown.'
            : `Cannot extend to ${requestedEnd.toFixed(1)}s: source media is ${sourceDuration.toFixed(1)}s.`,
          400,
          'EXTEND_BEYOND_SOURCE'
        );
      }
    }

    // Crop config
    let safeCrop = clip.crop_config || { mode: 'center', focusX: 0.5, focusY: 0.5 };
    if (update.cropConfig) {
      const mode: CropMode = (['smart', 'manual', 'fit', 'fit_blur'] as const).includes(update.cropConfig.mode as any) ? (update.cropConfig.mode as CropMode) : 'center';
      // Preserve stored layout geometry (layout_mode/split/screencast, e.g.
      // measured split anchors from analysis) unless this update overrides it:
      // the editor's save always sends cropConfig, so rebuilding from scratch
      // here would wipe the stored layout on every unrelated editor save.
      const validLayouts = ['track', 'split', 'screencast', 'blur'] as const;
      const incomingLayout = (update.cropConfig as any).layout_mode;
      const incomingLayoutSource = (update.cropConfig as any).layout_mode_source;
      const recordedLayoutSource = ['auto', 'genre_recommendation', 'user', 'legacy_unknown'].includes(incomingLayoutSource)
        ? incomingLayoutSource
        : undefined;
      const hasIncomingLayout = Boolean(incomingLayout && (validLayouts as readonly string[]).includes(incomingLayout));
      const clampSpeakerX = (v: unknown): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.min(0.9, Math.max(0.1, n)) : undefined;
      };
      const incomingSplit = (update.cropConfig as any).split;
      const incomingScreencast = (update.cropConfig as any).screencast;
      safeCrop = {
        ...safeCrop,
        mode,
        ...explicitCropScaleUpdate(update.cropConfig),
        focusX: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusX ?? 0.5))),
        focusY: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.focusY ?? 0.5))),
        smart: update.cropConfig.smart ? {
          trackId: update.cropConfig.smart.trackId ? String(update.cropConfig.smart.trackId) : undefined,
          strength: Math.min(1.0, Math.max(0.0, Number(update.cropConfig.smart.strength ?? 1.0))),
        } : undefined,
        // Studio saves serialize automatic defaults too. Honor their recorded
        // ownership; retain the legacy layout-only API's manual-pick default.
        ...(hasIncomingLayout
          ? { layout_mode: incomingLayout, layout_mode_source: recordedLayoutSource ?? 'user' as const }
          : recordedLayoutSource === 'auto' ? { layout_mode_source: 'auto' as const } : {}),
        ...(incomingSplit
          ? {
              split: {
                speaker1X: clampSpeakerX(incomingSplit.speaker1X),
                speaker2X: clampSpeakerX(incomingSplit.speaker2X),
                ...(incomingSplit.dividerColor ? { dividerColor: String(incomingSplit.dividerColor).slice(0, 9) } : {}),
                ...(incomingSplit.fit === 'cover' || incomingSplit.fit === 'contain' ? { fit: incomingSplit.fit } : {}),
                ...(typeof incomingSplit.dividerX === 'number' && Number.isFinite(incomingSplit.dividerX)
                  ? { dividerX: Math.min(0.95, Math.max(0.05, incomingSplit.dividerX)) } : {}),
              },
            }
          : {}),
        ...(incomingScreencast
          ? {
              screencast: {
                ...safeCrop.screencast,
                ...incomingScreencast,
                mode: ['split_stacked', 'circular_inset', 'rounded_card_inset'].includes(incomingScreencast.mode)
                  ? incomingScreencast.mode
                  : safeCrop.screencast?.mode,
              },
            }
          : {}),
      };
      // The explicit Auto action removes the item's manual layout geometry.
      // Mirror that release instead of retaining the clip's previous manual pick.
      if (recordedLayoutSource === 'auto' && !hasIncomingLayout) {
        delete safeCrop.layout_mode;
        delete safeCrop.split;
        delete safeCrop.screencast;
      }
    }


    // Overlay config
    // Preserve an unset overlay_config (undefined) so the auto-headline keeps firing for
    // untouched clips; only an explicit overlayConfig update changes it. Previously this
    // defaulted to { enabled: false }, silently suppressing the headline on any editor save.
    let safeOverlay = clip.overlay_config;
    if (update.overlayConfig) {
      const text = typeof update.overlayConfig.text === 'string'
        ? update.overlayConfig.text.replace(/[\r\n]+/g, ' ').replace(/['\\]/g, '').slice(0, 120).trim()
        : '';
      safeOverlay = {
        enabled: Boolean(update.overlayConfig.enabled),
        text,
        position: update.overlayConfig.position || 'top',
        size: update.overlayConfig.size || 'md',
      };
    }

    // Caption config validation & sanitization
    let safeCaptionConfig: CaptionConfig = clip.caption_config || {};
    if (update.captionConfig) {
      const incoming = update.captionConfig;
      const sanitized: CaptionConfig = {};

      if (incoming.fontFamily) {
        sanitized.fontFamily = CaptionService.validateFontFamily(String(incoming.fontFamily));
      }
      if (incoming.fontSize !== undefined) {
        sanitized.fontSize = clampCaptionFontSize(Number(incoming.fontSize), incoming.fontFamily !== undefined ? incoming.fontFamily : safeCaptionConfig.fontFamily);
      }
      if (incoming.fontWeight !== undefined) {
        const fw = Math.round(Number(incoming.fontWeight) || 700);
        sanitized.fontWeight = [400, 500, 600, 700, 800, 900].includes(fw) ? fw : 700;
      }
      if (incoming.uppercase !== undefined) {
        sanitized.uppercase = Boolean(incoming.uppercase);
      }

      const hexRegex = /^#?([0-9a-fA-F]{6})$/;
      if (incoming.textColor && hexRegex.test(incoming.textColor)) {
        sanitized.textColor = incoming.textColor.startsWith('#') ? incoming.textColor : `#${incoming.textColor}`;
      } else if (incoming.primaryColor && hexRegex.test(incoming.primaryColor)) {
        sanitized.textColor = incoming.primaryColor.startsWith('#') ? incoming.primaryColor : `#${incoming.primaryColor}`;
      }

      if (incoming.activeWordColor && hexRegex.test(incoming.activeWordColor)) {
        sanitized.activeWordColor = incoming.activeWordColor.startsWith('#') ? incoming.activeWordColor : `#${incoming.activeWordColor}`;
      } else if (incoming.highlightColor && hexRegex.test(incoming.highlightColor)) {
        sanitized.activeWordColor = incoming.highlightColor.startsWith('#') ? incoming.highlightColor : `#${incoming.highlightColor}`;
      }

      if (incoming.strokeColor && hexRegex.test(incoming.strokeColor)) {
        sanitized.strokeColor = incoming.strokeColor.startsWith('#') ? incoming.strokeColor : `#${incoming.strokeColor}`;
      } else if (incoming.outlineColor && hexRegex.test(incoming.outlineColor)) {
        sanitized.strokeColor = incoming.outlineColor.startsWith('#') ? incoming.outlineColor : `#${incoming.outlineColor}`;
      }

      if (incoming.strokeWidth !== undefined || incoming.outlineWidth !== undefined) {
        const sw = Number(incoming.strokeWidth ?? incoming.outlineWidth);
        sanitized.strokeWidth = Math.min(8, Math.max(0, Number(sw.toFixed(1))));
      }

      if (incoming.shadowEnabled !== undefined) {
        sanitized.shadowEnabled = Boolean(incoming.shadowEnabled);
      }
      if (incoming.shadowOpacity !== undefined) {
        sanitized.shadowOpacity = Math.min(1.0, Math.max(0.0, Number(Number(incoming.shadowOpacity).toFixed(2))));
      }
      if (incoming.shadow !== undefined) {
        sanitized.shadow = Math.min(5, Math.max(0, Number(Number(incoming.shadow).toFixed(1))));
      }

      if (incoming.backgroundEnabled !== undefined) {
        sanitized.backgroundEnabled = Boolean(incoming.backgroundEnabled);
      }
      if (incoming.backgroundColor && hexRegex.test(incoming.backgroundColor)) {
        sanitized.backgroundColor = incoming.backgroundColor.startsWith('#') ? incoming.backgroundColor : `#${incoming.backgroundColor}`;
      }
      if (incoming.backgroundOpacity !== undefined) {
        sanitized.backgroundOpacity = Math.min(1.0, Math.max(0.0, Number(Number(incoming.backgroundOpacity).toFixed(2))));
      }

      if (incoming.position && ['top', 'center', 'bottom'].includes(incoming.position)) {
        sanitized.position = incoming.position as CaptionPosition;
      }
      if (incoming.positionY !== undefined) {
        sanitized.positionY = Math.min(1.0, Math.max(0.0, Number(Number(incoming.positionY).toFixed(3))));
      }
      if (incoming.positionX !== undefined) {
        sanitized.positionX = Math.min(1.0, Math.max(0.0, Number(Number(incoming.positionX).toFixed(3))));
      }
      if (incoming.textAlign && ['left', 'center', 'right'].includes(incoming.textAlign)) {
        sanitized.textAlign = incoming.textAlign as any;
      }

      if (incoming.maxWordsPerCue !== undefined) {
        sanitized.maxWordsPerCue = Math.min(15, Math.max(1, Math.round(Number(incoming.maxWordsPerCue))));
      }
      if (incoming.maxLines !== undefined) {
        sanitized.maxLines = Math.min(2, Math.max(1, Math.round(Number(incoming.maxLines))));
      }

      if (incoming.animation && ['none', 'fade', 'pop', 'word_pop'].includes(incoming.animation)) {
        sanitized.animation = incoming.animation as any;
      }
      if (incoming.kinetic !== undefined) {
        sanitized.kinetic = Boolean(incoming.kinetic);
      }
      if (incoming.activeWordScale !== undefined) {
        sanitized.activeWordScale = Math.min(1.25, Math.max(1.05, Number(Number(incoming.activeWordScale).toFixed(2))));
      }

      // Preset gallery: keep only a known preset ID; unknown IDs are dropped (render falls back safely)
      const hasPresetPayload = incoming.presetId !== undefined;
      if (hasPresetPayload) {
        if (isCaptionPresetId(incoming.presetId)) {
          sanitized.presetId = incoming.presetId;
        } else {
          logger.warn(`[ClipEditor] Ignoring unknown caption presetId for clip ${clipId}. Supported: ${CAPTION_PRESET_IDS.join(', ')}`);
        }
        sanitized.presetOverrides = sanitizePresetOverrides(incoming.presetOverrides, sanitized.presetId ? resolveCaptionPreset(sanitized.presetId as any).fontFamily : undefined);
      }

      if (Array.isArray(incoming.caption_overrides)) {
        sanitized.caption_overrides = incoming.caption_overrides
          .filter((o: any) => o && typeof o.cueId === 'string' && typeof o.text === 'string')
          .map((o: any) => ({
            cueId: String(o.cueId).slice(0, 50),
            text: CaptionService.sanitizeAssText(o.text).slice(0, 200),
          }));
      } else if (Array.isArray(clip.caption_config?.caption_overrides)) {
        sanitized.caption_overrides = clip.caption_config.caption_overrides;
      }

      if (hasPresetPayload) {
        // A preset payload is the complete preset selection: replace stale preset fields instead of
        // merging them, while keeping manual cue corrections and unrelated legacy settings.
        const { presetId: _oldPreset, presetOverrides: _oldOverrides, ...rest } = safeCaptionConfig;
        safeCaptionConfig = { ...rest, ...sanitized };
        if (!sanitized.presetId) delete safeCaptionConfig.presetId;
      } else {
        safeCaptionConfig = { ...safeCaptionConfig, ...sanitized };
      }
    }

    // Background Music config validation & sanitization
    let safeBackgroundMusic = clip.background_music;
    if (update.backgroundMusic !== undefined) {
      if (update.backgroundMusic === null) {
        safeBackgroundMusic = undefined;
      } else {
        const incoming = update.backgroundMusic;
        safeBackgroundMusic = {
          enabled: incoming.enabled !== undefined ? Boolean(incoming.enabled) : true,
          track_id: incoming.track_id ? String(incoming.track_id).slice(0, 100) : undefined,
          source_path: incoming.source_path ? String(incoming.source_path).slice(0, 500) : undefined,
          storage_path: incoming.storage_path ? String(incoming.storage_path).slice(0, 500) : undefined,
          volume: incoming.volume !== undefined ? Math.min(2.0, Math.max(0.0, Number(incoming.volume))) : 0.25,
          ducking_enabled: incoming.ducking_enabled !== undefined ? Boolean(incoming.ducking_enabled) : true,
          ducking_preset: incoming.ducking_preset && ['subtle', 'balanced', 'strong', 'custom'].includes(incoming.ducking_preset) ? incoming.ducking_preset : 'balanced',
          fade_in: incoming.fade_in !== undefined ? Math.min(5.0, Math.max(0.0, Number(incoming.fade_in))) : 0.2,
          fade_out: incoming.fade_out !== undefined ? Math.min(5.0, Math.max(0.0, Number(incoming.fade_out))) : 0.5,
          loop: incoming.loop !== undefined ? Boolean(incoming.loop) : true,
        };
      }
    }

    // Audio
    if(update.volume!==undefined&&!Number.isFinite(Number(update.volume)))throw new AppError('Volume must be a finite number.',400,'INVALID_VOLUME');
    const safeVolume = update.volume !== undefined
      ? Math.min(2.0, Math.max(0.0, Number(update.volume)))
      : (clip.volume ?? 1.0);
    const safeMuted = update.muted !== undefined ? Boolean(update.muted) : Boolean(clip.muted);

    const nextEditorVersion = Number(clip.editor_version || 1) + 1;

    const payload: any = {
      trim_start_offset: trimStart,
      trim_end_offset: trimEnd,
      aspect_ratio: update.aspectRatio || clip.aspect_ratio,
      caption_enabled: update.captionEnabled !== undefined ? Boolean(update.captionEnabled) : (clip.caption_enabled ?? true),
      caption_style: update.captionStyle || clip.caption_style || 'clean',
      caption_position: update.captionPosition || clip.caption_position || 'bottom',
      caption_config: safeCaptionConfig,
      crop_config: safeCrop,
      ...(safeOverlay !== undefined ? { overlay_config: safeOverlay } : {}),
      volume: safeVolume,
      muted: safeMuted,
      background_music: safeBackgroundMusic,
      editor_version: nextEditorVersion,
      updated_at: new Date(),
    };

    const updated=await syncClipEditorRevision(await getMongoClient(),await getMongoDb(),{clipId,userId,expectedClipVersion:Number(clip.editor_version||1),project:update.editorProjectRevision,payload});

    // Beyond-candidate extend backstop: when the tail grows, record the
    // pre-extend caption coverage on an editor project that predates the
    // marker, so the studio appends the newly exposed span on the FIRST
    // reopen. Marker only; existing cues are never mutated.
    const oldEffectiveEnd = Number((clip.end_seconds - Number(clip.trim_end_offset || 0)).toFixed(3));
    const newEffectiveEnd = Number((clip.end_seconds - trimEnd).toFixed(3));
    if (newEffectiveEnd > oldEffectiveEnd + 0.001) {
      try {

        const oldCovered = Number(
          (oldEffectiveEnd - Number(clip.start_seconds + Number(clip.trim_start_offset || 0))).toFixed(3)
        );
        const { data: ep } = await dataRepository
          .from('editor_projects')
          .select('*')
          .eq('clip_id', clipId)
          .maybeSingle();
        if (ep && Array.isArray(ep.tracks)) {
          let changed = false;
          const tracks = ep.tracks.map((t: any) => {
            if (t?.type !== 'CAPTION' || t.hidden || !Array.isArray(t.items)) return t;
            return {
              ...t,
              items: t.items.map((i: any) => {
                if (i.hidden || !i.caption || !Array.isArray(i.caption.cues) || i.caption.cues.length === 0) return i;
                if (i.caption.cues_covered_end != null) return i;
                changed = true;
                // Marker lives in the item's cue time base: items whose cues
                // are relative to timeline_start get coverage minus the offset.
                const startOff = Number(i.timeline_start || 0);
                const isRel = startOff > 0 && i.caption.cues[0].start < startOff - 0.05;
                const marker = isRel ? Number((oldCovered - startOff).toFixed(3)) : oldCovered;
                return { ...i, caption: { ...i.caption, cues_covered_end: Math.max(0, marker) } };
              }),
            };
          });
          if (changed) {
            await dataRepository
              .from('editor_projects')
              .update({ tracks, updated_at: new Date() })
              .eq('id', ep.id).eq('version',ep.version);
          }
        }
      } catch (markerErr: any) {
        logger.warn('Caption coverage marker backfill failed (non-fatal)', { clipId, error: markerErr?.message });
      }
    }

    return updated as unknown as ClipRecord;
  }

  /**
   * Resets clip editor configuration back to Phase 11 baseline defaults.
   */
  public static async resetClipEditorConfig(clipId: string, userId: string): Promise<ClipRecord> {
    const clip = await ClipRenderService.getClip(clipId, userId);

    const payload: any = {
      trim_start_offset: 0,
      trim_end_offset: 0,
      aspect_ratio: '9:16',
      caption_enabled: true,
      caption_style: 'clean',
      caption_position: 'bottom',
      caption_config: {},
      crop_config: { focusX: 0.5, focusY: 0.5 },
      overlay_config: { enabled: false, text: '' },
      volume: 1.0,
      muted: false,
      background_music: null,
      editor_version: Number(clip.editor_version || 1) + 1,
      updated_at: new Date().toISOString(),
    };

    const { data: resetClip, error } = await dataRepository
      .from('clips')
      .update(payload)
      .eq('id', clipId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to reset editor config: ${error.message}`);
    }

    return resetClip as ClipRecord;
  }

  /**
   * Fetches complete editor data bundle for frontend workspace
   */
  public static async getClipEditorData(clipId: string, userId: string): Promise<{
    clip: ClipRecord;
    timingMode: string;
    availablePresets: CaptionStyle[];
    previewUrl?: string;
    cleanSourceUrl?: string;
    renderedPreviewUrl?: string;
    editorProject?: any;
    watermarkRequired?: boolean;
    sourceTextReview?:SourceTextReviewNotice|null;
  }> {
    let clip = await ClipRenderService.getClip(clipId, userId);

    // Get timing mode from transcript
    let timingMode = 'segment';
    try {
      const { data: trans } = await dataRepository
        .from('transcripts')
        .select('words')
        .eq('project_id', clip.project_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (trans && Array.isArray(trans.words) && trans.words.length > 0) {
        timingMode = 'word';
      }
    } catch {}

    let cleanSourceUrl: string | undefined;
    try {
      if (clip.source_storage_path) {
        cleanSourceUrl = await signObjectGet('source', clip.source_storage_path);
      }
    } catch (e: any) {
      logger.warn(`Failed to sign clean source for clip ${clipId}: ${e.message}`);
    }

    let renderedPreviewUrl: string | undefined;
    if (clip.render_status === 'ready' && clip.output_storage_path) {
      try {
        const preview = await ClipRenderService.getSignedPreviewUrl(clipId, userId);
        renderedPreviewUrl = preview.signedUrl;
      } catch {}
    }

    let editorProject: any = null;
    try {
      editorProject = await ProEditorService.getOrCreateEditorProject(clipId, userId);
      // Completion may have won after the initial clip read but before the
      // atomic editable read. Return its current clip revision, not v1 + editor v2.
      if(config.pendingHookInitialization)clip=await ClipRenderService.getClip(clipId,userId);
    } catch (e: any) {
      if(e?.code==='COLD_OPEN_TIMING_REVIEW_REQUIRED')throw e;
      logger.warn(`Could not load or create EditorProject for clip ${clipId}: ${e.message}`);
    }

    const availablePresets: CaptionStyle[] = [
      'clean',
      'bold',
      'minimal',
      'podcast',
      'highlight',
      'karaoke',
    ];

    const previewUrl = renderedPreviewUrl || cleanSourceUrl;

    // Actual applicable entitlement: whether exports for this user carry the
    // watermark, so the studio preview can say so before they export.
    let watermarkRequired = false;
    try {
      watermarkRequired = await WatermarkService.shouldWatermark(userId);
    } catch {
      watermarkRequired = true; // fail closed: assume watermarked when unknown
    }

    return {
      clip,
      timingMode,
      availablePresets,
      previewUrl,
      cleanSourceUrl,
      renderedPreviewUrl,
      editorProject,
      watermarkRequired,
      sourceTextReview:sourceTextReviewNotice(clip),
    };
  }

  /**
   * Resolves a local file path for background music from track_id, source_path, or storage_path.
   * Returns null if missing, inaccessible, or disabled.
   */
  public static async resolveBackgroundMusicPath(
    musicConfig?: QuickClipMusicConfig,
    userId?: string
  ): Promise<string | null> {
    if (!musicConfig || musicConfig.enabled === false) return null;

    if (musicConfig.source_path && typeof musicConfig.source_path === 'string' && fs.existsSync(musicConfig.source_path)) {
      return musicConfig.source_path;
    }
    if (musicConfig.storage_path && typeof musicConfig.storage_path === 'string' && fs.existsSync(musicConfig.storage_path)) {
      return musicConfig.storage_path;
    }
    if (musicConfig.track_id && typeof musicConfig.track_id === 'string') {
      try {
        let query = dataRepository.from('audio_assets').select('*').eq('id', musicConfig.track_id);
        if (userId) {
          query = query.eq('user_id', userId);
        }
        const { data: asset } = await query.maybeSingle();
        if (asset?.storage_path && fs.existsSync(asset.storage_path)) {
          return asset.storage_path;
        }
      } catch (err: any) {
        logger.warn(`[ClipRender] Error resolving audio asset ${musicConfig.track_id}: ${err.message}`);
      }
    }
    return null;
  }

  /**
   * Compiles the FFmpeg audio filter complex for Quick Clips with optional background music and dynamic ducking.
   */
  public static compileQuickClipAudioGraph(options: {
    durationSec: number;
    clipVolume?: number;
    backgroundMusic?: QuickClipMusicConfig;
    resolvedMusicPath?: string | null;
  }): QuickClipAudioGraph {
    const {
      durationSec,
      clipVolume = 1.0,
      backgroundMusic,
      resolvedMusicPath,
    } = options;

    const safeDuration = Math.max(0.1, Number(durationSec.toFixed(3)));
    const dialogueVol = Math.min(2.0, Math.max(0.0, Number(clipVolume ?? 1.0)));

    if (
      !backgroundMusic ||
      backgroundMusic.enabled === false ||
      !resolvedMusicPath ||
      !fs.existsSync(resolvedMusicPath)
    ) {
      return {
        hasBackgroundMusic: false,
        inputArgs: [],
        filterComplex: [],
        audioMap: '0:a',
      };
    }

    const musicVol = Math.min(2.0, Math.max(0.0, Number(backgroundMusic.volume ?? 0.25)));
    const fadeIn = Math.min(5.0, Math.max(0.0, Number(backgroundMusic.fade_in ?? 0.2)));
    const fadeOut = Math.min(5.0, Math.max(0.0, Number(backgroundMusic.fade_out ?? 0.5)));
    const fadeOutStart = Math.max(0.0, Number((safeDuration - fadeOut).toFixed(2)));
    const shouldLoop = backgroundMusic.loop !== false;

    const inputArgs: string[] = ['-i', resolvedMusicPath];

    const isDucking = backgroundMusic.ducking_enabled !== false;
    const filterComplex: string[] = [];

    // 1. Dialogue path
    if (isDucking) {
      filterComplex.push(`[0:a]volume=${dialogueVol.toFixed(2)},asplit=2[a_dialogue_mix][a_dialogue_sc]`);
    } else {
      filterComplex.push(`[0:a]volume=${dialogueVol.toFixed(2)}[a_dialogue_mix]`);
    }

    // 2. Music path: loop if requested, trim to clip duration, reset PTS, apply volume, fade in and out
    const musicPreFilters: string[] = [];
    if (shouldLoop) {
      musicPreFilters.push('aloop=loop=-1:size=2e+09');
    }
    musicPreFilters.push(
      `atrim=0:${safeDuration.toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
      `volume=${musicVol.toFixed(2)}`,
      `afade=t=in:ss=0:d=${fadeIn.toFixed(2)}`,
      `afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOut.toFixed(2)}`
    );
    filterComplex.push(`[1:a]${musicPreFilters.join(',')}[a_music_prep]`);

    // 3. Sidechain Ducking filter
    if (isDucking) {
      const duckingPreset = backgroundMusic.ducking_preset || 'balanced';
      const duckingConfig = AudioDuckingService.resolveDuckingConfig(
        backgroundMusic.ducking_config || duckingPreset
      );
      const duckFilters = AudioDuckingService.compileSidechainFilter(
        '[a_dialogue_sc]',
        '[a_music_prep]',
        '[a_music_ducked]',
        duckingConfig
      );
      filterComplex.push(...duckFilters);
    } else {
      filterComplex.push('[a_music_prep]anull[a_music_ducked]');
    }

    // 4. Mix dialogue + ducked music + master peak limiter
    filterComplex.push(
      '[a_dialogue_mix][a_music_ducked]amix=inputs=2:duration=first:dropout_transition=2,alimiter=limit=-1.0dB:attack=5:release=50:level=0[out_a]'
    );

    return {
      hasBackgroundMusic: true,
      musicPath: resolvedMusicPath,
      inputArgs,
      filterComplex,
      audioMap: '[out_a]',
    };
  }

  /**
   * Evaluates whether an EditorProject contains custom pro edits (cuts, splits, trims,
   * speed/volume changes, keyframes, effects, color grading, B-roll, audio, images, or overlays).
   */
  public static hasCustomProEdits(project: any, clip?: any): boolean {
    if (!project || !Array.isArray(project.tracks)) return false;
    // An explicitly empty/hidden base must not bypass the compiler and reveal source.
    if (primaryVisibleVideoItems(project).length === 0) return true;
    const primaryTrack=project.tracks.find((t:any)=>t.type==='VIDEO'&&!t.hidden);
    if(primaryTrack?.muted||primaryTrack?.items?.some((i:any)=>!i.hidden&&i.muted))return true;
    if (usesGeneratedSliceGraph(primaryVisibleVideoItems(project),project.canvas?.duration)) return true;

    const clipStart = Number(clip?.start_seconds || 0);
    const trimStart = Number(clip?.trim_start_offset || 0);
    const expectedBaseSourceStart = Number((clipStart + trimStart).toFixed(3));

    return project.tracks.some((t: any) => {
      if (t.type === 'VIDEO') {
        // Multi-slice from cuts or splits
        if (t.items && t.items.length > 1) return true;
        if (!t.items || t.items.length === 0) return false;

        return t.items.some((i: any) => {
          const hasKeyframes = Array.isArray(i.keyframes) && i.keyframes.length > 0;
          const hasEffects = Array.isArray(i.effects) && i.effects.length > 0;
          const hasColor = Boolean(i.color);
          const hasFilter = i.filter && i.filter.preset && i.filter.preset !== 'none';
          const hasCustomSpeed =
            i.speed !== undefined &&
            (typeof i.speed === 'number' ? i.speed !== 1 : i.speed?.speed !== 1);
          const hasCustomAudio =
            i.audio &&
            ((i.audio.volume !== undefined && i.audio.volume !== 1) ||
              i.audio.fade_in ||
              i.audio.fade_out);
          // Per-item crop state (fit / blur / custom mode, or any zoom) only
          // lands through the pro compiler's buildSliceCropFilter - the
          // clip-level reframe path never reads item.crop, so without this a
          // layout-toggle or wheel-zoom change on an otherwise plain clip
          // silently exported with the default fill.
          const cropMode = i.crop?.mode;
          const cropScale = Number(i.crop?.scale ?? 1);
          const hasCustomCrop = Boolean(
            i.crop && ((cropMode && cropMode !== 'fill') || Math.abs(cropScale - 1) > 0.001)
          );
          // A framing window (valid or not) only compiles in the Pro graph: force it, and let the compiler reject invalid ones.
          const hasFramingWindow = i.framing_window !== undefined;
          const hasModifiedTimelineStart = i.timeline_start !== 0;
          const hasModifiedSourceStart =
            clip &&
            i.source_start !== undefined &&
            Math.abs(i.source_start - expectedBaseSourceStart) > 0.05;

          return (
            Boolean(i.is_freeze || i.is_title_card) ||
            hasKeyframes ||
            hasEffects ||
            hasColor ||
            hasFilter ||
            hasCustomSpeed ||
            hasCustomAudio ||
            hasCustomCrop ||
            hasFramingWindow ||
            Boolean(i.scene_layout_overrides?.length) ||
            i.crop_config?.layout_mode_source==='auto' ||
            hasModifiedTimelineStart ||
            hasModifiedSourceStart
          );
        });
      }

      if (t.type === 'TEXT' && t.items && t.items.length > 0) return true;
      if (t.type === 'AUDIO' && t.items && t.items.length > 0) return true;
      if (t.type === 'IMAGE' && t.items && t.items.length > 0) return true;
      if (t.name?.toLowerCase().includes('b-roll') && t.items && t.items.length > 0) return true;

      return false;
    });
  }
}
