import {selectionSourceReceiptMatches} from '../shared/selectionSourceReceipt.js';
import {cutUnion,cutProducerProject} from '../shared/producerRangeCuts.js';
import {producerItemPunch} from '../shared/producerItemPunch.js';
import {getMongoDb,getMongoClient} from '../db/mongoClient.js';
import {commitProducerApply,findProducerApply} from '../db/repositories/producerApplyRepository.js';
import {assertRenderAdmissionEnabled} from '../db/repositories/renderAdmissionRepository.js';
import {assertRenderPlanPreflight} from './renderPlanPreflight.js';
import {assertSelectionSourceCurrent} from './selectionSourceGuardService.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { buildPunchInZoompan } from '../utils/punchInTiming.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  AppError,
  ClipRecord,
  EditorProject,
  ProjectRecord,
  ProducerEditPlan,
  ProducerOperation,
  ClipAspectRatio,
  CropConfig,
  OverlayConfig,
  CaptionConfig,
  CaptionStyle,
  CaptionPosition,
  isValidUUID,
} from '../types/index.js';
import {
  downloadObjectToFile,
  uploadFile,
  signObjectGet,
} from './objectStorageService.js';
import { CaptionService } from './captionService.js';
import { ClipRenderService, buildCropFilter, launchInlineRender } from './clipRenderService.js';
import { LoudnormTwoPassService } from './loudnormTwoPassService.js';
import { ProEditorService } from './proEditorService.js';
import { sanitizePlanOperations, clipSpanSeconds } from './planSafetyService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

export interface RenderGraphResult {
  inputPath: string;
  outputPath: string;
  startTime: number;
  duration: number;
  sourceDuration?: number;
  videoFilters: string[];
  audioFilters: string[];
  /** LUFS target when NORMALIZE_AUDIO is enabled; the executor upgrades the one-pass
   * loudnorm entry in audioFilters to a measured linear two-pass variant. */
  normalizeTargetI?: number;
  /** Set by the executor when linear loudnorm is infeasible: the seeked audio window
   * (pre-loudnorm filters + legacy dynamic loudnorm) pre-rendered into a bounded
   * audio-only WAV. audioFilters then holds only the post-loudnorm filters. */
  normalizedAudioPath?: string;
}

export class ProducerRenderService {
  /**
   * Generates a lightweight 720p preview render executing the plan's edits.
   * Uploads to storage or provides local access and updates plan status to 'preview_ready'.
   */
  public static async generatePreview(
    planId: string,
    userId: string,
    customSourcePath?: string
  ): Promise<{ previewUrl: string; duration: number }> {
    if (!isValidUUID(planId)) {
      throw new AppError('Invalid plan ID format.', 400, 'INVALID_UUID');
    }

    // 1. Fetch plan
    const { data: plan, error: planErr } = await dataRepository
      .from('producer_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();

    if (planErr || !plan) {
      throw new AppError('Producer plan not found or access denied.', 404, 'PLAN_NOT_FOUND');
    }

    // 2. Fetch clip
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', plan.clip_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      throw new AppError('Clip not found.', 404, 'CLIP_NOT_FOUND');
    }

    // Code-enforced plan limits: clamp/drop out-of-range operations before render.
    const previewSanitize = sanitizePlanOperations(plan.operations, clipSpanSeconds(clip), clip.start_seconds);
    plan.operations = previewSanitize.operations;
    for (const w of previewSanitize.warnings) {
      logger.warn(`[ProducerSafety] plan ${plan.id}: ${w}`);
    }

    // 3. Fetch project
    const { data: project, error: projErr } = await dataRepository
      .from('projects')
      .select('*')
      .eq('id', clip.project_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (projErr || !project) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    // Update status to preview_rendering
    await dataRepository
      .from('producer_plans')
      .update({ status: 'preview_rendering', updated_at: new Date() })
      .eq('id', planId);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `vireo-prod-preview-${planId.slice(0, 8)}-`));
    const outputPath = path.join(tmpDir, 'producer_preview.mp4');
    let localSourceFile = customSourcePath || '';

