import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

import { dataRepository, ownerContext } from '../db/repositories/dataRepository.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import {
  AppError,
  isValidUUID,
  ClipRecord,
  ProjectRecord,
  ProducerEditPlan,
  EditorProject,
  EditorTrack,
  EditorTrackItem,
  EditorCanvasConfig,
  EditorTransform,
  EditorKeyframe,
  EditorTransition,
  EditorEffect,
  EditorFilter,
  EditorColorAdjustments,
  EditorMask,
  EditorChromaKey,
  EditorSpeedConfig,
  EditorTextConfig,
  EditorAudioConfig,
  EditorCaptionItem,
  CreateEditorProjectDTO,
  UpdateEditorProjectDTO,
  SplitItemDTO,
  RippleDeleteDTO,
  DuplicateItemDTO,
  FreezeFrameDTO,
  EDITOR_RESOURCE_LIMITS,
  SAFE_EDITOR_FONTS,
  SafeEditorFont,
  EDITOR_TRANSITION_TYPES,
  EDITOR_EFFECT_TYPES,
  EDITOR_FILTER_PRESETS,
  ClipAspectRatio,
  CropConfig,
  ReframeKeyframe,
  ReframeLayoutMode,
  ReframeTrackRecord,
} from '../types/index.js';
import { downloadObjectToFile, uploadFile, signObjectGet } from './objectStorageService.js';
import { CaptionService } from './captionService.js';
import { isKnownCaptionStyle } from '../shared/captionPresets.js';
import { buildCropFilter, buildFitFilter, buildBlurFitChain } from './clipRenderService.js';
import { AudioEnhancementService } from './audioEnhancementService.js';
import {
  LoudnormMeasured,
  LoudnormNormalizationError,
  LoudnormTwoPassService,
  type LoudnormMeasurementGraph,
} from './loudnormTwoPassService.js';
import { AudioDuckingService } from './audioDuckingService.js';
import { SoundDesignService } from './soundDesignService.js';
import { SmartReframeService } from './smartReframeService.js';
import { partitionCaptionCues, shiftCaptionItemsForRippleDelete, cloneCaptionCuesForDuplicate } from '../utils/editorRippleCut.js';
import { validateEditorSourcePath, isAllowedEditorSourcePath, overlayAssetExtension } from '../utils/editorAssetValidator.js';
import { roundedCardPng } from '../utils/roundedCardPng.js';
import { getDrawtextFfmpeg } from '../utils/drawtextFfmpeg.js';
import { resolveXfadeName, getTransitionPreset, clampTransitionDuration } from '../shared/transitionPresets.js';
import { drawtextFontArg } from './editorFontFiles.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

export interface CompiledRenderGraph {
  inputArgs: string[];
  filterComplex: string[];
  videoMap: string;
  audioMap: string;
  outputArgs: string[];
  duration: number;
  /**
   * Present only when compiled with loudnorm='measure' AND the project requests
   * loudness normalization (audio.normalized or an enhancement preset with
   * normalize_enabled): an audio-only filter graph (same slice trims/speed/concat/
   * acrossfade/pre-loudnorm enhancement chains as the render graph) ending in a
   * terminal ebur128 meter. Running it decodes no video.
   */
  measurement: LoudnormMeasurementGraph | null;
  /**
   * How dialogue loudness normalization was applied, when requested:
   * 'linear' (two-pass measured) or 'dynamic-prerendered' (legacy one-pass
   * loudnorm on a bounded audio-only pre-render, used when linear mode is
   * infeasible for the measured peaks/range). Undefined when not requested.
   */
  normalizationMode?: 'linear' | 'dynamic-prerendered' | 'skipped-silent';
}

/** Mode for loudnorm emission: default one-pass (legacy), 'measure', measured
 * two-pass linear, dialogue pre-rendered into a normalized WAV file, or 'off'
 * (no loudnorm emitted - used when the dialogue is measured silent and
 * normalization would abort an otherwise valid render). */
export type LoudnormCompileMode =
  | 'off'
  | 'measure'
  | { measured: LoudnormMeasured }
  | { preNormalizedDialoguePath: string };

/**
 * Clip-level reframing context resolved once by ClipRenderService.resolveReframeDecision
 * and handed to compileRenderGraph so Pro renders frame slices exactly like the Quick
 * path would frame the same source (audit finding H-1).
 * Reframe keyframes are clip-relative; slices rebase them into slice-local time.
 */
export interface ProReframeContext {
  aspectRatio: ClipAspectRatio;
  cropConfig: CropConfig | null;
  /** Effective clip start in source-file seconds (start_seconds + trim_start_offset). */
  clipStartSec: number;
  mode: 'smart' | 'fallback_center' | 'manual';
  layoutMode: ReframeLayoutMode | string;
  track: (ReframeTrackRecord & { isStale?: boolean }) | null;
}