    try {
      // 4. Resolve source video file
      if (!localSourceFile || !fs.existsSync(localSourceFile)) {
        if (project.source_storage_path) {
          localSourceFile = path.join(tmpDir, 'source.mp4');
          await ClipRenderService.ensureSourceVideo(project.source_storage_path, localSourceFile, {
            timeoutMs: 60000,
            projectId: project.id,
          });
        } else {
          throw new AppError('Source video is not available for preview rendering.', 400, 'SOURCE_NOT_FOUND');
        }
      }

      // 5. Build render graph filters and timing. Word timings (clip-relative)
      // adapt the punch-in window to speech boundaries when available; the
      // render never fails over a missing transcript - the punch falls back
      // to the plan's raw window with the eased curve.
      let wordTimings: Array<{ start: number; end: number }> | undefined;
      const hasCuts=plan.operations.some((o:ProducerOperation)=>o.type==='REMOVE_RANGE'&&o.enabled&&o.parameters.cut_ranges?.length);
      if(hasCuts)await assertSelectionSourceCurrent(userId,clip.project_id,clip.selection_source_receipt,clip.source_storage_path);
      try {
        const { data: tx,error:txError } = await dataRepository.from('transcripts').select('*').eq('project_id',clip.project_id).eq('user_id',userId).maybeSingle();
        const rawWords=Array.isArray(tx?.words)?tx.words:[];
        if(hasCuts&&(!tx||!selectionSourceReceiptMatches(clip.selection_source_receipt,tx,clip.source_storage_path||'')))throw new AppError('Pause-cut word evidence changed. Review the current source before previewing.',409,'TRANSCRIPT_SOURCE_REVIEW_REQUIRED');
        if(hasCuts&&(txError||!rawWords.length||rawWords.some((w:any)=>typeof w.start!=='number'||typeof w.end!=='number'||!Number.isFinite(w.start)||!Number.isFinite(w.end)||w.start<0||w.end<=w.start)))throw new AppError('Valid source-bound word timings are required before previewing pause cuts.',409,'PRODUCER_CUT_REVIEW_REQUIRED');
        const wt=rawWords.map((w:any)=>({start:Number(w.start)-clip.start_seconds,end:Number(w.end)-clip.start_seconds})).filter((w:any)=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start);
        if(wt.length)wordTimings=wt;
      }catch(error:any){if(hasCuts)throw error;logger.info(`[ProducerRender] Word timings unavailable: ${error.message}`);}
      const renderGraph = await this.buildRenderGraph(plan, clip, localSourceFile, outputPath, tmpDir, wordTimings);

      if(plan.operations.some((o:ProducerOperation)=>o.type==='REMOVE_RANGE'&&o.enabled&&o.parameters.cut_ranges?.length)){const {data:saved,error}=await dataRepository.from('editor_projects').select('id').eq('clip_id',clip.id).eq('user_id',userId).maybeSingle();if(error||saved)throw new AppError('Pause-cut preview needs a fresh timeline. Saved Studio edits were not replaced; use Studio to cut this saved timeline.',409,'PRODUCER_CUT_REVIEW_REQUIRED');}

      // Two-pass loudness normalization: measure the exact seeked audio window,
      // then substitute a linear loudnorm. Fails clearly when infeasible rather
      // than letting ffmpeg silently fall back to dynamic (muxer-stalling) mode.
      if (renderGraph.normalizeTargetI !== undefined) {
        const markerIdx = renderGraph.audioFilters.findIndex((f) => f.startsWith('loudnorm='));
        if (markerIdx !== -1) {
          const targetI = renderGraph.normalizeTargetI;
          const pre = renderGraph.audioFilters.slice(0, markerIdx);
          const post = renderGraph.audioFilters.slice(markerIdx + 1);
          // Meter at the marker position - exactly where the linear gain is
          // applied in the final render.
          const measurementGraph = {
            filterComplex: [`[0:a]${[...pre, LoudnormTwoPassService.buildMeasureFilter(targetI, -2.0, 11)].join(',')}[m_a]`],
            audioMap: '[m_a]',
            targetI,
            dialogueInputLabel: '[0:a]',
            preMarkerFilters: pre,
            postMarkerFilters: post,
          };
          const measured = await LoudnormTwoPassService.measure(
            ['-ss', renderGraph.startTime.toFixed(3), '-t', (renderGraph.sourceDuration??renderGraph.duration).toFixed(3), '-i', renderGraph.inputPath],
            measurementGraph,
            120000
          );
          const check = LoudnormTwoPassService.assessLinearFeasibility(measured, targetI, -2.0, 11);
          if (!check.ok) {
            if (check.fallback !== 'dynamic-prerender') {
              throw new AppError(
                `Loudness normalization cannot be applied to this audio: ${check.reason}`,
                422,
                'NORMALIZATION_INFEASIBLE'
              );
            }
            // Peak-limited/range-limited audio: pre-render the window with legacy
            // dynamic loudnorm (bounded audio-only process; in-graph one-pass would
            // stall the muxer and OOM long windows).
            const wavPath = path.join(tmpDir, 'producer-dialogue-normalized.wav');
            await LoudnormTwoPassService.renderNormalizedDialogue(
              ['-ss', renderGraph.startTime.toFixed(3), '-t', (renderGraph.sourceDuration??renderGraph.duration).toFixed(3), '-i', renderGraph.inputPath],
              measurementGraph,
              wavPath,
              120000
            );
            logger.warn(
              `[ProducerRender] Linear loudnorm infeasible (${check.reason}); using pre-rendered dynamic normalization.`
            );
            renderGraph.normalizedAudioPath = wavPath;
            renderGraph.audioFilters = post;
          } else {
            renderGraph.audioFilters = [
              ...pre,
              LoudnormTwoPassService.buildLinearGainFilter(targetI, measured),
              ...post,
            ];
          }
        }
      }

      logger.info(`[ProducerRender] Rendering preview for plan ${planId}: dur=${renderGraph.duration}s, vf_count=${renderGraph.videoFilters.length}`);

      // 6. Execute FFmpeg
      const ffmpegArgs = [
        '-y',
        '-ss', renderGraph.startTime.toFixed(3),
        '-t', (renderGraph.sourceDuration??renderGraph.duration).toFixed(3),
        '-i', renderGraph.inputPath,
      ];

      if (renderGraph.normalizedAudioPath) {
        ffmpegArgs.push('-i', renderGraph.normalizedAudioPath);
        ffmpegArgs.push('-map', '0:v', '-map', '1:a');
      }

      if (renderGraph.videoFilters.length > 0) {
        ffmpegArgs.push('-vf', renderGraph.videoFilters.join(','));
      }

      ffmpegArgs.push('-c:v', 'libx264', '-preset', config.renderPreset, '-crf', '26', '-pix_fmt', 'yuv420p');

      if (renderGraph.audioFilters.length > 0) {
        ffmpegArgs.push('-af', renderGraph.audioFilters.join(','));
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k');
      } else {
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '128k');
      }