export class ProEditorService {
  /**
   * Retrieves an existing EditorProject or creates a new one initialized from the clip
   * and optional Producer plan.
   */
  public static async getOrCreateEditorProject(
    clipId: string,
    userId: string,
    dto: CreateEditorProjectDTO = { clip_id: clipId }
  ): Promise<EditorProject> {
    if (!ownerContext.getStore()) {
      return ownerContext.run(userId, () => this.getOrCreateEditorProject(clipId, userId, dto));
    }

    if (!isValidUUID(clipId)) {
      throw new AppError('Invalid clip ID.', 400, 'INVALID_UUID');
    }

    // 1. Check if an EditorProject already exists for this clip
    const { data: existingProject } = await dataRepository
      .from('editor_projects')
      .select('*')
      .eq('clip_id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingProject) {
      return await ProEditorService.withSourceDuration(existingProject as EditorProject, clipId, userId);
    }

    // 2. Fetch the clip record
    const { data: clip, error: clipErr } = await dataRepository
      .from('clips')
      .select('*')
      .eq('id', clipId)
      .eq('user_id', userId)
      .maybeSingle();

    if (clipErr || !clip) {
      throw new AppError('Clip not found or access denied.', 404, 'CLIP_NOT_FOUND');
    }

    // 3. Check for Producer plan to initialize from
    let producerPlan: ProducerEditPlan | null = null;
    if (dto.from_producer_plan_id && isValidUUID(dto.from_producer_plan_id)) {
      const { data: plan } = await dataRepository
        .from('producer_plans')
        .select('*')
        .eq('id', dto.from_producer_plan_id)
        .eq('user_id', userId)
        .maybeSingle();
      producerPlan = plan || null;
    } else {
      // Find latest applied plan if available
      const { data: latestPlan } = await dataRepository
        .from('producer_plans')
        .select('*')
        .eq('clip_id', clipId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .maybeSingle();
      if (latestPlan && latestPlan.status === 'applied') {
        producerPlan = latestPlan;
      }
    }

    // 4. Fetch transcript cues for caption track initialization
    const { data: transcript } = await dataRepository
      .from('transcripts')
      .select('*')
      .eq('project_id', clip.project_id)
      .maybeSingle();

    // 5. Build initial multi-track structure
    const editorProject = this.buildInitialProject(clip, userId, producerPlan, transcript, dto);

    // 6. Save to MongoDB
    const { error: insertErr } = await dataRepository
      .from('editor_projects')
      .insert(editorProject);

    if (insertErr) {
      logger.error('Failed to create editor project', { clipId, error: insertErr.message });
      throw new AppError(`Failed to create editor project: ${insertErr.message}`, 500, 'DATABASE_ERROR');
    }

    logger.info(`[ProEditor] Initialized EditorProject ${editorProject.id} for clip ${clipId}`);
    return await ProEditorService.withSourceDuration(editorProject as EditorProject, clipId, userId);
  }

  /**
   * Attaches the source media duration (from the owning project record) so the
   * studio can offer safe beyond-candidate extension: the clip's candidate window
   * is end_seconds, but the source footage (and transcript) may run longer.
   */
  private static async withSourceDuration(project: EditorProject, clipId: string, userId: string): Promise<EditorProject> {
    try {
      const { data: clip } = await dataRepository
        .from('clips')
        .select('project_id')
        .eq('id', clipId)
        .eq('user_id', userId)
        .maybeSingle();
      if (clip?.project_id) {
        const { data: proj } = await dataRepository
          .from('projects')
          .select('duration_seconds')
          .eq('id', clip.project_id)
          .maybeSingle();
        if (typeof proj?.duration_seconds === 'number' && proj.duration_seconds > 0) {
          (project as any).source_duration_seconds = proj.duration_seconds;
        }
      }
    } catch {
      // Non-fatal: extension falls back to the candidate boundary.
    }
    return project;
  }

  /**
   * Retrieves an EditorProject by ID verifying ownership.
   */
  public static async getEditorProject(projectId: string, userId: string): Promise<EditorProject> {
    if (!isValidUUID(projectId)) {
      throw new AppError('Invalid editor project ID.', 400, 'INVALID_UUID');
    }

    const { data: project, error } = await dataRepository
      .from('editor_projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !project) {
      throw new AppError('Editor project not found or access denied.', 404, 'PROJECT_NOT_FOUND');
    }

    if (project.clip_id) {
      return await ProEditorService.withSourceDuration(project as EditorProject, project.clip_id, userId);
    }
    return project as EditorProject;
  }

  /**
   * Updates an EditorProject with debounced changes, validating all resource limits.
   */
  public static async updateEditorProject(
    projectId: string,
    userId: string,
    dto: UpdateEditorProjectDTO
  ): Promise<EditorProject> {
    if (!isValidUUID(projectId)) {
      throw new AppError('Invalid editor project ID.', 400, 'INVALID_UUID');
    }

    const current = await this.getEditorProject(projectId, userId);

    // Validate resource limits
    if (dto.tracks) {
      if (dto.tracks.length > EDITOR_RESOURCE_LIMITS.MAX_TRACKS) {
        throw new AppError(`Track limit exceeded (max ${EDITOR_RESOURCE_LIMITS.MAX_TRACKS}).`, 400, 'LIMIT_EXCEEDED');
      }

      let totalItems = 0;
      let textItems = 0;

      for (const track of dto.tracks) {
        totalItems += track.items.length;
        for (const item of track.items) {
          if (item.type === 'TEXT') textItems++;
          if (item.effects && item.effects.length > EDITOR_RESOURCE_LIMITS.MAX_EFFECTS_PER_ITEM) {
            throw new AppError(`Effect limit exceeded per item (max ${EDITOR_RESOURCE_LIMITS.MAX_EFFECTS_PER_ITEM}).`, 400, 'LIMIT_EXCEEDED');
          }
          if (item.keyframes && item.keyframes.length > EDITOR_RESOURCE_LIMITS.MAX_KEYFRAMES_PER_ITEM) {
            throw new AppError(`Keyframe limit exceeded per item (max ${EDITOR_RESOURCE_LIMITS.MAX_KEYFRAMES_PER_ITEM}).`, 400, 'LIMIT_EXCEEDED');
          }
          // Caption preset safety: unknown styles fall back to the legacy default
          if (item.caption && !isKnownCaptionStyle(item.caption.style)) {
            item.caption.style = 'clean';
          }
          // Validate font safety
          if (item.text && item.text.font_family) {
            item.text.font_family = this.validateFont(item.text.font_family);
          }
          // Validate transition safety
          if (item.transition_in && !EDITOR_TRANSITION_TYPES.includes(item.transition_in.type)) {
            throw new AppError(`Invalid transition type: ${item.transition_in.type}`, 400, 'INVALID_TRANSITION');
          }
          if (item.transition_out && !EDITOR_TRANSITION_TYPES.includes(item.transition_out.type)) {
            throw new AppError(`Invalid transition type: ${item.transition_out.type}`, 400, 'INVALID_TRANSITION');
          }
          // Source paths become server-side fetches and FFmpeg inputs — validate strictly.
          if (item.source_path !== undefined && item.source_path !== null) {
            await validateEditorSourcePath(userId, item.source_path);
          }
        }
      }

      if (totalItems > EDITOR_RESOURCE_LIMITS.MAX_TIMELINE_ITEMS) {
        throw new AppError(`Timeline item limit exceeded (max ${EDITOR_RESOURCE_LIMITS.MAX_TIMELINE_ITEMS}).`, 400, 'LIMIT_EXCEEDED');
      }

      if (textItems > EDITOR_RESOURCE_LIMITS.MAX_TEXT_LAYERS) {
        throw new AppError(`Text layer limit exceeded (max ${EDITOR_RESOURCE_LIMITS.MAX_TEXT_LAYERS}).`, 400, 'LIMIT_EXCEEDED');
      }
    }

    const newVersion = dto.version !== undefined ? dto.version : current.version + 1;
    const now = new Date();

    const updates: Partial<EditorProject> = {
      version: newVersion,
      updated_at: now,
    };

    if (dto.title) updates.title = dto.title.trim().slice(0, 120);
    if (dto.canvas) updates.canvas = { ...current.canvas, ...dto.canvas };
    if (dto.tracks) updates.tracks = dto.tracks;
    if (dto.playhead !== undefined) updates.playhead = Math.max(0, dto.playhead);
    if (dto.settings) updates.settings = { ...current.settings, ...dto.settings };

    const { data: updated, error } = await dataRepository
      .from('editor_projects')
      .update(updates)
      .eq('id', projectId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !updated) {
      throw new AppError('Failed to update editor project.', 500, 'DATABASE_ERROR');
    }

    return updated as EditorProject;
  }

  /**
   * Splits an item on the timeline at the playhead position into two non-destructive items.
   */
  public static async splitItem(
    projectId: string,
    userId: string,
    dto: SplitItemDTO
  ): Promise<EditorProject> {
    const project = await this.getEditorProject(projectId, userId);
    const track = project.tracks.find((t) => t.id === dto.track_id);
    if (!track) throw new AppError('Track not found.', 404, 'TRACK_NOT_FOUND');
    if (track.locked) throw new AppError('Cannot split locked track.', 400, 'TRACK_LOCKED');

    const itemIndex = track.items.findIndex((i) => i.id === dto.item_id);
    if (itemIndex === -1) throw new AppError('Item not found.', 404, 'ITEM_NOT_FOUND');

    const item = track.items[itemIndex];
    const splitTime = dto.split_time;

    // Validate that split time is strictly inside item duration
    if (splitTime <= item.timeline_start + 0.1 || splitTime >= item.timeline_end - 0.1) {
      throw new AppError('Split time must be within item timeline range with at least 0.1s margin.', 400, 'INVALID_SPLIT_TIME');
    }

    const speed = item.speed.speed || 1.0;
    const offsetSeconds = splitTime - item.timeline_start;
    const sourceSplitPoint = item.source_start + offsetSeconds * speed;

    // Partition caption cues if this is a CAPTION track or item contains caption cues
    let firstCaption = item.caption ? JSON.parse(JSON.stringify(item.caption)) : undefined;
    let secondCaption = item.caption ? JSON.parse(JSON.stringify(item.caption)) : undefined;

    if (track.type === 'CAPTION' || (item.caption && Array.isArray((item.caption as any).cues))) {
      const itemCues = Array.isArray((item.caption as any)?.cues) ? (item.caption as any).cues : [];
      const { leftCues, rightCues } = partitionCaptionCues(itemCues, splitTime, item.timeline_start);
      if (firstCaption) firstCaption.cues = leftCues;
      if (secondCaption) secondCaption.cues = rightCues;
    }

    // Create item 1 (left side)
    const item1: EditorTrackItem = {
      ...JSON.parse(JSON.stringify(item)),
      timeline_end: splitTime,
      source_end: Number(sourceSplitPoint.toFixed(3)),
      transition_out: undefined,
      keyframes: item.keyframes.filter((k) => k.time < offsetSeconds),
      caption: firstCaption,
    };

    // Create item 2 (right side) with new ID
    const item2Keyframes: EditorKeyframe[] = item.keyframes
      .filter((k) => k.time >= offsetSeconds)
      .map((k) => ({
        ...k,
        id: crypto.randomUUID(),
        time: Number((k.time - offsetSeconds).toFixed(3)),
      }));

    const item2: EditorTrackItem = {
      ...JSON.parse(JSON.stringify(item)),
      id: crypto.randomUUID(),
      timeline_start: splitTime,
      source_start: Number(sourceSplitPoint.toFixed(3)),
      transition_in: undefined,
      keyframes: item2Keyframes,
      caption: secondCaption,
    };

    // Replace item with item1 and item2
    track.items.splice(itemIndex, 1, item1, item2);

    return this.updateEditorProject(projectId, userId, {
      tracks: project.tracks,
    });
  }

  /**
   * Ripple deletes an item, closing the gap by shifting all subsequent items
   * on unlocked tracks to the left.
   */
  public static async rippleDelete(
    projectId: string,
    userId: string,
    dto: RippleDeleteDTO
  ): Promise<EditorProject> {
    const project = await this.getEditorProject(projectId, userId);
    const track = project.tracks.find((t) => t.id === dto.track_id);
    if (!track) throw new AppError('Track not found.', 404, 'TRACK_NOT_FOUND');
    if (track.locked) throw new AppError('Cannot delete from locked track.', 400, 'TRACK_LOCKED');

    const itemIndex = track.items.findIndex((i) => i.id === dto.item_id);
    if (itemIndex === -1) throw new AppError('Item not found.', 404, 'ITEM_NOT_FOUND');

    const item = track.items[itemIndex];
    const duration = item.timeline_end - item.timeline_start;
    const deletePoint = item.timeline_start;

    // Remove the item
    track.items.splice(itemIndex, 1);

    // Ripple shift: shift all subsequent items on ALL unlocked tracks
    for (const tr of project.tracks) {
      if (tr.locked) continue;
      if (tr.type === 'CAPTION') {
        // Bounds + cue slicing/shift handled by the shared pure helper so items
        // before the cut stay untouched and items after it slide with the timeline.
        tr.items = shiftCaptionItemsForRippleDelete(tr.items, deletePoint, duration);
      } else {
        for (const itm of tr.items) {
          if (itm.timeline_start >= deletePoint) {
            itm.timeline_start = Math.max(0, Number((itm.timeline_start - duration).toFixed(3)));
            itm.timeline_end = Math.max(0, Number((itm.timeline_end - duration).toFixed(3)));
          }
        }
      }
    }

    // Recalculate canvas duration
    const maxEnd = Math.max(
      ...project.tracks.flatMap((t) => t.items.map((i) => i.timeline_end)),
      1.0
    );
    project.canvas.duration = Number(maxEnd.toFixed(3));

    return this.updateEditorProject(projectId, userId, {
      tracks: project.tracks,
      canvas: project.canvas,
    });
  }

  /**
   * Duplicates an item placing it immediately after on the same track.
   */
  /**
   * Filler-word removal (quality roadmap E-3, Descript parity).
   * Preview mode returns the proposal (count, seconds, ranges) without touching
   * the project; confirmed mode removes the ranges through applyBatchRippleCuts,
   * cutting video, audio, and caption cues together. Never silent: the response
   * always reports exactly what was removed.
   */
  public static async removeFillers(
    projectId: string,
    userId: string,
    options: { confirmed?: boolean; includeTier2?: boolean } = {}
  ): Promise<{
    preview: boolean;
    summary: {
      totalRanges: number;
      tier1Ranges: number;
      tier2Ranges: number;
      totalDurationSec: number;
      ranges: Array<{ start: number; end: number; tier: number; words: string[]; reason: string }>;
    };
    project?: EditorProject;
  }> {
    const { detectFillerRanges, summarizeFillerRanges } = await import('../utils/fillerDetection.js');
    const { applyBatchRippleCuts } = await import('../utils/editorRippleCut.js');

    const project = await this.getEditorProject(projectId, userId);

    // Word timings come from the caption track (timeline-absolute, same clock as ripple cuts).
    const captionTrack = project.tracks.find((t) => t.type === 'CAPTION' && !t.hidden);
    const words = (captionTrack?.items ?? []).flatMap((item) =>
      (Array.isArray(item.caption?.cues) ? item.caption!.cues : []).flatMap((cue: any) =>
        (Array.isArray(cue.words) ? cue.words : []).map((w: any) => ({
          text: String(w.text ?? w.word ?? ''),
          start: Number(w.start),
          end: Number(w.end),
        }))
      )
    );

    if (words.length === 0) {
      const err = new AppError('No word-level timings available for filler removal; re-analyze captions first.', 400, 'NO_WORD_TIMINGS');
      throw err;
    }

    const ranges = detectFillerRanges(words, { includeTier2: options.includeTier2 !== false });
    const summary = summarizeFillerRanges(ranges);

    if (!options.confirmed) {
      return { preview: true, summary };
    }

    if (ranges.length === 0) {
      return { preview: false, summary, project };
    }

    const next = applyBatchRippleCuts(
      project as any,
      ranges.map((r) => ({ startSec: r.start, endSec: r.end }))
    ) as EditorProject;

    const updated = await this.updateEditorProject(projectId, userId, {
      tracks: next.tracks,
      canvas: next.canvas,
    });

    logger.info(
      `[ProEditor] Removed ${summary.totalRanges} filler range(s), ${summary.totalDurationSec}s from project ${projectId}`
    );
    return { preview: false, summary, project: updated };
  }

  public static async duplicateItem(
    projectId: string,
    userId: string,
    dto: DuplicateItemDTO
  ): Promise<EditorProject> {
    const project = await this.getEditorProject(projectId, userId);
    const track = project.tracks.find((t) => t.id === dto.track_id);
    if (!track) throw new AppError('Track not found.', 404, 'TRACK_NOT_FOUND');
    if (track.locked) throw new AppError('Track is locked.', 400, 'TRACK_LOCKED');

    const item = track.items.find((i) => i.id === dto.item_id);
    if (!item) throw new AppError('Item not found.', 404, 'ITEM_NOT_FOUND');

    const duration = item.timeline_end - item.timeline_start;
    const newItemStart = item.timeline_end;
    const newItemEnd = newItemStart + duration;

    // Caption cues are timeline-absolute in service-maintained projects: a duplicated
    // item must rebase its cues to the new placement and get fresh cue IDs, or the
    // export aggregation drops them as seen-duplicates and they render at the old position.
    let duplicatedCaption = item.caption ? JSON.parse(JSON.stringify(item.caption)) : undefined;
    if (
      duplicatedCaption &&
      Array.isArray(duplicatedCaption.cues) &&
      duplicatedCaption.cues.length > 0
    ) {
      const sourceStart = item.timeline_start;
      const firstStart = duplicatedCaption.cues[0].start;
      const isSegmentRelative = sourceStart > 0 && firstStart < sourceStart - 0.05 && firstStart >= 0;
      if (!isSegmentRelative) {
        duplicatedCaption = {
          ...duplicatedCaption,
          cues: cloneCaptionCuesForDuplicate(duplicatedCaption.cues, newItemStart - sourceStart),
        };
      }
    }

    const duplicatedItem: EditorTrackItem = {
      ...JSON.parse(JSON.stringify(item)),
      id: crypto.randomUUID(),
      timeline_start: Number(newItemStart.toFixed(3)),
      timeline_end: Number(newItemEnd.toFixed(3)),
      keyframes: item.keyframes.map((k) => ({
        ...k,
        id: crypto.randomUUID(),
      })),
      caption: duplicatedCaption,
    };

    track.items.push(duplicatedItem);
    // Sort items by timeline_start
    track.items.sort((a, b) => a.timeline_start - b.timeline_start);

    return this.updateEditorProject(projectId, userId, {
      tracks: project.tracks,
    });
  }

  /**
   * Extracts a freeze frame at the specified playhead time and inserts it as a still segment.
   */
  public static async freezeFrame(
    projectId: string,
    userId: string,
    dto: FreezeFrameDTO
  ): Promise<EditorProject> {
    const project = await this.getEditorProject(projectId, userId);
    const track = project.tracks.find((t) => t.id === dto.track_id);
    if (!track) throw new AppError('Track not found.', 404, 'TRACK_NOT_FOUND');
    if (track.locked) throw new AppError('Track is locked.', 400, 'TRACK_LOCKED');

    const item = track.items.find((i) => i.id === dto.item_id);
    if (!item) throw new AppError('Item not found.', 404, 'ITEM_NOT_FOUND');

    const freezeDuration = Math.min(10.0, Math.max(0.5, dto.duration || 2.0));
    const freezeTime = dto.freeze_time;

    // Split item at freeze point if inside
    if (freezeTime > item.timeline_start && freezeTime < item.timeline_end) {
      await this.splitItem(projectId, userId, {
        track_id: dto.track_id,
        item_id: dto.item_id,
        split_time: freezeTime,
      });
    }

    // Refresh project state after split
    const updatedProject = await this.getEditorProject(projectId, userId);
    const targetTrack = updatedProject.tracks.find((t) => t.id === dto.track_id)!;

    // Shift subsequent items on unlocked tracks to create room for freeze duration
    for (const tr of updatedProject.tracks) {
      if (tr.locked) continue;
      for (const itm of tr.items) {
        if (itm.timeline_start >= freezeTime) {
          itm.timeline_start = Number((itm.timeline_start + freezeDuration).toFixed(3));
          itm.timeline_end = Number((itm.timeline_end + freezeDuration).toFixed(3));
        }
      }
    }

    // Insert image/freeze track item
    const freezeItem: EditorTrackItem = {
      id: crypto.randomUUID(),
      track_id: dto.track_id,
      type: 'IMAGE',
      source_asset_id: item.source_asset_id,
      source_path: item.source_path,
      timeline_start: Number(freezeTime.toFixed(3)),
      timeline_end: Number((freezeTime + freezeDuration).toFixed(3)),
      source_start: 0,
      source_end: freezeDuration,
      transform: { ...item.transform },
      speed: { speed: 1.0, pitch_preserved: true },
      effects: [],
      keyframes: [],
      locked: false,
      muted: true,
      hidden: false,
      z_index: item.z_index,
    };

    targetTrack.items.push(freezeItem);
    targetTrack.items.sort((a, b) => a.timeline_start - b.timeline_start);

    return this.updateEditorProject(projectId, userId, {
      tracks: updatedProject.tracks,
    });
  }

  /**
   * Captures a single frame snapshot as a PNG image from the source video.
   */
  public static async captureSnapshot(
    sourceVideoPath: string,
    timestamp: number,
    outputPath: string
  ): Promise<string> {
    if (!fs.existsSync(sourceVideoPath)) {
      throw new AppError('Source video not found.', 404, 'SOURCE_NOT_FOUND');
    }

    const safeTimestamp = Math.max(0, timestamp);
    const args = [
      '-y',
      '-ss', safeTimestamp.toFixed(3),
      '-i', sourceVideoPath,
      '-vframes', '1',
      '-q:v', '2',
      outputPath,
    ];

    await execFileAsync(ffmpegBin, args, { timeout: 15000 });

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new AppError('Failed to capture frame snapshot.', 500, 'FFMPEG_FAILED');
    }

    return outputPath;
  }