      ffmpegArgs.push(renderGraph.outputPath);

      await execFileAsync(ffmpegBin, ffmpegArgs, { timeout: 120000 });

      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        throw new AppError('Preview MP4 generation failed or produced empty file.', 500, 'FFMPEG_FAILED');
      }

      const outputSize = fs.statSync(outputPath).size;
      const previewStorageKey = `users/${userId}/projects/${clip.project_id}/clips/${clip.id}/producer_preview_${plan.id}.mp4`;

      let finalPreviewUrl = '';

      // Upload if cloud storage is configured
      if (config.r2AccountId && config.r2AccessKeyId) {
        await uploadFile('clips', previewStorageKey, outputPath, outputSize, 'video/mp4');
        finalPreviewUrl = await signObjectGet('clips', previewStorageKey);
      } else {
        // Fallback for local testing / offline dev
        finalPreviewUrl = `/api/clips/${clip.id}/producer/preview-file/${plan.id}`;
      }

      // Update plan record to preview_ready
      await dataRepository
        .from('producer_plans')
        .update({
          status: 'preview_ready',
          preview_video_url: finalPreviewUrl,
          preview_storage_path: previewStorageKey,
          updated_at: new Date(),
        })
        .eq('id', planId);

      return {
        previewUrl: finalPreviewUrl,
        duration: renderGraph.duration,
      };
    } catch (err: any) {
      await dataRepository
        .from('producer_plans')
        .update({ status: 'draft', updated_at: new Date() })
        .eq('id', planId);

      logger.error('Producer preview rendering failed', { planId, error: err.message });
      throw err;
    } finally {
      // Remove temp directory
      try {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  /**
   * Applies the approved ProducerEditPlan to the Clip.
   * Updates clip configurations non-destructively and triggers the background ClipRenderService.
   */
  public static async applyPlanToClip(
    planId: string,
    userId: string,
    expectedClipId?:string
  ): Promise<{ clip: ClipRecord; plan: ProducerEditPlan;renderJob?:any;replayed?:boolean }> {
    if (!isValidUUID(planId)) {
      throw new AppError('Invalid plan ID format.', 400, 'INVALID_UUID');
    }

    // 1. Fetch plan
    const { data: plan, error: planErr } = await dataRepository
      .from('producer_plans')
      .select('*')
      .eq('id', planId)
      .eq('user_id', userId)
      .maybeSingle();

    if (planErr || !plan) {
      throw new AppError('Producer plan not found or access denied.', 404, 'PLAN_NOT_FOUND');
    }

    if(expectedClipId&&plan.clip_id!==expectedClipId)throw new AppError('Producer plan not found for this clip.',404,'PLAN_NOT_FOUND');
    const originalPlan=structuredClone(plan);
    const db=await getMongoDb();
    const prior=await findProducerApply(db,userId,originalPlan);if(prior)return prior as any;
    assertRenderAdmissionEnabled();

    // 2. Fetch clip
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', plan.clip_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      throw new AppError('Clip not found.', 404, 'CLIP_NOT_FOUND');
    }

    await assertSelectionSourceCurrent(userId,clip.project_id,clip.selection_source_receipt,clip.source_storage_path);

    // Code-enforced plan limits: clamp/drop out-of-range operations before
    // persisting anything derived from them to the clip.
    const applySanitize = sanitizePlanOperations(plan.operations, clipSpanSeconds(clip), clip.start_seconds);
    plan.operations = applySanitize.operations;
    for (const w of applySanitize.warnings) {
      logger.warn(`[ProducerSafety] plan ${plan.id}: ${w}`);
    }

    // 3. Extract parameter updates from enabled plan operations
    let trimStartOffset = clip.trim_start_offset || 0;
    let trimEndOffset = clip.trim_end_offset || 0;
    let aspectRatio: ClipAspectRatio = clip.aspect_ratio || '9:16';
    let cropConfig: CropConfig = structuredClone(clip.crop_config) || { mode: 'center', focusX: 0.5, focusY: 0.5 };
    let captionStyle: CaptionStyle = clip.caption_style || 'clean';
    let captionPosition: CaptionPosition = clip.caption_position || 'bottom';
    let captionConfig: CaptionConfig = structuredClone(clip.caption_config) || {};
    let overlayConfig: OverlayConfig = structuredClone(clip.overlay_config) || { enabled: false };
    let volume = clip.volume !== undefined ? clip.volume : 1.0;

    for (const op of plan.operations) {
      if (!op.enabled) continue;

      if (op.type === 'INTRO_TRIM' && op.parameters.start_sec !== undefined) {
        trimStartOffset = Number(op.parameters.start_sec);
      } else if (op.type === 'OUTRO_TRIM' && op.parameters.end_sec !== undefined) {
        trimEndOffset = Number(op.parameters.end_sec);
      } else if (op.type === 'REFRAME') {
        if (op.parameters.aspect_ratio) aspectRatio = op.parameters.aspect_ratio;
        if (op.parameters.crop_mode) cropConfig.mode = op.parameters.crop_mode;
      } else if (op.type === 'CAPTION_STYLE') {
        if (op.parameters.style) captionStyle = op.parameters.style;
        if (op.parameters.position) captionPosition = op.parameters.position;
        if (op.parameters.font_size) captionConfig.fontSize = op.parameters.font_size;
        if (op.parameters.primary_color) captionConfig.primaryColor = op.parameters.primary_color;
      } else if (op.type === 'CAPTION_EMPHASIS') {
        if (op.parameters.highlight_color) {
          captionConfig.highlightColor = op.parameters.highlight_color;
          captionConfig.activeWordColor = op.parameters.highlight_color;
        }
      } else if (op.type === 'HOOK_TEXT') {
        overlayConfig = {
          enabled: true,
          text: op.parameters.text || 'Key Insight',
          position: op.parameters.position_overlay || 'top',
          size: op.parameters.size || 'md',
        };
      } else if (op.type === 'NORMALIZE_AUDIO' && op.parameters.gain_db !== undefined) {
        if (op.parameters.gain_db > 0) {
          volume = Math.min(2.0, 1.0 + op.parameters.gain_db / 10);
        }
      }
    }

    const quotaPolicy=await assertRenderPlanPreflight(userId,undefined,captionStyle);
    const clipUpdates={trim_start_offset:trimStartOffset,trim_end_offset:trimEndOffset,aspect_ratio:aspectRatio,crop_config:cropConfig,caption_style:captionStyle,caption_position:captionPosition,caption_config:captionConfig,overlay_config:overlayConfig,volume};
    const {data:existingEditor,error:editorError}=await dataRepository.from('editor_projects').select('*').eq('clip_id',clip.id).eq('user_id',userId).maybeSingle();
    if(editorError)throw new AppError('Editor project could not be read.',503,editorError.code||'DATABASE_UNAVAILABLE');
    const {data:transcript,error:transcriptError}=await dataRepository.from('transcripts').select('*').eq('project_id',clip.project_id).eq('user_id',userId).maybeSingle();
    if(transcriptError||!transcript)throw new AppError('Transcript could not be read.',503,'DATABASE_UNAVAILABLE');
    const {data:sourceProject,error:sourceProjectError}=await dataRepository.from('projects').select('clip_preferences').eq('id',clip.project_id).eq('user_id',userId).maybeSingle();
    if(sourceProjectError)throw new AppError('Project defaults could not be read.',503,'DATABASE_UNAVAILABLE');
    let editorProject:EditorProject=existingEditor?structuredClone(existingEditor):ProEditorService.buildInitialProducerEditor({...clip,...clipUpdates},userId,plan,transcript,sourceProject?.clip_preferences);
    if(!editorProject||!Array.isArray(editorProject.tracks))throw new AppError('Producer editor preparation failed.',503,'PRODUCER_EDITOR_UNAVAILABLE');

    const videoTrack = editorProject.tracks.find((t) => t.type === 'VIDEO');
    const videoItem = videoTrack?.items[0];

    // A reviewed punch belongs to one main source slice, never a teaser or a
    // guessed manual scale channel. Refusal reaches the existing visible409 UI.
    const punchInOp = plan.operations.find((o: ProducerOperation) => o.type === 'PUNCH_IN' && o.enabled);
    if(punchInOp&&punchInOp.parameters.punch_in_start_sec!==undefined){
      const start=clip.start_seconds+trimStartOffset,end=clip.end_seconds-trimEndOffset;
      const videoOwners=editorProject.tracks.filter(t=>t.type==='VIDEO'&&!t.hidden).flatMap(t=>t.items.filter(i=>!i.hidden).map(item=>({item,track:t})));
      const allVideos=videoOwners.map(row=>row.item);
      const mains=allVideos.filter(i=>i.source_path===clip.source_storage_path&&i.source_asset_id===clip.id&&Math.abs(i.source_start-start)<.001&&Math.abs(i.source_end-end)<.001&&(i.speed?.speed??1)===1&&!i.is_freeze&&!i.is_title_card);
      const conflict=()=>new AppError('Producer punch-in needs review: the saved picture or scale has edits that cannot be safely replaced. Disable Punch-In in this plan or edit the zoom in Studio. No edits were applied.',409,'PRODUCER_PUNCH_REVIEW_REQUIRED');
      if(mains.length!==1||existingEditor&&allVideos.some(i=>(i.keyframes||[]).some(k=>k.property==='scale')||i.transform?.scale!==1))throw conflict();
      const main=mains[0];
      // The compiler uses only the first visible VIDEO track as its base.
      // Matching source clocks on a secondary overlay do not make it main.
      const owningTrack=videoOwners.find(row=>row.item===main)?.track;
      if(owningTrack!==editorProject.tracks.find(t=>t.type==='VIDEO'&&!t.hidden))throw conflict();
      if(Math.abs(main.timeline_end-main.timeline_start-(end-start))>.001||main.locked||owningTrack?.locked||allVideos.some(i=>i!==main&&i.timeline_start<main.timeline_end&&i.timeline_end>main.timeline_start))throw conflict();
      const punch=producerItemPunch(main,punchInOp.parameters,Array.isArray(transcript.words)?transcript.words:[]);
      if(punch.suppressed&&punch.reason==='outside-main-source')throw new AppError('Producer punch-in falls outside the selected main source interval. Disable Punch-In or review its source time before applying. No edits were applied.',409,'PRODUCER_PUNCH_REVIEW_REQUIRED');
      // Fresh initialization may already contain this operation. Replace only
      // that fresh channel; no saved scale keyframe is ever removed here.
      if(!existingEditor)main.keyframes=main.keyframes.filter(k=>k.property!=='scale');
      if(!punch.suppressed)main.keyframes.push({id:crypto.randomUUID(),time:Number(punch.startSec.toFixed(3)),property:'scale',value:punchInOp.parameters.scale||1.06,easing:'ease-in-out'});
    }

    // Sync AUDIO_FADE
    const fadeOp = plan.operations.find((o: ProducerOperation) => o.type === 'AUDIO_FADE' && o.enabled);
    if (videoItem && fadeOp) {
      if (!videoItem.audio) {
        videoItem.audio = { volume: 1.0, fade_in: 0.15, fade_out: 0.25, normalized: true, target_lufs: -16 };
      }
      videoItem.audio.fade_in = fadeOp.parameters.fade_in_sec ?? 0.15;
      videoItem.audio.fade_out = fadeOp.parameters.fade_out_sec ?? 0.25;

    }

    // Sync CAPTION_EMPHASIS
    const emphasisOp = plan.operations.find((o: ProducerOperation) => o.type === 'CAPTION_EMPHASIS' && o.enabled);
    const captionTrack = editorProject.tracks.find((t) => t.type === 'CAPTION');
    if (captionTrack && emphasisOp && emphasisOp.parameters.highlight_color) {
      for (const item of captionTrack.items) {
        if (item.caption) {
          item.caption.highlight_color = emphasisOp.parameters.highlight_color;

        }
      }
    }

    // Sync BRAND_OVERLAY
    const brandOp = plan.operations.find((o: ProducerOperation) => o.type === 'BRAND_OVERLAY' && o.enabled);
    if (brandOp) {
      let textTrack = editorProject.tracks.find((t) => t.type === 'TEXT');
      if (!textTrack) {
        textTrack = {
          id: crypto.randomUUID(),
          type: 'TEXT',
          name: 'Text & Overlays',
          locked: false,
          muted: false,
          hidden: false,
          height: 48,
          items: [],
        };
        editorProject.tracks.push(textTrack);
      }
      const brandText = brandOp.parameters.text || brandOp.parameters.brand_name || 'Brand';
      textTrack.items.push({
        id: crypto.randomUUID(),
        track_id: textTrack.id,
        type: 'TEXT',
        timeline_start: 0,
        timeline_end: Number((clip.end_seconds - clip.start_seconds).toFixed(3)),
        source_start: 0,
        source_end: Number((clip.end_seconds - clip.start_seconds).toFixed(3)),
        transform: { position_x: 0, position_y: -750, scale: 0.85, rotation: 0, opacity: 0.9 },
        speed: { speed: 1.0, pitch_preserved: true },
        text: {
          text: String(brandText),
          font_family: 'Arial',
          font_size: 36,
          font_weight: 'bold',
          italic: false,
          alignment: 'center',
          color: '#FFFFFF',
          background_color: '#00000080',
          preset: 'minimal',
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: 15,
      });

    }

    // Materialize source cuts into the actual queued editor, never metadata only.
    const removeOp=plan.operations.find((o:ProducerOperation)=>o.type==='REMOVE_RANGE'&&o.enabled);
    if(removeOp&&Array.isArray(removeOp.parameters.cut_ranges)&&removeOp.parameters.cut_ranges.length){
      try{
        if(existingEditor)throw Error('saved-editor-ownership');
        if(clip.cold_open?.enabled)throw Error('teaser-preview-ownership');
        if(editorProject.tracks.find(t=>t.type==='VIDEO'&&!t.hidden)?.items.length!==1)throw Error('multi-item-preview-ownership');
        const start=clip.start_seconds+trimStartOffset,end=clip.end_seconds-trimEndOffset;
        const primary=editorProject.tracks.find(t=>t.type==='VIDEO'&&!t.hidden);
        const mains=primary?.items.filter(i=>!i.hidden&&i.source_path===clip.source_storage_path&&i.source_asset_id===clip.id&&Math.abs(i.source_start-start)<.001&&Math.abs(i.source_end-end)<.001)||[];
        if(mains.length!==1)throw Error('main-source-ownership');
        editorProject=cutProducerProject(editorProject,mains[0],removeOp.parameters.cut_ranges,transcript.words||[],Boolean(existingEditor)).next;
      }catch(error){throw new AppError('Producer pause cuts need review: saved edits, speech, or timing cannot be safely preserved. Disable Remove Range or edit the cuts in Studio. No edits were applied.',409,'PRODUCER_CUT_REVIEW_REQUIRED');}
    }

    // Validate without writes. Even unchanged tracks get a new revision so the
    // applied clip and queued editor snapshot share one transaction boundary.
    const stagedUpdates=await ProEditorService.prepareEditorRevision(editorProject,userId,{tracks:editorProject.tracks,canvas:editorProject.canvas,version:editorProject.version});
    // Preserve BSON Date fields; JSON cloning turns them into strings that
    // violate the bootstrapped editor_projects collection validator.
    const stagedEditor={...JSON.parse(JSON.stringify({...editorProject,...stagedUpdates,version:existingEditor?existingEditor.version+1:1})),created_at:editorProject.created_at,updated_at:stagedUpdates.updated_at};
    const result=await commitProducerApply(await getMongoClient(),db,{userId,plan:originalPlan,clip,expectedEditor:existingEditor,editor:stagedEditor,clipUpdates,quotaPolicy});
    if(!result?.clip||!result?.renderJob)throw new AppError('Producer Apply did not return a committed render receipt.',503,'PRODUCER_APPLY_UNVERIFIED');
    if(!result.replayed)launchInlineRender(clip.id,userId,result.renderJob.id);
    return result as any;
  }

  /**
   * Constructs the FFmpeg filter graph and timings from plan operations.
   */
  public static async buildRenderGraph(
    plan: ProducerEditPlan,
    clip: ClipRecord,
    inputPath: string,
    outputPath: string,
    tmpDir: string,
    wordTimings?: Array<{ start: number; end: number }>
  ): Promise<RenderGraphResult> {
    const videoFilters: string[] = [];
    const audioFilters: string[] = [];
    let normTargetI: number | undefined;

    // Calculate baseline start and duration
    let startSec = clip.start_seconds + Number(clip.trim_start_offset||0);
    let endSec = clip.end_seconds - Number(clip.trim_end_offset||0);

    // Apply intro trim
    const introTrim = plan.operations.find((o) => o.type === 'INTRO_TRIM' && o.enabled);
    if (introTrim && introTrim.parameters.start_sec !== undefined) {
      startSec = clip.start_seconds + Number(introTrim.parameters.start_sec);
    }

    // Apply outro trim
    const outroTrim = plan.operations.find((o) => o.type === 'OUTRO_TRIM' && o.enabled);
    if (outroTrim && outroTrim.parameters.end_sec !== undefined) {
      endSec = clip.end_seconds - Number(outroTrim.parameters.end_sec);
    }

    let durationSec = Math.max(1.0, endSec - startSec);

    // 1. Reframe / Aspect Ratio crop
    const reframeOp = plan.operations.find((o) => o.type === 'REFRAME' && o.enabled);
    const targetRatio = (reframeOp?.parameters.aspect_ratio || clip.aspect_ratio || '9:16') as ClipAspectRatio;
    const cropFilter = buildCropFilter(targetRatio, clip.crop_config);
    videoFilters.push(cropFilter);

    // Target resolution dimensions based on aspect ratio
    const targetW = targetRatio === '16:9' ? 1920 : 1080;
    const targetH = targetRatio === '9:16' ? 1920 : 1080;

    // Keep source input length distinct from the shorter output clock. Apply
    // selection after source-clock visual effects and captions, before audio mix.
    const sourceDuration=durationSec;
    const removeOp=plan.operations.find(o=>o.type==='REMOVE_RANGE'&&o.enabled);
    const cuts=cutUnion(removeOp?.parameters.cut_ranges||[],startSec,endSec);
    if(cuts.length&&clip.cold_open?.enabled)throw new AppError('Pause cuts with a teaser need review in Studio. No edits were applied.',409,'PRODUCER_CUT_REVIEW_REQUIRED');
    const sourceWords=(wordTimings||[]).map(w=>({start:w.start+clip.start_seconds,end:w.end+clip.start_seconds}));
    if(cuts.length&&!sourceWords.length)throw new AppError('Word timing evidence is required to verify pause cuts before previewing.',409,'PRODUCER_CUT_REVIEW_REQUIRED');
    if(cuts.some(r=>sourceWords.some(w=>w.start<r.end&&w.end>r.start)))throw new AppError('Producer pause cuts overlap speech. Review the plan before previewing.',409,'PRODUCER_CUT_REVIEW_REQUIRED');
    const outputCutDuration=cuts.reduce((n,r)=>n+r.end-r.start,0);
    if(cuts.length&&sourceDuration-outputCutDuration<1)throw new AppError('Producer cuts leave too little footage. Review the plan.',409,'PRODUCER_CUT_REVIEW_REQUIRED');
    durationSec-=outputCutDuration;

    // 3. Visual Punch-In (Dynamic Crop Zoom on Climax)
    // Word-timing adapted (OpenShorts): window snaps to word boundaries and
    // is suppressed when no word boundary is near (never punch mid-word) or
    // the zoom is imperceptible. The zoom itself eases in/out (ramp-hold-ramp)
    // instead of stepping.
    const punchInOp = plan.operations.find((o) => o.type === 'PUNCH_IN' && o.enabled);
    if (punchInOp && punchInOp.parameters.punch_in_start_sec !== undefined) {
      const adapted = producerItemPunch({source_start:startSec,source_end:endSec},punchInOp.parameters,
        (wordTimings||[]).map(w=>({start:w.start+clip.start_seconds,end:w.end+clip.start_seconds})));
      if(adapted.suppressed&&adapted.reason==='outside-main-source')throw new AppError('Producer punch-in falls outside the selected main source interval. Disable Punch-In or review its source time before previewing.',409,'PRODUCER_PUNCH_REVIEW_REQUIRED');
      if (adapted.suppressed) {
        logger.info(`[ProducerRender] Punch-in suppressed (${adapted.reason})`);
      } else {
        if(cuts.some(r=>startSec+adapted.startSec<r.end&&startSec+adapted.startSec+2.5>r.start))throw new AppError('Pause cut crosses the punch-in window. Disable Punch-In or review the cuts in Studio.',409,'PRODUCER_CUT_REVIEW_REQUIRED');
        // Dynamic punch-in zoom: a time-conditional crop size is a silent
        // no-op (crop w/h are fixed at filter init; verified: zero pixel
        // change). This chain is a linear -vf graph where zoompan is verified
        // to zoom correctly (frame-verified on the fixture source), unlike the
        // pro editor's split/overlay composition which uses segment crop.
        // Pushed BEFORE hook text and captions so burned text keeps its size
        // during the zoom.
        videoFilters.push(
          buildPunchInZoompan({
            startSec: adapted.startSec,
            durationSec: adapted.durationSec,
            scale: adapted.scale,
            targetW,
            targetH,
          })
        );
        if (adapted.reason === 'word_adapted') {
          logger.info(
            `[ProducerRender] Punch-in word-adapted: source${punchInOp.parameters.punch_in_start_sec.toFixed(2)}s -> ${adapted.startSec.toFixed(2)}s+${adapted.durationSec.toFixed(2)}s`
          );
        }
      }
    }

    // 4. Hook Text Banner
    const hookOp = plan.operations.find((o) => o.type === 'HOOK_TEXT' && o.enabled);
    if (hookOp && hookOp.parameters.text) {
      const safeText = String(hookOp.parameters.text).replace(/[\r\n]+/g, ' ').replace(/['\\]/g, '').slice(0, 50).trim();
      if (safeText) {
        const displayStart = hookOp.parameters.display_start_sec || 0;
        const displayEnd = hookOp.parameters.display_end_sec || 3.5;
        const drawTextFilter = `drawtext=text='${safeText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.75:boxborderw=14:x=(w-text_w)/2:y=140:enable='between(t,${displayStart},${displayEnd})'`;
        videoFilters.push(drawTextFilter);
      }
    }

    // 5. Captions (Burn ASS subtitles if caption style is present)
    const captionStyleOp = plan.operations.find((o) => o.type === 'CAPTION_STYLE' && o.enabled);
    if (captionStyleOp || (cuts.length && clip.caption_enabled!==false)) {
      try {
        const assPath = path.join(tmpDir, 'producer_captions.ass');
        const capResult = await CaptionService.generateCaptionsForClip({
          clip: {
            ...clip,
            trim_start_offset:startSec-clip.start_seconds,
            trim_end_offset:clip.end_seconds-endSec,
            caption_style: captionStyleOp?.parameters.style || clip.caption_style || 'clean',
            caption_position: captionStyleOp?.parameters.position || clip.caption_position || 'bottom',
            caption_config: {
              ...clip.caption_config,
              fontSize: captionStyleOp?.parameters.font_size || clip.caption_config?.fontSize || 48,
              primaryColor: captionStyleOp?.parameters.primary_color || clip.caption_config?.primaryColor || '#FFFFFF',
            },
          },
          targetAspectRatio: targetRatio,
          ...(cuts.length?{editorProjectSnapshot:null}:{}),
          outputPath: assPath,
        });

        if (capResult.cues.length > 0 && fs.existsSync(assPath)) {
          const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
          videoFilters.push(`ass=${safeAss}`);
        }
      } catch (capErr: any) {
        if(cuts.length)throw capErr;
        logger.warn(`Producer caption generation skipped: ${capErr.message}`);
      }
    }

    if(cuts.length){
      const conditions=cuts.map(r=>`gte(t\\,${(r.start-startSec).toFixed(6)})*lt(t\\,${(r.end-startSec).toFixed(6)})`).join('+');
      videoFilters.push(`select='not(${conditions})',setpts=N/FRAME_RATE/TB`);
      audioFilters.push(`aselect='not(${conditions})',asetpts=N/SR/TB`);
    }

    // 5. Audio Normalization & Dynamics
    const normOp = plan.operations.find((o) => o.type === 'NORMALIZE_AUDIO' && o.enabled);
    if (normOp) {
      // One-pass loudnorm kept here so a buildRenderGraph result stays directly
      // executable; the preview executor upgrades it to two-pass (see below).
      audioFilters.push('loudnorm=I=-16:TP=-2.0:LRA=11');
      normTargetI = -16;
      if (normOp.parameters.gain_db && normOp.parameters.gain_db > 0) {
        audioFilters.push(`volume=${normOp.parameters.gain_db}dB`);
      }
    }

    // 6. Audio Fades
    const fadeOp = plan.operations.find((o) => o.type === 'AUDIO_FADE' && o.enabled);
    if (fadeOp) {
      const fadeIn = fadeOp.parameters.fade_in_sec || 0.15;
      const fadeOut = fadeOp.parameters.fade_out_sec || 0.25;
      const fadeOutStart = Math.max(0, durationSec - fadeOut);
      audioFilters.push(`afade=t=in:ss=0:d=${fadeIn}`);
      audioFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOut}`);
    }

    return {
      inputPath,
      outputPath,
      startTime: Number(startSec.toFixed(3)),
      duration: Number(durationSec.toFixed(3)),
      sourceDuration:Number(sourceDuration.toFixed(3)),
      videoFilters,
      audioFilters,
      ...(normTargetI !== undefined ? { normalizeTargetI: normTargetI } : {}),
    };
  }
}