  /**
   * Pre-downloads any remote overlay/sticker URLs (e.g. from GIPHY) to tmpDir before compiling FFmpeg arguments.
   */
  public static async preloadRemoteOverlayAssets(
    project: EditorProject,
    tmpDir: string
  ): Promise<EditorProject> {
    for (const track of project.tracks) {
      for (const item of track.items) {
        const rawPath = item.source_path;
        if (!rawPath) continue;

        // Defense in depth: items persisted before source-path validation existed
        // must not be fetched server-side. Disallowed sources are skipped.
        if (!isAllowedEditorSourcePath(project.user_id, rawPath)) {
          logger.warn(`[ProEditor] Skipping disallowed overlay asset for item ${item.id} during preload`);
          continue;
        }

        if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
          try {
            const ext = overlayAssetExtension(rawPath);
            const localCachePath = path.join(tmpDir, `overlay_${item.id}${ext}`);
            if (!fs.existsSync(localCachePath)) {
              // Redirects are not followed: an allowlisted host must not be able
              // to bounce the server-side fetch onto an internal address.
              const res = await fetch(rawPath, { headers: { 'User-Agent': 'VireoClip/1.0' }, redirect: 'manual' });
              if (res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                fs.writeFileSync(localCachePath, buf);
                item.source_path = localCachePath;
              }
            } else {
              item.source_path = localCachePath;
            }
          } catch (e) {
            logger.warn(`Failed to preload remote overlay asset: ${e}`);
          }
        }
      }
    }
    return project;
  }

  /**
   * Crop filter for one video item slice, mirroring the Quick Clip decision order:
   * per-item manual crop → clip-level smart reframe (dynamic, rebased to the slice
   * window) → blurred layout when no subject → center crop. Title cards need no crop.
   */
  private static buildSliceCropFilter(
    item: EditorTrackItem,
    reframe: ProReframeContext | undefined,
    sliceWindowStartClipRel: number,
    sliceDuration: number
  ): string | null {
    const ratio = (reframe?.aspectRatio || '9:16') as ClipAspectRatio;

    if (item.is_title_card) return null;

    // Per-item manual crop override wins over clip-level reframing.
    if (item.crop && (item.crop.mode === 'custom' || item.crop.mode === 'fit' || item.crop.mode === 'fill' || item.crop.mode === 'blur')) {
      // 'fit' letterboxes the whole frame (scale-decrease + pad); 'fill'/'custom'
      // crop to fill the canvas at the (clamped) focus point. Clamping keeps a bad
      // persisted value from pushing the crop window outside the frame (black edges).
      const clampFocus = (v: number | undefined): number =>
        Math.min(1, Math.max(0, typeof v === 'number' && Number.isFinite(v) ? v : 0.5));
      const zoom = Math.min(4, Math.max(1, Number(item.crop.scale ?? 1)));
      if (item.crop.mode === 'fit') return buildFitFilter(ratio, zoom, clampFocus(item.crop.focusX), clampFocus(item.crop.focusY));
      if (item.crop.mode === 'blur') {
        // Chain-safe fragment: consumes the trimmed slice stream via split and
        // ends unlabeled, so the caller's comma chain keeps working.
        const tag = ('vc' + String(item.id || 'x')).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16) || 'vcb';
        return buildBlurFitChain(ratio, zoom, tag);
      }
      return buildCropFilter(ratio, { focusX: clampFocus(item.crop.focusX), focusY: clampFocus(item.crop.focusY), scale: zoom });
    }

    const track = reframe?.track;
    const hasUsableTrack = Boolean(
      reframe &&
      reframe.mode === 'smart' &&
      track &&
      Array.isArray(track.smoothed_keyframes) &&
      track.smoothed_keyframes.length > 0 &&
      !track.isStale
    );

    if (hasUsableTrack && track) {
      // Labeled layout graphs (split/blur/screencast) are embedded inside the
      // per-slice comma chain here, so they must be chain-safe fragments with
      // graph-unique labels - raw [0:v]...[out] forms abort ffmpeg with
      // "Too many inputs specified for the split filter" (editor split exports
      // failed permanently until this).
      const layoutTag = 'vc' + crypto.createHash('sha256').update(String(item.id || 'x')).digest('hex').slice(0, 16);
      if (reframe!.layoutMode === 'blur') {
        return SmartReframeService.buildBlurBackgroundFilter({ canvasWidth: 1080, canvasHeight: 1920, tag: layoutTag });
      }

      if (reframe!.layoutMode === 'split' || reframe!.layoutMode === 'screencast') {
        const splitGeometry =
          reframe!.layoutMode === 'split'
            ? SmartReframeService.computeSplitSpeakerGeometry({
                rawSamples: (track as any).raw_samples,
                sourceWidth: track.source_width || 1920,
                sourceHeight: track.source_height || 1080,
                speaker1X: reframe!.cropConfig?.split?.speaker1X,
                speaker2X: reframe!.cropConfig?.split?.speaker2X,
              })
            : null;
        return SmartReframeService.buildLayoutCropFilter({
          layoutMode: reframe!.layoutMode as any,
          aspectRatio: ratio,
          keyframes: track.smoothed_keyframes,
          sourceWidth: track.source_width || 1920,
          sourceHeight: track.source_height || 1080,
          duration: sliceDuration,
          speaker1X: reframe!.cropConfig?.split?.speaker1X,
          speaker2X: reframe!.cropConfig?.split?.speaker2X,
          splitGeometry,
          tag: layoutTag,
          screencastMode: reframe!.cropConfig?.screencast?.mode,
          screencastInsetPosition: reframe!.cropConfig?.screencast?.insetPosition,
          screencastInsetDiameter: reframe!.cropConfig?.screencast?.insetDiameter,
          screencastScreenRatio: reframe!.cropConfig?.screencast?.screenRatio,
          screencastBackground: reframe!.cropConfig?.screencast?.background,
          screencastFacecamBox: SmartReframeService.resolveFacecamBox(reframe!.cropConfig?.screencast, track.metadata),
        });
      }

      // Multi-person single-view: keep the whole group visible (blur-fill
      // fit) instead of tight tracking that crops people at the edges.
      const groupFrame = SmartReframeService.computeGroupFrameGeometry({
        rawSamples: (track as any).raw_samples,
        sourceWidth: track.source_width || 1920,
        sourceHeight: track.source_height || 1080,
      });
      if (groupFrame && ratio === '9:16') {
        return SmartReframeService.buildGroupFitFilter({
          keyframes: groupFrame.keyframes,
          windowW: groupFrame.windowW,
          sourceWidth: track.source_width || 1920,
          sourceHeight: track.source_height || 1080,
          canvasWidth: 1080,
          canvasHeight: 1920,
          tag: layoutTag,
        });
      }

      // Same tracking-quality floor as the clip render path: a weak dominant
      // track degrades to the blurred layout instead of a bad tight crop.
      if (!groupFrame && SmartReframeService.isLowConfidenceTrack(track)) {
        logger.warn(
          `[ProEditor] Dominant track score ${Number((track as any).metadata?.dominant_score).toFixed(3)} below tracking floor ${SmartReframeService.TRACK_CONFIDENCE_FLOOR} for editor slice. Degrading to blurred layout.`
        );
        if (ratio === '9:16') {
          return SmartReframeService.buildBlurBackgroundFilter({ canvasWidth: 1080, canvasHeight: 1920, tag: layoutTag });
        }
        return buildCropFilter(ratio, { focusX: 0.5, focusY: 0.5 });
      }

      // 'track' layout: rebase clip-relative keyframes into slice-local time and
      // extend boundary keyframes so the expression covers the full slice window.
      // Boundary extensions are skipped when an in-window keyframe already sits at
      // the edge — duplicate times would zero-divide the slope pruning downstream.
      const kfs = track.smoothed_keyframes;
      const windowEnd = sliceWindowStartClipRel + sliceDuration;
      const EPS = 1e-6;
      const rebased: ReframeKeyframe[] = [];
      const hasKfAtStart = kfs.some((k) => Math.abs(k.time - sliceWindowStartClipRel) <= EPS);
      const hasKfAtEnd = kfs.some((k) => Math.abs(k.time - windowEnd) <= EPS);
      const before = [...kfs].reverse().find((k) => k.time < sliceWindowStartClipRel - EPS);
      const after = kfs.find((k) => k.time > windowEnd + EPS);
      if (before && !hasKfAtStart) rebased.push({ time: 0, centerX: before.centerX, centerY: before.centerY });
      for (const k of kfs) {
        if (k.time >= sliceWindowStartClipRel - EPS && k.time <= windowEnd + EPS) {
          rebased.push({
            time: Number(Math.max(0, k.time - sliceWindowStartClipRel).toFixed(3)),
            centerX: k.centerX,
            centerY: k.centerY,
          });
        }
      }
      if (after && !hasKfAtEnd) rebased.push({ time: Number(sliceDuration.toFixed(3)), centerX: after.centerX, centerY: after.centerY });

      if (rebased.length === 0) {
        return buildCropFilter(ratio, { focusX: 0.5, focusY: 0.5 });
      }
      if (rebased.length === 1) {
        return buildCropFilter(ratio, { focusX: rebased[0].centerX, focusY: rebased[0].centerY });
      }
      return SmartReframeService.buildLayoutCropFilter({
        layoutMode: 'track',
        aspectRatio: ratio,
        keyframes: rebased,
        sourceWidth: track.source_width || 1920,
        sourceHeight: track.source_height || 1080,
        duration: sliceDuration,
      });
    }

    return buildCropFilter(ratio, { focusX: 0.5, focusY: 0.5 });
  }

  /**
   * Per-item look chain (color adjustments, filter preset, effects, punch-in zoom).
   * Applied inside each slice so every timeline item keeps its own styling instead
   * of the whole render inheriting the first item's look (audit finding M-2).
   * Keyframe times are item-relative, which equals slice-local time after setpts.
   */
  private static buildItemStyleFilters(item: EditorTrackItem, canvasW: number, canvasH: number, fps = 30): string[] {
    const videoFilters: string[] = [];

    if (item.color) {
      const c = item.color;
      // Preview composes brightness and exposure as two CSS brightness()
      // filters, which MULTIPLY each RGB channel. ffmpeg's eq brightness is
      // additive on luma and diverges visibly (measured mean pixel delta ~58
      // at +0.3), so brightness+exposure fold into a lutrgb channel multiply
      // that matches CSS semantics; contrast and saturation stay on eq, where
      // the measured preview/export delta is small (mean ~3 / ~1).
      const bMult = Math.min(4, Math.max(0, (1 + (c.brightness || 0)) * (1 + (c.exposure || 0) * 0.8)));
      if (Math.abs(bMult - 1) > 1e-3) {
        const k = bMult.toFixed(4);
        videoFilters.push(`lutrgb=r='val*${k}':g='val*${k}':b='val*${k}'`);
      }
      const cont = (1.0 + (c.contrast || 0)).toFixed(2);
      const sat = (1.0 + (c.saturation || 0)).toFixed(2);
      videoFilters.push(`eq=contrast=${cont}:saturation=${sat}`);
    }

    if (item.filter && item.filter.preset && item.filter.preset !== 'none') {
      switch (item.filter.preset) {
        case 'warm':
          videoFilters.push('colorbalance=rs=0.1:gs=0.05:bs=-0.1');
          break;
        case 'cool':
          videoFilters.push('colorbalance=rs=-0.1:gs=0.0:bs=0.15');
          break;
        case 'mono':
          // Preview: grayscale(1) contrast(1.2) - include the contrast leg.
          videoFilters.push('hue=s=0');
          videoFilters.push('eq=contrast=1.2');
          break;
        case 'punch':
          // Aligned to the preview's contrast(1.3) saturate(1.4).
          videoFilters.push('eq=contrast=1.3:saturation=1.4');
          break;
        case 'film':
          videoFilters.push('curves=preset=vintage');
          break;
        case 'soft':
          videoFilters.push('eq=contrast=0.90:brightness=0.05');
          break;
        case 'clean':
          videoFilters.push('eq=contrast=1.05:saturation=1.08');
          break;
        case 'creator':
          videoFilters.push('eq=contrast=1.15:saturation=1.30');
          videoFilters.push('colorbalance=rs=0.04:gs=0.02:bs=-0.04');
          break;
      }
    }

    for (const eff of item.effects || []) {
      if (eff.type === 'vignette') {
        videoFilters.push('vignette=PI/4');
      } else if (eff.type === 'blur') {
        const r = Math.max(1, Math.round((eff.intensity || 0.5) * 10));
        videoFilters.push(`boxblur=${r}:1`);
      } else if (eff.type === 'sharpen') {
        videoFilters.push('unsharp=5:5:1.0:5:5:0.0');
      }
    }

    const scaleKeyframes = (item.keyframes || []).filter((k) => k.property === 'scale');
    if (scaleKeyframes.length > 0) {
      const kf = scaleKeyframes[0];
      const kfStart = Math.max(0, kf.time);
      const kfDur = 2.5;
      const scaleVal = Math.max(1.02, Math.min(2, kf.value || 1.06));
      const kfEnd = kfStart + kfDur;
      // Punch-in zoom with eased ramp-hold-ramp, matching the producer
      // preview's zoompan curve (0.25s in / 0.35s out). Two earlier forms
      // failed pixel verification: a time-conditional crop size is a silent
      // no-op (crop w/h are init-time), and zoompan does not zoom once the
      // chain contains split/overlay + input seeking. A trim/concat segment
      // zoom aborts the whole render when the punch window extends past the
      // available input. This form chains statically crop+scaled overlay
      // stages, each toggled by overlay's timeline 'enable' over a disjoint
      // sub-window: all size negotiation stays static, no branch can go
      // empty, and a window beyond EOF is simply never shown. Because crop
      // size is init-time, the ease is a 4-step staircase per ramp (a step
      // every ~63-88ms, in motion reads as an ease); the hold is exact.
      const rampIn = Math.min(0.25, kfDur / 2);
      const rampOut = Math.min(0.35, kfDur / 2);
      const STEPS = 4;
      const uid = (String(item.id || 'item').replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'item');
      type Stage = { zoom: number; t0: number; t1: number };
      const stages: Stage[] = [];
      for (let i = 1; i <= STEPS; i++) {
        stages.push({
          zoom: 1 + ((scaleVal - 1) * i) / STEPS,
          t0: kfStart + (rampIn * (i - 1)) / STEPS,
          t1: kfStart + (rampIn * i) / STEPS,
        });
      }
      stages.push({ zoom: scaleVal, t0: kfStart + rampIn, t1: kfEnd - rampOut });
      for (let j = 1; j <= STEPS; j++) {
        stages.push({
          zoom: 1 + ((scaleVal - 1) * (STEPS - j)) / STEPS,
          t0: kfEnd - rampOut + (rampOut * (j - 1)) / STEPS,
          t1: kfEnd - rampOut + (rampOut * j) / STEPS,
        });
      }
      const parts: string[] = [];
      stages.forEach((st, idx) => {
        const wPunch = Math.round(canvasW / st.zoom);
        const hPunch = Math.round(canvasH / st.zoom);
        const a = `pzA${uid}s${idx}`;
        const b = `pzB${uid}s${idx}`;
        const z = `pzZ${uid}s${idx}`;
        const out = `pzO${uid}s${idx}`;
        // First stage consumes the implicit stream (like the single-stage
        // form did); the last stage leaves its overlay output unlabeled so
        // the comma-joined chain continues from it.
        const inRef = idx === 0 ? '' : `[pzO${uid}s${idx - 1}]`;
        const outRef = idx === stages.length - 1 ? '' : `[${out}]`;
        parts.push(
          `${inRef}split=2[${a}][${b}];[${b}]crop=${wPunch}:${hPunch}:(iw-ow)/2:(ih-oh)/2,scale=${canvasW}:${canvasH}[${z}];[${a}][${z}]overlay=0:0:enable='between(t,${st.t0.toFixed(3)},${st.t1.toFixed(3)})'${outRef}`
        );
      });
      videoFilters.push(parts.join(';'));
    }

    return videoFilters;
  }

  /**
   * Audio tempo chain for a playback speed: atempo is limited to [0.5, 2.0], so
   * out-of-range speeds chain multiple atempo stages (e.g. 4x = 2.0 × 2.0).
   */
  private static audioAtempoChain(speed: number): string {
    if (!Number.isFinite(speed) || speed === 1) return '';
    const factors: number[] = [];
    let s = Math.min(4, Math.max(0.25, speed));
    while (s > 2) { factors.push(2); s /= 2; }
    while (s < 0.5) { factors.push(0.5); s /= 0.5; }
    factors.push(Number(s.toFixed(4)));
    return factors.map((f) => `atempo=${f}`).join(',');
  }

  /**
   * Compiles the entire multi-track EditorProject into a valid FFmpeg RenderGraph V2.
   * Enforces argument array execution with ZERO raw shell string interpolation.
   */
  public static compileRenderGraph(
    project: EditorProject,
    sourceVideoPath: string,
    outputPath = '/tmp/render.mp4',
    tmpDir = os.tmpdir(),
    reframe?: ProReframeContext,
    loudnorm?: LoudnormCompileMode
  ): CompiledRenderGraph {
    const inputArgs: string[] = [];
    const filterComplex: string[] = [];
    const outputArgs: string[] = [];
    // Audio-only mirror of the dialogue path (slice a-chains + concat/acrossfade),
    // collected for the two-pass loudnorm measurement graph. Every string appended
    // here is the exact string also appended to filterComplex for that audio chain.
    const audioOnlyChains: string[] = [];

    // Canvas properties
    const canvasW = project.canvas.width || 1080;
    const canvasH = project.canvas.height || 1920;
    const fps = project.canvas.fps || 30;

    // 1. Primary input: source video
    inputArgs.push('-i', sourceVideoPath);
    let currentInputIdx = 0;

    // Locate video items
    const videoTracks = project.tracks.filter((t) => t.type === 'VIDEO' && !t.hidden);
    // Only the primary (first) video track forms the base timeline. Secondary VIDEO
    // tracks are B-roll/overlay layers (brollPlanService.insertBrollSuggestions
    // creates them as type 'VIDEO' named 'B-Roll Layer') and are composited by the
    // overlay pass below. Splicing their items into the base concat pulled their
    // window from input 0 (the primary source) instead of their own source_path
    // and shifted/corrupted the base timeline (found during the two-pass loudnorm
    // work, Nov 2026).
    const allVideoItems: EditorTrackItem[] = [];
    if (videoTracks[0]) {
      allVideoItems.push(...videoTracks[0].items.filter((i) => !i.hidden));
    }
    allVideoItems.sort((a, b) => a.timeline_start - b.timeline_start);

    // Build base video stream
    let videoStreamLabel = '[0:v]';
    let audioStreamLabel = '[0:a]';

    // Base video scaling & crop filter — resolved per slice below (parity with Quick path).
    const canvasDuration = Number((project.canvas.duration || 0).toFixed(3));

    if (allVideoItems.length > 1) {
      // Multiple timeline segments: slice real video, or synthesize title cards,
      // then concat (no transitions) or an xfade/acrossfade chain (transitions).
      // Each slice honors its playback speed; deliberate timeline gaps are padded
      // so the export preserves the canvas layout the preview shows.
      const vLabels: string[] = [];
      const aLabels: string[] = [];
      const sliceDurations: number[] = [];
      const UNIFORM_AUDIO = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo';
      let prevTimelineEnd: number | null = null;

      for (let i = 0; i < allVideoItems.length; i++) {
        const item = allVideoItems[i];
        const vSlice = `[v_slice_${i}]`;
        const aSlice = `[a_slice_${i}]`;
        const timelineDur = Math.max(0.1, item.timeline_end - item.timeline_start);
        const speed = Math.min(4, Math.max(0.25, item.speed?.speed || 1.0));
        const speedVideo = speed !== 1 ? `,setpts=PTS/${speed}` : '';
        const speedAudio = ProEditorService.audioAtempoChain(speed);
        const gap =
          prevTimelineEnd !== null ? Math.max(0, item.timeline_start - prevTimelineEnd) : 0;
        const gapPad = gap > 0.05;
        prevTimelineEnd = item.timeline_end;

        if ((item as any).is_title_card) {
          // Title card: a solid-colour frame with centred text + matching silent audio.
          const bgHex = ProEditorService.sanitizeHexColor((item as any).background_color, '0B0D12');
          const cardText = ProEditorService.escapeDrawtext((item as any).title_card_text || item.name || '');
          const fontSize = Math.max(32, Math.round(canvasH * 0.06));

          inputArgs.push('-f', 'lavfi', '-i', `color=c=0x${bgHex}:s=${canvasW}x${canvasH}:r=${fps}:d=${(timelineDur * speed).toFixed(2)}`);
          currentInputIdx++;
          const colorIdx = currentInputIdx;
          inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
          currentInputIdx++;
          const silenceIdx = currentInputIdx;

          const drawtext = cardText
            ? `,drawtext=text='${cardText}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2`
            : '';
          const padV = gapPad ? `,tpad=stop_duration=${gap.toFixed(3)}:color=black` : '';
          const padA = gapPad ? `,apad=pad_dur=${gap.toFixed(3)}` : '';
          filterComplex.push(`[${colorIdx}:v]setpts=PTS-STARTPTS${speedVideo},fps=${fps}${drawtext},setsar=1,format=yuv420p${padV}${vSlice}`);
          const titleAChain = `[${silenceIdx}:a]atrim=0:${(timelineDur * speed).toFixed(2)},asetpts=PTS-STARTPTS${speedAudio ? ',' + speedAudio : ''},${UNIFORM_AUDIO}${padA}${aSlice}`;
          filterComplex.push(titleAChain);
          audioOnlyChains.push(titleAChain);
          sliceDurations.push(timelineDur + gap);
        } else if ((item as any).is_freeze) {
          // Freeze frame: hold the exact source frame for the whole span by
          // trimming a tiny window and cloning its last frame. Silent audio
          // (the item is muted); a leading timeline gap extends the hold.
          const T = Number((item as any).freeze_source_time ?? item.source_start ?? 0);
          const lead = Math.min(0.1, timelineDur);
          inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
          currentInputIdx++;
          const silenceIdx = currentInputIdx;
          const windowStartClipRelFreeze = T - (reframe?.clipStartSec ?? 0);
          const freezeCrop = ProEditorService.buildSliceCropFilter(item, reframe, windowStartClipRelFreeze, timelineDur);
          const freezeStyle = ProEditorService.buildItemStyleFilters(item, canvasW, canvasH, fps);
          const chain = [`trim=start=${T.toFixed(3)}:end=${(T + lead).toFixed(3)}`, 'setpts=PTS-STARTPTS'];
          if (freezeCrop) chain.push(freezeCrop);
          chain.push(...freezeStyle);
          chain.push(
            `tpad=stop_mode=clone:stop_duration=${(timelineDur - lead + gap).toFixed(3)}`,
            `fps=${fps}`,
            'setsar=1',
            'format=yuv420p'
          );
          filterComplex.push(`[0:v]${chain.join(',')}${vSlice}`);
          const freezeAChain = `[${silenceIdx}:a]atrim=0:${(timelineDur + gap).toFixed(3)},asetpts=PTS-STARTPTS,${UNIFORM_AUDIO}${aSlice}`;
          filterComplex.push(freezeAChain);
          audioOnlyChains.push(freezeAChain);
          sliceDurations.push(timelineDur + gap);
        } else {
          const startStr = (item.source_start || 0).toFixed(2);
          const srcEnd = item.source_end !== undefined ? item.source_end : (item.source_start || 0) + timelineDur * speed;
          const endStr = srcEnd.toFixed(2);
          const sourceWindowSec = Math.max(0.1, srcEnd - (item.source_start || 0));
          const sliceDur = sourceWindowSec / speed;
          // Keyframes are clip-relative; slices trim straight from the source file, so
          // the slice-local window starts at source_start - clipStart.
          const windowStartClipRel = (item.source_start || 0) - (reframe?.clipStartSec ?? 0);
          const sliceCrop = ProEditorService.buildSliceCropFilter(item, reframe, windowStartClipRel, timelineDur);
          const styleFilters = ProEditorService.buildItemStyleFilters(item, canvasW, canvasH, fps);
          const chain = [`trim=start=${startStr}:end=${endStr}`, 'setpts=PTS-STARTPTS'];
          if (sliceCrop) chain.push(sliceCrop);
          chain.push(...styleFilters);
          // Speed change must run BEFORE fps: resampling first and then retimestamping
          // halves/doubles the effective cadence and feeds xfade an invalid frame rate.
          if (speed !== 1) chain.push(`setpts=PTS/${speed}`);
          chain.push(`fps=${fps}`, 'setsar=1', 'format=yuv420p');
          if (gapPad) chain.push(`tpad=stop_duration=${gap.toFixed(3)}:color=black`);
          filterComplex.push(`[0:v]${chain.join(',')}${vSlice}`);

          const aChain = [`atrim=start=${startStr}:end=${endStr}`, 'asetpts=PTS-STARTPTS'];
          if (speedAudio) aChain.push(speedAudio);
          aChain.push(UNIFORM_AUDIO);
          if (gapPad) aChain.push(`apad=pad_dur=${gap.toFixed(3)}`);
          const sliceAChain = `[0:a]${aChain.join(',')}${aSlice}`;
          filterComplex.push(sliceAChain);
          audioOnlyChains.push(sliceAChain);
          sliceDurations.push(sliceDur + gap);
        }
        vLabels.push(vSlice);
        aLabels.push(aSlice);
      }

      // Transition chain: xfade for video, acrossfade for audio. Only entered when
      // at least one real (non-cut) transition exists — renders without transitions
      // keep the previous concat path byte-for-byte.
      const boundaryHasTransition = allVideoItems
        .slice(1)
        .some((item) => item.transition_in && resolveXfadeName(item.transition_in.type, item.transition_in.direction));

      if (!boundaryHasTransition) {
        const concatInputs = vLabels.map((v, i) => `${v}${aLabels[i]}`).join('');
        filterComplex.push(`${concatInputs}concat=n=${allVideoItems.length}:v=1:a=1[base_v][base_a]`);
        audioOnlyChains.push(`${aLabels.join('')}concat=n=${allVideoItems.length}:v=0:a=1[base_a]`);
        videoStreamLabel = '[base_v]';
        audioStreamLabel = '[base_a]';
      } else {
        let accV = vLabels[0];
        let accA = aLabels[0];
        let accDur = sliceDurations[0];
        for (let i = 1; i < allVideoItems.length; i++) {
          const transition = allVideoItems[i].transition_in;
          const isLast = i === allVideoItems.length - 1;
          const outV = isLast ? '[base_v]' : `[xv_${i}]`;
          const outA = isLast ? '[base_a]' : `[xa_${i}]`;

          let xfadeName = transition ? resolveXfadeName(transition.type, transition.direction) : null;
          let duration = 0;
          if (xfadeName) {
            const preset = getTransitionPreset(transition!.type);
            duration = clampTransitionDuration(
              transition!.duration ?? preset?.defaultDurationSec ?? 0.5,
              preset?.defaultDurationSec ?? 0.5
            );
            duration = Math.min(duration, sliceDurations[i - 1] * 0.45, sliceDurations[i] * 0.45);
          }
          if (!xfadeName || duration < 0.05) {
            // Hard cut inside the linear xfade chain: a single-frame crossfade is
            // visually a cut and keeps the graph a single filter path.
            xfadeName = 'fade';
            duration = 1 / fps;
          }
          const offset = Math.max(0, accDur - duration);
          let incomingLabel = vLabels[i];
          let xfadeOut = outV;
          if (transition?.type === 'zoom_lite' && duration >= 0.05) {
            // FFmpeg xfade has no zoom transition. Build one: the first `duration`
            // seconds of the incoming slice scale 1.25 -> 1.0 (per-frame scale +
            // fixed-size center crop), then concat with the untouched remainder and
            // crossfade — the incoming clip visibly zooms into place as it fades in.
            const dStr = duration.toFixed(3);
            const zFrames = Math.max(2, Math.round(duration * fps));
            // Per-frame zoom 1.25 -> 1.0 across the head segment (d=1 keeps cadence;
            // scale+crop cannot animate size because crop cannot reinit mid-stream).
            const zExpr = `1.25-0.25*on/${zFrames - 1}`;
            filterComplex.push(
              `${vLabels[i]}split=2[zzh_${i}][zzr_${i}]`,
              `[zzh_${i}]trim=start=0:end=${dStr},setpts=PTS-STARTPTS,` +
                `zoompan=z='${zExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${fps}[zzh2_${i}]`,
              `[zzr_${i}]trim=start=${dStr},setpts=PTS-STARTPTS[zzr2_${i}]`,
              // fps normalizes the branch timebase to match the sibling slice (xfade
              // requires identical timebases on both inputs).
              `[zzh2_${i}][zzr2_${i}]concat=n=2:v=1:a=0,fps=${fps},setsar=1[zzb_${i}]`
            );
            incomingLabel = `[zzb_${i}]`;
            xfadeName = 'fade';
          }
          filterComplex.push(
            `${accV}${incomingLabel}xfade=transition=${xfadeName}:duration=${duration.toFixed(3)}:offset=${offset.toFixed(3)}${xfadeOut}`
          );
          const acrossfadeChain = `${accA}${aLabels[i]}acrossfade=d=${duration.toFixed(3)}${outA}`;
          filterComplex.push(acrossfadeChain);
          audioOnlyChains.push(acrossfadeChain);
          accV = outV;
          accA = outA;
          accDur = accDur + sliceDurations[i] - duration;
        }
        videoStreamLabel = '[base_v]';
        audioStreamLabel = '[base_a]';
      }
    } else {
      // Single video item: the caller input-seeks with -ss clipStart, so filter time
      // is already clip-relative and the item keeps its own crop + styling.
      const single = allVideoItems[0];
      const singleCrop = single ? ProEditorService.buildSliceCropFilter(single, reframe, 0, canvasDuration || 10) : null;
      const styleFilters = single ? ProEditorService.buildItemStyleFilters(single, canvasW, canvasH, fps) : [];
      const singleSpeed = single ? Math.min(4, Math.max(0.25, single.speed?.speed || 1.0)) : 1.0;
      const parts: string[] = [];
      if (singleCrop) parts.push(singleCrop);
      parts.push(...styleFilters);
      if (singleSpeed !== 1) parts.push(`setpts=PTS/${singleSpeed}`);
      parts.push(`fps=${fps}`, 'format=yuv420p');
      // No comma between the input pad and the first filter: `[0:v],fps=...` parses
      // as an empty filter and aborts every single-item render (found by Phase 1b tests).
      filterComplex.push(`${videoStreamLabel}${parts.join(',')}[base_v]`);
      videoStreamLabel = '[base_v]';
      if (singleSpeed !== 1) {
        const atempo = ProEditorService.audioAtempoChain(singleSpeed);
        if (atempo) {
          const speedChain = `${audioStreamLabel}${atempo}[base_a_speed]`;
          filterComplex.push(speedChain);
          audioOnlyChains.push(speedChain);
        }
        audioStreamLabel = atempo ? '[base_a_speed]' : audioStreamLabel;
      }
    }

    // 1b. Overlay / B-Roll Video & Image Layers
    const secondaryTracks = project.tracks.filter(
      (t) =>
        !t.hidden &&
        (t.name.toLowerCase().includes('b-roll') ||
          (t.type === 'VIDEO' && t !== videoTracks[0]) ||
          t.type === 'IMAGE' ||
          t.type === 'OVERLAY')
    );

    for (const st of secondaryTracks) {
      for (const item of st.items) {
        if (item.hidden) continue;
        let assetPath = item.source_path;
        // Synthesized card backgrounds (social card chrome): no source asset;
        // the PNG is rendered here from the item's own geometry so it always
        // matches the preview's CSS borderRadius rendering.
        const cardSpec = (item as any).card as { width: number; height: number; radius: number; color: string } | undefined;
        if (!assetPath && cardSpec) {
          const cardPath = path.join(tmpDir, `card_${item.id}.png`);
          if (!fs.existsSync(cardPath)) {
            fs.writeFileSync(cardPath, roundedCardPng(cardSpec.width, cardSpec.height, cardSpec.radius, cardSpec.color));
          }
          assetPath = cardPath;
        }
        if (!assetPath) continue;

        // Defense in depth: items persisted before validation existed must not
        // reach FFmpeg. Disallowed sources are skipped with a warning.
        if (!isAllowedEditorSourcePath(project.user_id, assetPath)) {
          logger.warn(`[ProEditor] Skipping disallowed overlay asset for item ${item.id}: ${assetPath.slice(0, 80)}`);
          continue;
        }

        // Check if remote URL was already downloaded / cached into tmpDir
        if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
          const ext = overlayAssetExtension(assetPath);
          const localCachePath = path.join(tmpDir, `overlay_${item.id}${ext}`);
          if (fs.existsSync(localCachePath)) {
            assetPath = localCachePath;
          }
        }

        if (!fs.existsSync(assetPath)) continue;

        currentInputIdx++;
        const isGif = assetPath.toLowerCase().endsWith('.gif');
        if (isGif) {
          inputArgs.push('-ignore_loop', '0');
        }
        inputArgs.push('-i', assetPath);

        const dur = Math.max(0.1, item.timeline_end - item.timeline_start);
        const start = item.timeline_start;
        const end = item.timeline_end;
        const brollTag = `[broll_v_${currentInputIdx}]`;
        const nextCompTag = `[comp_v_${currentInputIdx}]`;

        const isElementOrSticker =
          st.type === 'OVERLAY' ||
          item.type === 'OVERLAY' ||
          (!st.name.toLowerCase().includes('b-roll') && item.type === 'IMAGE');

        if (isElementOrSticker) {
          const scaleVal = item.transform?.scale || 1.0;
          // Versioned semantics: 'design_center' items (new inserts) speak the
          // preview's center-origin 360x640 design space; unmarked legacy items
          // keep the historical raw-canvas-px interpretation unchanged.
          const designSpace = item.transform?.position_space === 'design_center';
          // Design canvas dims per aspect, same convention as TEXT layers.
          const designW = canvasH > canvasW ? 360 : canvasH === canvasW ? 480 : 640;
          const designH = canvasH > canvasW ? 640 : canvasH === canvasW ? 480 : 360;
          const unitX = designSpace ? canvasW / designW : 1;
          const unitY = designSpace ? canvasH / designH : 1;
          // Card items carry their exact design width; other design_center
          // items use the preview's 280px cap as the base.
          const baseDesignW = designSpace ? ((item as any).card?.width ?? 280) : 360;
          const targetW = Math.round(Math.min(canvasW * 0.85, Math.max(80, baseDesignW * scaleVal * unitX)));
          const posX = Math.round((item.transform?.position_x || 0) * unitX);
          const posY = Math.round((item.transform?.position_y || 0) * unitY);
          const opacity = item.transform?.opacity ?? 1.0;
          const rotation = item.transform?.rotation || 0;

          const filters: string[] = [`fps=${fps}`];
          if (isGif) {
            filters.push(`trim=duration=${dur.toFixed(2)},setpts=PTS-STARTPTS`);
          } else if (item.type === 'IMAGE' || item.type === 'OVERLAY') {
            filters.unshift('loop=loop=-1:size=1:start=0');
          }
          filters.push(`scale=${targetW}:-1:force_original_aspect_ratio=decrease`);
          if (opacity < 0.99) {
            filters.push(`format=rgba,colorchannelmixer=aa=${opacity.toFixed(2)}`);
          }
          if (rotation !== 0) {
            filters.push(`rotate='${rotation}*PI/180':c=none:ow='rotw(${rotation}*PI/180)':oh='roth(${rotation}*PI/180)'`);
          }

          filterComplex.push(`[${currentInputIdx}:v]${filters.join(',')}${brollTag}`);
          filterComplex.push(
            `${videoStreamLabel}${brollTag}overlay=x='(W-w)/2+${posX}':y='(H-h)/2+${posY}':enable='between(t,${start.toFixed(2)},${end.toFixed(2)})':format=auto${nextCompTag}`
          );
        } else {
          const fitMode = item.crop?.mode || 'fill';
          const scaleCropFilter =
            fitMode === 'fit'
              ? `scale=${canvasW}:${canvasH}:force_original_aspect_ratio=decrease,pad=${canvasW}:${canvasH}:(ow-iw)/2:(oh-ih)/2`
              : `scale=${canvasW}:${canvasH}:force_original_aspect_ratio=increase,crop=${canvasW}:${canvasH}`;

          if (item.type === 'IMAGE') {
            filterComplex.push(
              `[${currentInputIdx}:v]loop=loop=-1:size=1:start=0,fps=${fps},${scaleCropFilter}${brollTag}`
            );
          } else {
            const srcStart = item.source_start || 0;
            filterComplex.push(
              `[${currentInputIdx}:v]trim=start=${srcStart.toFixed(2)}:duration=${dur.toFixed(2)},setpts=PTS-STARTPTS,fps=${fps},${scaleCropFilter}${brollTag}`
            );
          }

          filterComplex.push(
            `${videoStreamLabel}${brollTag}overlay=x=0:y=0:enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'${nextCompTag}`
          );
        }

        videoStreamLabel = nextCompTag;
      }
    }

    // 2. Text layers (sorted by z_index)
    const textTracks = project.tracks.filter((t) => t.type === 'TEXT' && !t.hidden);
    const allTextItems: EditorTrackItem[] = textTracks
      .flatMap((tt) => tt.items)
      .filter((ti) => ti.text && ti.text.text && !ti.hidden)
      .sort((a, b) => (a.z_index || 10) - (b.z_index || 10));

    for (const ti of allTextItems) {
      // Rounded background card: when the item asks for a rounded background
      // and its animation keeps the block centered (none/pop/scale/fade), draw
      // one synthesized rounded card under the whole block instead of ffmpeg's
      // per-line square boxes - matching the preview's single rounded card.
      // Other animations keep the legacy per-line boxes (named limit).
      let forceNoBox = false;
      const wantsRoundedCard =
        !!ti.text?.background_color &&
        (ti.text?.background_corner_radius ?? 0) > 0 &&
        ['none', 'pop', 'scale', 'fade'].includes(ti.text?.animation || 'none');
      if (wantsRoundedCard) {
        const layout = ProEditorService.layoutTextBlock(ti, canvasW, canvasH, project.canvas.aspect_ratio || '9:16');
        const bbox = layout && ProEditorService.measureTextBlockBBox(layout, ti.text?.font_weight, canvasW, canvasH);
        if (layout && bbox) {
          // Card box mirrors the preview's CSS box, not the raw ink bbox:
          // - padding is asymmetric (pad vertical, pad*1.5 horizontal),
          // - height uses line boxes (fontSize * line_height per line, default
          //   1.2) rather than the ink height,
          // - width includes the CSS letter-spacing allowance (drawtext cannot
          //   track; the card still covers the tracked width the preview shows),
          // - width caps at 90% of the canvas like the preview's max width.
          const pad = layout.boxBorderW;
          const padH = Math.round(pad * 1.5);
          const textStyle = ti.text as { line_height?: number; letter_spacing?: number } | undefined;
          const lineHeightFactor = Number(textStyle?.line_height) > 0 ? Number(textStyle?.line_height) : 1.2;
          const trackingPx = Number(textStyle?.letter_spacing) > 0 ? Number(textStyle?.letter_spacing) * layout.scaleRatio : 0;
          const maxLineChars = Math.max(1, ...layout.safeLines.map((l) => l.replace(/\\/g, '').length));
          const nLines = layout.safeLines.length;
          const cardW = Math.min(
            Math.round(0.9 * canvasW),
            Math.round(bbox.w + trackingPx * (maxLineChars - 1) + 2 * padH)
          );
          const cardH = Math.round(nLines * layout.scaledFontSize * lineHeightFactor + 2 * pad);
          const blockCx = bbox.x + bbox.w / 2;
          const blockCy = bbox.y + bbox.h / 2;
          const cardX = Math.max(0, Math.min(canvasW - cardW, Math.round(blockCx - cardW / 2)));
          const cardY = Math.max(0, Math.min(canvasH - cardH, Math.round(blockCy - cardH / 2)));
          const radius = Math.round((ti.text!.background_corner_radius || 0) * layout.scaleRatio);
          const rawBg = (ti.text!.background_color || '').trim().replace(/^#/, '');
          const alpha = /^[0-9a-fA-F]{8}$/.test(rawBg) ? parseInt(rawBg.slice(6, 8), 16) / 255 : 0.8;
          const cardPath = path.join(tmpDir, `textcard_${ti.id}.png`);
          if (!fs.existsSync(cardPath)) {
            fs.writeFileSync(cardPath, roundedCardPng(cardW, cardH, radius, `#${rawBg.slice(0, 6)}`));
          }
          inputArgs.push('-i', cardPath);
          currentInputIdx++;
          const cardTag = `[textcard_${currentInputIdx}]`;
          const nextCardLabel = `[txtcard_${ti.id.slice(0, 6)}]`;
          const alphaChain = alpha < 0.99 ? `,format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}` : '';
          filterComplex.push(`[${currentInputIdx}:v]loop=loop=-1:size=1:start=0,fps=${fps}${alphaChain}${cardTag}`);
          filterComplex.push(
            `${videoStreamLabel}${cardTag}overlay=x=${cardX}:y=${cardY}:enable='between(t,${layout.start.toFixed(2)},${layout.end.toFixed(2)})':format=auto${nextCardLabel}`
          );
          videoStreamLabel = nextCardLabel;
          forceNoBox = true;
        }
      }
      const drawtextFilter = ProEditorService.compileTextLayerDrawtext(
        ti,
        canvasW,
        canvasH,
        project.canvas.aspect_ratio || '9:16',
        forceNoBox
      );
      if (drawtextFilter) {
        const nextLabel = `[txt_${ti.id.slice(0, 6)}]`;
        filterComplex.push(`${videoStreamLabel}${drawtextFilter}${nextLabel}`);
        videoStreamLabel = nextLabel;
      }
    }

    // 2b. ASS Subtitles (burn if subtitles.ass exists in tmpDir)
    const assPath = path.join(tmpDir, 'subtitles.ass');
    if (fs.existsSync(assPath)) {
      const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
      const nextLabel = `[sub_v_${currentInputIdx}]`;
      filterComplex.push(`${videoStreamLabel}ass=${safeAss}${nextLabel}`);
      videoStreamLabel = nextLabel;
    }

    // 3. Audio processing: Speech cleanup, secondary tracks, dynamic ducking & master limiting
    const audioFilters: string[] = [];
    const streamsToMix: string[] = [];

    // Find primary audio config or enhancement
    const primaryAudioItem = project.tracks
      .flatMap((t) => t.items)
      .find((i) => i.audio?.enhancement && i.audio.enhancement.preset !== 'off');

    // Loudness normalization is emitted at exactly one of two sites (enhancement
    // chain step 7, or the plain normalized flag). Both honor the loudnorm compile
    // mode so the render path can do measure-then-apply two-pass normalization:
    // one-pass loudnorm buffers until EOF and stalls the muxer, which piled up
    // ~740MB of decoded frames on a 120s source and OOM-killed renders (Nov 2026).
    let loudnormTargetI: number | null = null;
    const buildLoudnorm = (targetI: number): string => {
      if (loudnorm === 'measure') return LoudnormTwoPassService.buildMeasureFilter(targetI, -2.0, 11);
      if (loudnorm && typeof loudnorm === 'object' && 'measured' in loudnorm) {
        return LoudnormTwoPassService.buildLinearGainFilter(targetI, loudnorm.measured);
      }
      return `loudnorm=I=${targetI}:TP=-2.0:LRA=11`;
    };
    const preNormPath =
      loudnorm && typeof loudnorm === 'object' && 'preNormalizedDialoguePath' in loudnorm
        ? loudnorm.preNormalizedDialoguePath
        : null;
    if (preNormPath) {
      // The dialogue program (slice trims/speed/concat, enhancement, legacy
      // dynamic loudnorm, fades) was pre-rendered into a bounded audio-only WAV
      // because linear loudnorm is infeasible for the measured peaks/range and
      // in-graph one-pass loudnorm stalls the muxer (OOM on long sources).
      // Inject the WAV as the dialogue source; nothing else may consume the
      // base chain's audio pad in this mode, so sink it when it is filter-produced.
      inputArgs.push('-i', preNormPath);
      currentInputIdx++;
      if (!/^\[\d+:[au]\]$/.test(audioStreamLabel)) {
        filterComplex.push(`${audioStreamLabel}anullsink`);
      }
      filterComplex.push(`[${currentInputIdx}:a]anull[dialogue_proc]`);
    } else {
      if (primaryAudioItem?.audio?.enhancement) {
        const enh = primaryAudioItem.audio.enhancement;
        let loudnormFilter: string | undefined;
        if (enh.normalize_enabled && loudnorm !== 'off') {
          loudnormTargetI = AudioEnhancementService.resolveTargetLufs(enh);
          loudnormFilter = buildLoudnorm(loudnormTargetI);
        }
        const enhanceFilters = AudioEnhancementService.compileFilterGraph(
          enh,
          loudnormFilter ? { loudnormFilter } : undefined
        );
        audioFilters.push(...enhanceFilters);
      } else {
        const needsNormalize = project.tracks.some((t) =>
          t.items.some((i) => i.audio?.normalized)
        );
        if (needsNormalize && loudnorm !== 'off') {
          loudnormTargetI = -16;
          audioFilters.push(buildLoudnorm(-16));
        }
      }

      // Dialogue audio volume & subtle fades
      audioFilters.push('afade=t=in:ss=0:d=0.15');
      const fadeOutStart = Math.max(0, project.canvas.duration - 0.25);
      audioFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.25`);

      filterComplex.push(`${audioStreamLabel}${audioFilters.join(',')}[dialogue_proc]`);
    }
    const processedDialogueLabel = '[dialogue_proc]';
    // Dialogue input pad ([base_a] / [0:a] / [base_a_speed]) - captured before
    // audioStreamLabel is reassigned to [master_a] by the final mix below.
    const dialogueInputLabel = audioStreamLabel;

    // Process secondary audio tracks (Music, SFX, Voiceover)
    const secondaryAudioTracks = project.tracks.filter(
      (t) => t.type === 'AUDIO' && !t.hidden && !t.muted
    );

    // Count how many items require sidechain ducking under dialogue
    const duckedCount = secondaryAudioTracks.reduce((acc, t) => {
      return (
        acc +
        t.items.filter((item) => {
          if (item.hidden || item.muted || !item.source_path || !fs.existsSync(item.source_path)) return false;
          return AudioDuckingService.resolveDuckingConfig(item.audio?.ducking).enabled;
        }).length
      );
    }, 0);

    const splitLabels: string[] = [];
    if (duckedCount > 0) {
      const dialogueMixLabel = '[dialogue_mix]';
      for (let i = 0; i < duckedCount; i++) {
        splitLabels.push(`[dialogue_sc_${i + 1}]`);
      }
      filterComplex.push(
        `${processedDialogueLabel}asplit=${duckedCount + 1}${dialogueMixLabel}${splitLabels.join('')}`
      );
      streamsToMix.push(dialogueMixLabel);
    } else {
      streamsToMix.push(processedDialogueLabel);
    }

    let secAudioIdx = 0;
    let currentDuckIdx = 0;
    for (const track of secondaryAudioTracks) {
      for (const item of track.items) {
        if (!item.hidden && !item.muted && item.source_path && fs.existsSync(item.source_path)) {
          if (!isAllowedEditorSourcePath(project.user_id, item.source_path)) {
            logger.warn(`[ProEditor] Skipping disallowed audio asset for item ${item.id} in render graph`);
            continue;
          }
          inputArgs.push('-i', item.source_path);
          currentInputIdx++;
          const rawAudioLabel = `[${currentInputIdx}:a]`;
          secAudioIdx++;

          const vol = item.audio?.volume ?? 0.8;
          const fadeIn = item.audio?.fade_in ?? 0.2;
          const fadeOut = item.audio?.fade_out ?? 0.2;
          const itemDuration = Math.min(
            project.canvas.duration,
            Math.max(0.1, (item.source_end || project.canvas.duration) - (item.source_start || 0))
          );

          const preFilters = [
            `atrim=start=${(item.source_start || 0).toFixed(2)}:end=${(item.source_end || project.canvas.duration).toFixed(2)}`,
            'asetpts=PTS-STARTPTS',
            `volume=${vol.toFixed(2)}`,
            `afade=t=in:ss=0:d=${fadeIn.toFixed(2)}`,
            `afade=t=out:st=${Math.max(0, itemDuration - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}`,
          ];

          if (item.timeline_start > 0) {
            const delayMs = Math.round(item.timeline_start * 1000);
            preFilters.push(`adelay=delays=${delayMs}|${delayMs}:all=1`);
          }

          const preDuckLabel = `[sec_a_${secAudioIdx}_raw]`;
          filterComplex.push(`${rawAudioLabel}${preFilters.join(',')}${preDuckLabel}`);

          // Sidechain Ducking: If ducking enabled (default for music/b-roll), duck under dialogue
          const duckingConfig = AudioDuckingService.resolveDuckingConfig(item.audio?.ducking);
          if (duckingConfig.enabled) {
            const scInput = splitLabels[currentDuckIdx++];
            const duckedLabel = `[sec_a_${secAudioIdx}_ducked]`;
            const duckFilters = AudioDuckingService.compileSidechainFilter(
              scInput,
              preDuckLabel,
              duckedLabel,
              duckingConfig
            );
            filterComplex.push(...duckFilters);
            streamsToMix.push(duckedLabel);
          } else {
            streamsToMix.push(preDuckLabel);
          }
        }
      }
    }

    // Final Mix: Mix dialogue + ducked secondary audio + master peak limiter
    // Note: normalize=0 prevents amix from attenuating speech by 1/N inputs (preserves 100% dialogue gain)
    if (streamsToMix.length > 1) {
      filterComplex.push(
        `${streamsToMix.join('')}amix=inputs=${streamsToMix.length}:duration=first:dropout_transition=2:normalize=0,alimiter=limit=-1.0dB:attack=5:release=50:level=0[master_a]`
      );
      audioStreamLabel = '[master_a]';
    } else {
      filterComplex.push(`${streamsToMix[0]}alimiter=limit=-1.0dB:attack=5:release=50:level=0[master_a]`);
      audioStreamLabel = '[master_a]';
    }

    // Measurement graph: audio-only dialogue path with the ebur128 meter at
    // the loudnorm marker position - exactly where the linear gain is applied
    // in the final render. Post-marker filters are excluded from measurement:
    // the alimiters run with level=0 and never engage post-gain (feasibility
    // bounds gained true peak to <= -2.0dBTP, under their -1.0dB limit, so the
    // delivered post-encode ceiling stays <= -1.5dBTP within 0.5dB AAC overshoot), and
    // the constant gain commutes with the linear fades (~0.1 LU).
    // Secondary audio tracks and ducking mix in after the dialogue chain, so
    // they are excluded by construction.
    let measurement: CompiledRenderGraph['measurement'] = null;
    if (loudnorm === 'measure' && loudnormTargetI !== null) {
      const meterFilter = LoudnormTwoPassService.buildMeasureFilter(loudnormTargetI, -2.0, 11);
      const mIdx = audioFilters.findIndex((f) => f === meterFilter);
      if (mIdx === -1) {
        throw new AppError('Internal error: normalization meter missing from dialogue chain', 500, 'NORMALIZATION_METER_MISSING');
      }
      const preMarkerFilters = audioFilters.slice(0, mIdx);
      const postMarkerFilters = audioFilters.slice(mIdx + 1);
      // Bound the measured program to the render duration: the spliced program
      // can run past canvas.duration (the final render truncates with -t), and
      // metering past the truncation measures material nobody renders.
      const measureBound = `atrim=end=${Number(project.canvas.duration.toFixed(3))}`;
      measurement = {
        filterComplex: [
          ...audioOnlyChains,
          `${dialogueInputLabel}${[...preMarkerFilters, measureBound, meterFilter].join(',')}[measure_a]`,
        ],
        audioMap: '[measure_a]',
        targetI: loudnormTargetI,
        dialogueInputLabel,
        preMarkerFilters,
        postMarkerFilters,
      };
    }

    return {
      inputArgs,
      filterComplex,
      videoMap: videoStreamLabel,
      audioMap: audioStreamLabel,
      outputArgs,
      duration: project.canvas.duration,
      measurement,
    };
  }

  /**
   * Compile the render graph with two-pass loudness normalization when the project
   * requests it: measure the dialogue audio (audio-only pass, no video decode),
   * verify FFmpeg's linear-mode feasibility conditions, then compile the final
   * graph with measured linear loudnorm. Fails with LoudnormNormalizationError
   * (clear job failure) when normalization cannot be applied linearly - FFmpeg
   * would otherwise silently fall back to dynamic mode, whose whole-input buffering
   * stalls the muxer and can OOM the render on long sources.
   */
  public static async compileRenderGraphWithNormalization(
    project: EditorProject,
    sourceVideoPath: string,
    outputPath = '/tmp/render.mp4',
    tmpDir = os.tmpdir(),
    reframe?: ProReframeContext,
    inputSeekArgs: string[] = []
  ): Promise<CompiledRenderGraph> {
    const probe = ProEditorService.compileRenderGraph(project, sourceVideoPath, outputPath, tmpDir, reframe, 'measure');
    if (!probe.measurement) {
      return probe;
    }
    let measured: LoudnormMeasured;
    try {
      measured = await LoudnormTwoPassService.measure(
        [...inputSeekArgs, ...probe.inputArgs],
        probe.measurement
      );
    } catch (err: any) {
      // Silent/degenerate dialogue (screen recordings, muted stems, music-only
      // cuts): normalizing silence must not abort the whole export. Compile the
      // same graph with the loudnorm stage omitted instead.
      if (err instanceof LoudnormNormalizationError && err.silent) {
        logger.warn(
          `[ProEditorService] Dialogue measured silent (${err.reason}); ` +
            `rendering without loudness normalization.`
        );
        const graph = ProEditorService.compileRenderGraph(project, sourceVideoPath, outputPath, tmpDir, reframe, 'off');
        graph.normalizationMode = 'skipped-silent';
        return graph;
      }
      throw err;
    }
    const check = LoudnormTwoPassService.assessLinearFeasibility(measured, probe.measurement.targetI, -2.0, 11);
    if (!check.ok) {
      if (check.fallback === 'dynamic-prerender') {
        fs.mkdirSync(tmpDir, { recursive: true });
        const wavPath = path.join(tmpDir, `dialogue-normalized-${crypto.randomUUID()}.wav`);
        await LoudnormTwoPassService.renderNormalizedDialogue(
          [...inputSeekArgs, ...probe.inputArgs],
          probe.measurement,
          wavPath
        );
        logger.warn(
          `[ProEditorService] Linear loudnorm infeasible (${check.reason}); ` +
            `using pre-rendered dynamic normalization (legacy one-pass on a bounded audio-only program).`
        );
        const graph = ProEditorService.compileRenderGraph(project, sourceVideoPath, outputPath, tmpDir, reframe, {
          preNormalizedDialoguePath: wavPath,
        });
        graph.normalizationMode = 'dynamic-prerendered';
        return graph;
      }
      throw new LoudnormNormalizationError(check.reason);
    }
    const graph = ProEditorService.compileRenderGraph(project, sourceVideoPath, outputPath, tmpDir, reframe, { measured });
    graph.normalizationMode = 'linear';
    return graph;
  }

  /**
   * Helper: validates font family against curated allowlist.
   */
  /** `#RRGGBB` or `RRGGBB` → `RRGGBB` (upper), else the fallback. For ffmpeg `color=0x…`. */
  /** `#RRGGBB`, `#RRGGBBAA`, or `RRGGBB` → `RRGGBB` (upper), else fallback. For ffmpeg `0x…`. */
  public static sanitizeHexColor(hex: unknown, fallback = '0B0D12'): string {
    if (typeof hex === 'string') {
      const clean = hex.trim().replace(/^#/, '');
      const m = clean.match(/^([0-9a-fA-F]{6})/);
      if (m) return m[1].toUpperCase();
    }
    return fallback;
  }

  /**
   * Compiles an EditorTrackItem with EditorTextConfig into an FFmpeg drawtext filter string.
   * Accurately maps geometry, font size, color, background box, outline, shadow, and motion animations.
   */
  /** Shared text-block layout: the exact wrap, sizing and geometry both the
   * drawtext compiler and the rounded-card measurer must agree on. */
  private static layoutTextBlock(
    item: EditorTrackItem,
    canvasW: number,
    canvasH: number,
    aspectRatio: string = '9:16'
  ): {
    safeLines: string[]; font: SafeEditorFont; scaledFontSize: number; scaleRatio: number;
    posX: number; posY: number; start: number; end: number; boxBorderW: number; lineGap: number;
  } | null {
    if (!item.text || !item.text.text) return null;

    // Multi-line text (e.g. the auto-headline's wrapped title) renders as one drawtext
    // per line, vertically stacked and block-centered on the item position - mirroring
    // both the legacy headline layout and the preview's centered multi-line block.
    const capped = item.text.text.slice(0, 100).trim();
    if (!capped) return null;
    const rawLines = capped.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
    if (rawLines.length === 0) return null;

    const font = this.validateFont(item.text.font_family);

    // Compute coordinate scale ratio between preview container and export canvas
    // Preview container reference: 9:16 is 360x640, 1:1 is 480x480, 16:9 is 640x360
    const previewH = aspectRatio === '9:16' ? 640 : aspectRatio === '1:1' ? 480 : 360;
    const previewW = aspectRatio === '9:16' ? 360 : aspectRatio === '1:1' ? 480 : 640;
    const scaleRatio = canvasH / previewH;

    const baseSize = item.text.font_size || 36;
    const itemScale = item.transform?.scale || 1.0;
    const scaledFontSize = Math.max(16, Math.round(baseSize * scaleRatio * itemScale));

    // Word-wrap each explicit line to the same width the preview block allows (90% of
    // canvas, ~0.5em average advance), so long single-line text breaks where the
    // preview wraps instead of overflowing the canvas. Explicit newlines are kept.
    const maxChars = Math.max(8, Math.floor((0.9 * canvasW) / (scaledFontSize * 0.5)));
    const wrappedLines: string[] = [];
    for (const line of rawLines) {
      let rest = line;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf(' ', maxChars);
        if (cut < Math.floor(maxChars * 0.5)) cut = maxChars;
        wrappedLines.push(rest.slice(0, cut).trimEnd());
        rest = rest.slice(cut).trimStart();
      }
      if (rest) wrappedLines.push(rest);
    }
    const finalLines = wrappedLines.slice(0, 4);

    // Sanitize user text for FFmpeg drawtext (escape backslashes, percent signs, and colons)
    const sanitizeLine = (t: string) =>
      t.replace(/\\/g, '\\\\')
        .replace(/'/g, '')
        .replace(/:/g, '\\:')
        .replace(/%/g, '\\%');
    const safeLines = finalLines.map(sanitizeLine);

    const posX = Math.round((item.transform?.position_x || 0) * (canvasW / previewW));
    const posY = Math.round((item.transform?.position_y || 0) * scaleRatio);

    const start = Math.max(0, item.timeline_start);
    const end = Math.max(start + 0.1, item.timeline_end);

    const boxBorderW = Math.max(4, Math.round((item.text.background_padding || 8) * scaleRatio));
    const lineGap = Math.max(2, Math.round(scaledFontSize * 1.15));
    return { safeLines, font, scaledFontSize, scaleRatio, posX, posY, start, end, boxBorderW, lineGap };
  }

  /**
   * Measures the exact rendered bounding box of a text block by drawing it
   * once with the same drawtext parameters (final, un-animated state) onto a
   * transparent canvas and scanning the alpha channel. Used to size the
   * rounded card underlay so it matches the real font metrics instead of an
   * estimate. Returns null on any probe failure (caller falls back to the
   * legacy per-line boxes).
   */
  private static measureTextBlockBBox(
    layout: NonNullable<ReturnType<typeof ProEditorService.layoutTextBlock>>,
    fontWeight: string | undefined,
    canvasW: number,
    canvasH: number
  ): { x: number; y: number; w: number; h: number } | null {
    try {
      const probeBin = getDrawtextFfmpeg();
      if (!probeBin) return null;
      const { safeLines, font, scaledFontSize, posX, posY, lineGap } = layout;
      const chain = safeLines
        .map((lineText, i) => {
          const offset = (i - (safeLines.length - 1) / 2) * lineGap;
          return `drawtext=text='${lineText}':${drawtextFontArg(font, fontWeight)}:fontsize=${scaledFontSize}:fontcolor=0xFFFFFF:x='(w-text_w)/2+${posX}':y='(h-text_h)/2+${posY}${offset >= 0 ? '+' : ''}${offset.toFixed(1)}'`;
        })
        .join(',');
      const res = spawnSync(
        probeBin,
        ['-y', '-f', 'lavfi', '-i', `color=c=black@0.0:s=${canvasW}x${canvasH},format=rgba`, '-vf', chain, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
        { maxBuffer: canvasW * canvasH * 4 + 4096, timeout: 20000 }
      );
      if (res.status !== 0 || !res.stdout || res.stdout.length < canvasW * canvasH * 4) return null;
      const buf = res.stdout;
      let minX = canvasW, minY = canvasH, maxX = -1, maxY = -1;
      for (let y = 0; y < canvasH; y += 1) {
        const row = y * canvasW * 4;
        for (let x = 0; x < canvasW; x += 1) {
          if (buf[row + x * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return null;
      return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } catch {
      return null;
    }
  }

  public static compileTextLayerDrawtext(
    item: EditorTrackItem,
    canvasW: number,
    canvasH: number,
    aspectRatio: string = '9:16',
    forceNoBox: boolean = false
  ): string | null {
    const layout = ProEditorService.layoutTextBlock(item, canvasW, canvasH, aspectRatio);
    if (!layout) return null;
    const textCfg = item.text!;
    const { safeLines, font, scaledFontSize, scaleRatio, posX, posY, start, end } = layout;

    const fontColor = this.sanitizeHexColor(textCfg.color, 'FFFFFF');
    const baseOpacity = item.transform?.opacity ?? 1.0;

    const itemDur = end - start;
    const animDur = Math.min(itemDur * 0.45, textCfg.animation_duration || 0.45);
    const anim = textCfg.animation || 'none';

    // Base coordinates: center is (w-text_w)/2 and (h-text_h)/2
    let xExpr = `(w-text_w)/2+${posX}`;
    let yExpr = `(h-text_h)/2+${posY}`;
    let alphaExpr: string = `${baseOpacity.toFixed(2)}`;
    let sizeExpr: string = `${scaledFontSize}`;

    // Apply motion animation expressions
    if (anim === 'fade' && animDur > 0) {
      alphaExpr = `if(lt(t,${(start + animDur).toFixed(2)}),(t-${start.toFixed(2)})/${animDur.toFixed(2)},if(gt(t,${(end - animDur).toFixed(2)}),(${end.toFixed(2)}-t)/${animDur.toFixed(2)},1))*${baseOpacity.toFixed(2)}`;
    } else if (anim === 'slide_up' && animDur > 0) {
      const slidePx = Math.round(50 * scaleRatio);
      yExpr = `((h-text_h)/2+${posY})+if(lt(t,${(start + animDur).toFixed(2)}),${slidePx}*(1-(t-${start.toFixed(2)})/${animDur.toFixed(2)}),0)`;
      alphaExpr = `if(lt(t,${(start + animDur).toFixed(2)}),(t-${start.toFixed(2)})/${animDur.toFixed(2)},if(gt(t,${(end - animDur).toFixed(2)}),(${end.toFixed(2)}-t)/${animDur.toFixed(2)},1))*${baseOpacity.toFixed(2)}`;
    } else if ((anim === 'pop' || anim === 'scale') && animDur > 0) {
      sizeExpr = `${scaledFontSize}*if(lt(t,${(start + animDur).toFixed(2)}),0.6+0.4*(t-${start.toFixed(2)})/${animDur.toFixed(2)},1)`;
      alphaExpr = `if(lt(t,${(start + animDur).toFixed(2)}),(t-${start.toFixed(2)})/${animDur.toFixed(2)},1)*${baseOpacity.toFixed(2)}`;
    } else if (anim === 'bounce_lite' && animDur > 0) {
      const bouncePx = Math.round(20 * scaleRatio);
      yExpr = `((h-text_h)/2+${posY})+if(lt(t,${(start + animDur).toFixed(2)}),${bouncePx}*sin((t-${start.toFixed(2)})/${animDur.toFixed(2)}*7.85)*(1-(t-${start.toFixed(2)})/${animDur.toFixed(2)}),0)`;
      alphaExpr = `if(lt(t,${(start + animDur).toFixed(2)}),(t-${start.toFixed(2)})/${animDur.toFixed(2)},1)*${baseOpacity.toFixed(2)}`;
    }

    const filterParts: string[] = [
      `text='${safeLines[0]}'`,
      drawtextFontArg(font, textCfg.font_weight),
      `fontsize='${sizeExpr}'`,
      `fontcolor=0x${fontColor}`,
      `alpha='${alphaExpr}'`,
      `x='${xExpr}'`,
      `y='${yExpr}'`,
    ];

    // Background box (suppressed when the caller draws a rounded card underlay)
    if (forceNoBox) {
      filterParts.push('box=0');
    } else if (textCfg.background_color) {
      const boxHex = this.sanitizeHexColor(textCfg.background_color, '000000');
      const boxBorderW = Math.max(4, Math.round((textCfg.background_padding || 8) * scaleRatio));
      filterParts.push(`box=1:boxcolor=0x${boxHex}@0.8:boxborderw=${boxBorderW}`);
    } else {
      filterParts.push('box=0');
    }

    // Stroke / outline
    if (textCfg.stroke_width && textCfg.stroke_width > 0) {
      const strokeW = Math.max(1, Math.round(textCfg.stroke_width * scaleRatio));
      const strokeHex = this.sanitizeHexColor(textCfg.stroke_color, '000000');
      filterParts.push(`borderw=${strokeW}:bordercolor=0x${strokeHex}`);
    }

    // Drop shadow
    if (textCfg.shadow_blur && textCfg.shadow_blur > 0) {
      const shadowOffset = Math.max(2, Math.round(3 * scaleRatio));
      const shadowHex = this.sanitizeHexColor(textCfg.shadow_color, '000000');
      filterParts.push(`shadowx=${shadowOffset}:shadowy=${shadowOffset}:shadowcolor=0x${shadowHex}@0.75`);
    }

    filterParts.push(`enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);

    if (safeLines.length === 1) {
      return `drawtext=${filterParts.join(':')}`;
    }

    // Stack lines block-centered on the item position.
    const lineGap = layout.lineGap;
    return safeLines
      .map((lineText, i) => {
        const offset = (i - (safeLines.length - 1) / 2) * lineGap;
        const parts = filterParts.map((p) => {
          if (p.startsWith('text=')) return `text='${lineText}'`;
          if (p.startsWith('y=')) return `y='${yExpr}${offset >= 0 ? '+' : ''}${offset.toFixed(1)}'`;
          return p;
        });
        return `drawtext=${parts.join(':')}`;
      })
      .join(',');
  }

  /**
   * Makes user text safe for an ffmpeg drawtext filter value: strips the characters the
   * drawtext parser treats specially (quotes, colons, backslashes, percent, braces) so no
   * filter injection is possible, keeps it short, and collapses whitespace.
   */
  public static escapeDrawtext(text: unknown): string {
    if (typeof text !== 'string') return '';
    return text
      .replace(/[\r\n]+/g, ' ')
      .replace(/[^A-Za-z0-9 .,!?&()\-]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  }

  public static validateFont(font?: string): SafeEditorFont {
    if (!font || typeof font !== 'string') return 'Arial';
    const clean = font.trim();
    if ((SAFE_EDITOR_FONTS as readonly string[]).includes(clean)) {
      return clean as SafeEditorFont;
    }
    return 'Arial';
  }

  /**
   * Builds an initial EditorProject structure from a clip and optional Producer plan.
   */
  private static buildInitialProject(
    clip: ClipRecord,
    userId: string,
    producerPlan: ProducerEditPlan | null,
    transcript: any,
    dto: CreateEditorProjectDTO
  ): EditorProject {
    const rawDuration = clip.end_seconds - clip.start_seconds;
    const aspectRatio = dto.aspect_ratio || clip.aspect_ratio || '9:16';
    const isVertical = aspectRatio === '9:16';
    const canvasW = isVertical ? 1080 : aspectRatio === '1:1' ? 1080 : 1920;
    const canvasH = isVertical ? 1920 : aspectRatio === '1:1' ? 1080 : 1080;

    let trimStart = clip.trim_start_offset || 0;
    let trimEnd = clip.trim_end_offset || 0;
    let duration = rawDuration - trimStart - trimEnd;

    const hasColdOpen = Boolean(clip.cold_open && clip.cold_open.enabled && clip.cold_open.duration_seconds > 0);
    const teaserDuration = hasColdOpen ? Number((clip.cold_open!.duration_seconds).toFixed(3)) : 0;
    const finalDuration = Number((hasColdOpen ? duration + teaserDuration : duration).toFixed(3));

    const tracks: EditorTrack[] = [];

    // Mirror the clip-level crop decision into the primary video item: 'fit' and
    // 'manual' are per-item crop overrides in the pro render path; 'smart'/unset
    // leaves item.crop undefined so the smart-reframe track (or center fallback)
    // applies exactly as the Quick Clip path decides. Without this mirror the pro
    // path fill-cropped every clip, silently overriding fit letterboxing.
    const clipCrop = (clip as any).crop_config;
    const seededCrop: { mode: 'fill' | 'fit' | 'custom'; focusX: number; focusY: number } | undefined =
      clipCrop?.mode === 'fit'
        ? { mode: 'fit', focusX: clipCrop.focusX ?? 0.5, focusY: clipCrop.focusY ?? 0.5 }
        : clipCrop?.mode === 'manual'
          ? { mode: 'custom', focusX: clipCrop.focusX ?? 0.5, focusY: clipCrop.focusY ?? 0.5 }
          : undefined;

    // Track 1: Main Video Track (Multi-slice with Cold Open if enabled)
    const videoTrackId = crypto.randomUUID();
    const videoItems: EditorTrackItem[] = [];

    if (hasColdOpen) {
      const co = clip.cold_open!;
      videoItems.push({
        id: crypto.randomUUID(),
        track_id: videoTrackId,
        type: 'VIDEO',
        source_asset_id: clip.id,
        source_path: clip.source_storage_path,
        timeline_start: 0,
        timeline_end: teaserDuration,
        source_start: Number(co.start_seconds.toFixed(3)),
        source_end: Number(co.end_seconds.toFixed(3)),
        transform: {
          position_x: 0,
          position_y: 0,
          scale: 1.0,
          rotation: 0,
          opacity: 1.0,
        },
        crop: seededCrop ? { ...seededCrop } : undefined,
        speed: { speed: 1.0, pitch_preserved: true },
        audio: {
          volume: clip.volume !== undefined ? clip.volume : 1.0,
          fade_in: 0.1,
          fade_out: 0.1,
          normalized: true,
          target_lufs: -16,
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: Boolean(clip.muted),
        hidden: false,
        z_index: 0,
      });
    }

    const videoItemId = crypto.randomUUID();
    const videoItem: EditorTrackItem = {
      id: videoItemId,
      track_id: videoTrackId,
      type: 'VIDEO',
      source_asset_id: clip.id,
      source_path: clip.source_storage_path,
      timeline_start: teaserDuration,
      timeline_end: finalDuration,
      source_start: Number((clip.start_seconds + trimStart).toFixed(3)),
      source_end: Number((clip.end_seconds - trimEnd).toFixed(3)),
      transform: {
        position_x: 0,
        position_y: 0,
        scale: 1.0,
        rotation: 0,
        opacity: 1.0,
      },
      crop: seededCrop ? { ...seededCrop } : undefined,
      speed: { speed: 1.0, pitch_preserved: true },
      audio: {
        volume: clip.volume !== undefined ? clip.volume : 1.0,
        fade_in: producerPlan?.operations.find((o) => o.type === 'AUDIO_FADE' && o.enabled)?.parameters.fade_in_sec ?? 0.15,
        fade_out: producerPlan?.operations.find((o) => o.type === 'AUDIO_FADE' && o.enabled)?.parameters.fade_out_sec ?? 0.25,
        normalized: true,
        target_lufs: -16,
      },
      effects: [],
      keyframes: [],
      locked: false,
      muted: Boolean(clip.muted),
      hidden: false,
      z_index: 0,
    };
    videoItems.push(videoItem);

    tracks.push({
      id: videoTrackId,
      type: 'VIDEO',
      name: 'Main Video',
      locked: false,
      muted: false,
      hidden: false,
      height: 64,
      items: videoItems,
    });

    // Track 2: Text / Overlay Track
    const textTrackId = crypto.randomUUID();
    const textItems: EditorTrackItem[] = [];

    // If Producer had a hook banner or clip has overlay config, initialize it on text track
    const hookText = producerPlan?.operations.find((o) => o.type === 'HOOK_TEXT')?.parameters.text ||
      clip.overlay_config?.text;

    // Auto-headline parity: the legacy render burns clip.title as a timed headline
    // (ClipRenderService.buildHeadlineSpec) whenever overlay_config is unset. Mirror it
    // as an editable text item so the studio preview shows what export will burn.
    const autoHeadlineText =
      !hookText && clip.overlay_config?.enabled === undefined && !clip.overlay_config?.text && clip.title
        ? String(clip.title).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
        : null;
    if (!hookText && autoHeadlineText) {
      const capped = autoHeadlineText.length > 60 ? autoHeadlineText.slice(0, 57).trimEnd() + '...' : autoHeadlineText;
      let headLines = [capped];
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
        if (best >= 0) headLines = [words.slice(0, best + 1).join(' '), words.slice(best + 1).join(' ')];
      }
      const longest = Math.max(...headLines.map((l) => l.length));
      const tier = longest <= 22 ? 64 : longest <= 28 ? 56 : longest <= 34 ? 48 : 40;
      textItems.push({
        id: crypto.randomUUID(),
        track_id: textTrackId,
        type: 'TEXT',
        timeline_start: 0,
        timeline_end: Math.min(5, finalDuration),
        source_start: 0,
        source_end: Math.min(5, finalDuration),
        // Legacy draws wrapped lines with the FIRST line top at y=150 (then +fontSize+8
        // per line); the pro item is block-centered on the transform position, so the
        // center sits at 150 + fontSize/2 + (lines-1)/2*(fontSize+8). For the default
        // 2-line wrap: 211.5 export px => (211.5-960)/3 = -249.5 preview px. This keeps
        // the headline below the watermark zone (top-right box ends ~y=129) and matches
        // the legacy layout exactly.
        transform: { position_x: 0, position_y: -249.5, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        text: {
          text: headLines.join('\n'),
          font_family: 'Arial',
          font_size: Math.max(12, Math.round(tier / 3)),
          font_weight: 'regular',
          italic: false,
          alignment: 'center',
          color: '#FFFFFF',
          preset: 'bold',
          animation: 'none',
          auto_headline: true,
        } as any,
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: 10,
      });
    }

    if (hookText) {
      textItems.push({
        id: crypto.randomUUID(),
        track_id: textTrackId,
        type: 'TEXT',
        timeline_start: 0,
        timeline_end: 3.5,
        source_start: 0,
        source_end: 3.5,
        transform: { position_x: 0, position_y: -600, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        text: {
          text: String(hookText),
          font_family: 'Arial',
          font_size: 48,
          font_weight: 'bold',
          italic: false,
          alignment: 'center',
          color: '#FFFFFF',
          background_color: '#000000B3',
          preset: 'bold',
          animation: 'pop',
          auto_headline: true,
        },
        effects: [],
        keyframes: [],
        locked: false,
        muted: true,
        hidden: false,
        z_index: 10,
      });
    }

    tracks.push({
      id: textTrackId,
      type: 'TEXT',
      name: 'Text & Titles',
      locked: false,
      muted: false,
      hidden: false,
      height: 48,
      items: textItems,
    });

    // Track 3: Caption Track
    const captionTrackId = crypto.randomUUID();
    const captionStyle = producerPlan?.operations.find((o) => o.type === 'CAPTION_STYLE')?.parameters.style ||
      clip.caption_style || 'highlight';

    let initialCues: any[] = [];
    if (transcript) {
      try {
        const extracted = CaptionService.extractCuesForClipSettings(transcript, clip, aspectRatio);
        const rawCues = extracted.cues || [];
        if (hasColdOpen) {
          if (clip.cold_open?.teaser_text) {
            initialCues.push({
              text: clip.cold_open.teaser_text,
              start: 0.1,
              end: Math.max(0.2, Number((teaserDuration - 0.1).toFixed(3))),
              words: [],
            });
          }
          for (const c of rawCues) {
            initialCues.push({
              ...c,
              start: Number((c.start + teaserDuration).toFixed(3)),
              end: Number((c.end + teaserDuration).toFixed(3)),
            });
          }
        } else {
          initialCues = rawCues;
        }
      } catch (err: any) {
        logger.warn(`Failed to extract initial cues for EditorProject: ${err.message}`);
      }
    }

    tracks.push({
      id: captionTrackId,
      type: 'CAPTION',
      name: 'Subtitles',
      locked: false,
      muted: false,
      // Respect a clip saved with captions off ("No Caption")
      hidden: clip.caption_enabled === false,
      height: 48,
      items: [
        {
          id: crypto.randomUUID(),
          track_id: captionTrackId,
          type: 'CAPTION',
          timeline_start: 0,
          timeline_end: finalDuration,
          source_start: 0,
          source_end: finalDuration,
          transform: { position_x: 0, position_y: 500, scale: 1.0, rotation: 0, opacity: 1.0 },
          speed: { speed: 1.0, pitch_preserved: true },
          caption: {
            cues: initialCues,
            // Coverage marker for beyond-candidate extend: the studio appends
            // only cues past this clip-local second, so user edits/deletions
            // inside the covered region are never resurrected.
            cues_covered_end: finalDuration,
            style: captionStyle,
            position: clip.caption_position || 'bottom',
            highlight_color: producerPlan?.operations.find((o) => o.type === 'CAPTION_EMPHASIS' && o.enabled)?.parameters.highlight_color || '#FACC15',
            primary_color: '#FFFFFF',
            animation: 'highlight',
          },
          effects: [],
          keyframes: [],
          locked: false,
          muted: true,
          hidden: false,
          z_index: 20,
        },
      ],
    });

    // Track 4: Sound Design (SFX) Track
    if (transcript && Array.isArray(transcript.words) && transcript.words.length > 0) {
      try {
        const sfxCues = SoundDesignService.generateSoundDesignCues({
          words: transcript.words
            .filter((w: any) => w.start >= clip.start_seconds && w.end <= clip.end_seconds)
            .map((w: any) => ({
              ...w,
              start: Number((w.start - clip.start_seconds + (hasColdOpen ? teaserDuration : 0)).toFixed(3)),
              end: Number((w.end - clip.start_seconds + (hasColdOpen ? teaserDuration : 0)).toFixed(3)),
            })),
          durationSeconds: finalDuration,
          coldOpenActive: hasColdOpen,
          coldOpenDuration: teaserDuration,
          genre: clip.genre,
        });

        if (sfxCues.length > 0) {
          const sfxTrack = SoundDesignService.createSfxTrack(sfxCues, finalDuration);
          tracks.push(sfxTrack);
        }
      } catch (err: any) {
        logger.warn(`Failed to initialize sound design track: ${err.message}`);
      }
    }

    // If Producer had punch-in zoom, add keyframe to video item
    const punchInOp = producerPlan?.operations.find((o) => o.type === 'PUNCH_IN' && o.enabled);
    if (punchInOp && punchInOp.parameters.punch_in_start_sec !== undefined) {
      const punchTime = Math.max(0, punchInOp.parameters.punch_in_start_sec - clip.start_seconds);
      videoItem.keyframes.push({
        id: crypto.randomUUID(),
        time: Number(punchTime.toFixed(3)),
        property: 'scale',
        value: punchInOp.parameters.scale || 1.06,
        easing: 'ease-in-out',
      });
    }

    const now = new Date();

    return {
      id: crypto.randomUUID(),
      user_id: userId,
      project_id: clip.project_id,
      clip_id: clip.id,
      version: 1,
      status: 'draft',
      title: dto.title || `Editor: ${clip.title || 'Untitled Clip'}`,
      canvas: {
        width: canvasW,
        height: canvasH,
        aspect_ratio: aspectRatio,
        fps: 30,
        duration: finalDuration,
        background_color: '#000000',
        background_mode: 'color',
      },
      tracks,
      playhead: 0,
      settings: {
        snapping: true,
        safe_guides: true,
        snap_tolerance_sec: 0.15,
        show_safe_zones: true,
      },
      producer_plan_id: producerPlan?.id || null,
      output_storage_path: null,
      preview_video_url: null,
      created_at: now,
      updated_at: now,
    };
  }
}
