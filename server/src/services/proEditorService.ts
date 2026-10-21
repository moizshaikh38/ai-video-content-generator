import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
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
} from '../types/index.js';
import { downloadObjectToFile, uploadFile, signObjectGet } from './objectStorageService.js';
import { CaptionService } from './captionService.js';
import { isKnownCaptionStyle } from '../shared/captionPresets.js';
import { buildCropFilter } from './clipRenderService.js';
import { AudioEnhancementService } from './audioEnhancementService.js';
import { AudioDuckingService } from './audioDuckingService.js';
import { SoundDesignService } from './soundDesignService.js';
import { partitionCaptionCues } from '../utils/editorRippleCut.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

export interface CompiledRenderGraph {
  inputArgs: string[];
  filterComplex: string[];
  videoMap: string;
  audioMap: string;
  outputArgs: string[];
  duration: number;
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
      return existingProject as EditorProject;
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
    return editorProject;
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
        for (const itm of tr.items) {
          itm.timeline_end = Math.max(0, Number((itm.timeline_end - duration).toFixed(3)));
          if (Array.isArray(itm.caption?.cues)) {
            const cutStart = deletePoint;
            const cutEnd = deletePoint + duration;
            const newCues: any[] = [];
            for (const cue of itm.caption.cues) {
              if (cue.end <= cutStart) {
                newCues.push(cue);
              } else if (cue.start >= cutEnd) {
                const shiftedWords = Array.isArray(cue.words)
                  ? cue.words.map((w: any) => ({
                      ...w,
                      start: Math.max(0, Number((w.start - duration).toFixed(3))),
                      end: Math.max(0.05, Number((w.end - duration).toFixed(3))),
                    }))
                  : cue.words;
                newCues.push({
                  ...cue,
                  start: Math.max(0, Number((cue.start - duration).toFixed(3))),
                  end: Math.max(0.05, Number((cue.end - duration).toFixed(3))),
                  words: shiftedWords,
                });
              } else if (cue.start < cutStart && cue.end > cutEnd) {
                newCues.push({
                  ...cue,
                  end: Number(cutStart.toFixed(3)),
                });
              } else if (cue.start < cutStart && cue.end > cutStart) {
                newCues.push({
                  ...cue,
                  end: Number(cutStart.toFixed(3)),
                });
              }
            }
            itm.caption.cues = newCues;
          }
        }
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

    const duplicatedItem: EditorTrackItem = {
      ...JSON.parse(JSON.stringify(item)),
      id: crypto.randomUUID(),
      timeline_start: Number(newItemStart.toFixed(3)),
      timeline_end: Number(newItemEnd.toFixed(3)),
      keyframes: item.keyframes.map((k) => ({
        ...k,
        id: crypto.randomUUID(),
      })),
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
        if (
          item.source_path &&
          (item.source_path.startsWith('http://') || item.source_path.startsWith('https://'))
        ) {
          try {
            const ext = item.source_path.includes('.gif')
              ? '.gif'
              : item.source_path.includes('.png')
              ? '.png'
              : '.webp';
            const localCachePath = path.join(tmpDir, `overlay_${item.id}${ext}`);
            if (!fs.existsSync(localCachePath)) {
              const res = await fetch(item.source_path, { headers: { 'User-Agent': 'VireoClip/1.0' } });
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
   * Compiles the entire multi-track EditorProject into a valid FFmpeg RenderGraph V2.
   * Enforces argument array execution with ZERO raw shell string interpolation.
   */
  public static compileRenderGraph(
    project: EditorProject,
    sourceVideoPath: string,
    outputPath = '/tmp/render.mp4',
    tmpDir = os.tmpdir()
  ): CompiledRenderGraph {
    const inputArgs: string[] = [];
    const filterComplex: string[] = [];
    const outputArgs: string[] = [];

    // Canvas properties
    const canvasW = project.canvas.width || 1080;
    const canvasH = project.canvas.height || 1920;
    const fps = project.canvas.fps || 30;

    // 1. Primary input: source video
    inputArgs.push('-i', sourceVideoPath);
    let currentInputIdx = 0;

    // Locate video items
    const videoTracks = project.tracks.filter((t) => t.type === 'VIDEO' && !t.hidden);
    const allVideoItems: EditorTrackItem[] = [];
    for (const vt of videoTracks) {
      allVideoItems.push(...vt.items.filter((i) => !i.hidden));
    }
    allVideoItems.sort((a, b) => a.timeline_start - b.timeline_start);

    // Build base video stream
    let videoStreamLabel = '[0:v]';
    let audioStreamLabel = '[0:a]';

    // Base video scaling & crop filter
    const baseCropFilter = buildCropFilter(project.canvas.aspect_ratio || '9:16');

    if (allVideoItems.length > 1) {
      // Multiple timeline segments: slice real video, or synthesize title cards, then concat.
      const vLabels: string[] = [];
      const aLabels: string[] = [];
      for (let i = 0; i < allVideoItems.length; i++) {
        const item = allVideoItems[i];
        const vSlice = `[v_slice_${i}]`;
        const aSlice = `[a_slice_${i}]`;
        const dur = Math.max(0.1, item.timeline_end - item.timeline_start);

        if ((item as any).is_title_card) {
          // Title card: a solid-colour frame with centred text + matching silent audio.
          const bgHex = ProEditorService.sanitizeHexColor((item as any).background_color, '0B0D12');
          const cardText = ProEditorService.escapeDrawtext((item as any).title_card_text || item.name || '');
          const fontSize = Math.max(32, Math.round(canvasH * 0.06));

          inputArgs.push('-f', 'lavfi', '-i', `color=c=0x${bgHex}:s=${canvasW}x${canvasH}:r=${fps}:d=${dur.toFixed(2)}`);
          currentInputIdx++;
          const colorIdx = currentInputIdx;
          inputArgs.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
          currentInputIdx++;
          const silenceIdx = currentInputIdx;

          const drawtext = cardText
            ? `,drawtext=text='${cardText}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=(h-text_h)/2`
            : '';
          filterComplex.push(`[${colorIdx}:v]setpts=PTS-STARTPTS,fps=${fps}${drawtext}[tc_v_${i}]`);
          filterComplex.push(`[tc_v_${i}]setsar=1${vSlice}`);
          filterComplex.push(`[${silenceIdx}:a]atrim=0:${dur.toFixed(2)},asetpts=PTS-STARTPTS${aSlice}`);
        } else {
          const startStr = (item.source_start || 0).toFixed(2);
          const endStr = (item.source_end !== undefined ? item.source_end : (Number(startStr) + dur)).toFixed(2);
          filterComplex.push(
            `[0:v]trim=start=${startStr}:end=${endStr},setpts=PTS-STARTPTS,${baseCropFilter},fps=${fps},setsar=1${vSlice}`
          );
          filterComplex.push(
            `[0:a]atrim=start=${startStr}:end=${endStr},asetpts=PTS-STARTPTS${aSlice}`
          );
        }
        vLabels.push(vSlice);
        aLabels.push(aSlice);
      }
      const concatInputs = vLabels.map((v, i) => `${v}${aLabels[i]}`).join('');
      filterComplex.push(`${concatInputs}concat=n=${allVideoItems.length}:v=1:a=1[base_v][base_a]`);
      videoStreamLabel = '[base_v]';
      audioStreamLabel = '[base_a]';
    } else {
      filterComplex.push(`${videoStreamLabel}${baseCropFilter},fps=${fps}[base_v]`);
      videoStreamLabel = '[base_v]';
    }

    // Apply color adjustments, filters, and effects from first video item if available
    if (allVideoItems.length > 0) {
      const primary = allVideoItems[0];
      const videoFilters: string[] = [];

      // Color adjustments
      if (primary.color) {
        const c = primary.color;
        const b = (c.brightness || 0).toFixed(2);
        const cont = (1.0 + (c.contrast || 0)).toFixed(2);
        const sat = (1.0 + (c.saturation || 0)).toFixed(2);
        videoFilters.push(`eq=brightness=${b}:contrast=${cont}:saturation=${sat}`);
      }

      // Filter preset
      if (primary.filter && primary.filter.preset !== 'none') {
        switch (primary.filter.preset) {
          case 'warm':
            videoFilters.push('colorbalance=rs=0.1:gs=0.05:bs=-0.1');
            break;
          case 'cool':
            videoFilters.push('colorbalance=rs=-0.1:gs=0.0:bs=0.15');
            break;
          case 'mono':
            videoFilters.push('hue=s=0');
            break;
          case 'punch':
            videoFilters.push('eq=contrast=1.2:saturation=1.25');
            break;
          case 'film':
            videoFilters.push('curves=preset=vintage');
            break;
        }
      }

      // Effects
      for (const eff of primary.effects) {
        if (eff.type === 'vignette') {
          videoFilters.push('vignette=PI/4');
        } else if (eff.type === 'blur') {
          const r = Math.max(1, Math.round((eff.intensity || 0.5) * 10));
          videoFilters.push(`boxblur=${r}:1`);
        } else if (eff.type === 'sharpen') {
          videoFilters.push('unsharp=5:5:1.0:5:5:0.0');
        }
      }

      // Keyframe dynamic zoom / transform (e.g. punch-in)
      const scaleKeyframes = primary.keyframes.filter((k) => k.property === 'scale');
      if (scaleKeyframes.length > 0) {
        const kf = scaleKeyframes[0];
        const kfStart = primary.timeline_start + kf.time;
        const kfDur = 2.5;
        const scaleVal = kf.value || 1.06;
        videoFilters.push(
          `crop=w='if(between(t,${kfStart.toFixed(2)},${(kfStart + kfDur).toFixed(2)}), in_w/${scaleVal}, in_w)':h='if(between(t,${kfStart.toFixed(2)},${(kfStart + kfDur).toFixed(2)}), in_h/${scaleVal}, in_h)':x=(in_w-out_w)/2:y=(in_h-out_h)/2,scale=${canvasW}:${canvasH}`
        );
      }

      if (videoFilters.length > 0) {
        filterComplex.push(`${videoStreamLabel}${videoFilters.join(',')}[styled_v]`);
        videoStreamLabel = '[styled_v]';
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
        if (!assetPath) continue;

        // Check if remote URL was already downloaded / cached into tmpDir
        if (assetPath.startsWith('http://') || assetPath.startsWith('https://')) {
          const ext = assetPath.includes('.gif') ? '.gif' : assetPath.includes('.png') ? '.png' : '.webp';
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
          const targetW = Math.round(Math.min(canvasW * 0.85, Math.max(80, 360 * scaleVal)));
          const posX = Math.round(item.transform?.position_x || 0);
          const posY = Math.round(item.transform?.position_y || 0);
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
      const drawtextFilter = ProEditorService.compileTextLayerDrawtext(
        ti,
        canvasW,
        canvasH,
        project.canvas.aspect_ratio || '9:16'
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

    if (primaryAudioItem?.audio?.enhancement) {
      const enhanceFilters = AudioEnhancementService.compileFilterGraph(primaryAudioItem.audio.enhancement);
      audioFilters.push(...enhanceFilters);
    } else {
      const needsNormalize = project.tracks.some((t) =>
        t.items.some((i) => i.audio?.normalized)
      );
      if (needsNormalize) {
        audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
      }
    }

    // Dialogue audio volume & subtle fades
    audioFilters.push('afade=t=in:ss=0:d=0.15');
    const fadeOutStart = Math.max(0, project.canvas.duration - 0.25);
    audioFilters.push(`afade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.25`);

    filterComplex.push(`${audioStreamLabel}${audioFilters.join(',')}[dialogue_proc]`);
    const processedDialogueLabel = '[dialogue_proc]';

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
        `${streamsToMix.join('')}amix=inputs=${streamsToMix.length}:duration=first:dropout_transition=2:normalize=0,alimiter=limit=-1.0dB:attack=5:release=50[master_a]`
      );
      audioStreamLabel = '[master_a]';
    } else {
      filterComplex.push(`${streamsToMix[0]}alimiter=limit=-1.0dB:attack=5:release=50[master_a]`);
      audioStreamLabel = '[master_a]';
    }

    return {
      inputArgs,
      filterComplex,
      videoMap: videoStreamLabel,
      audioMap: audioStreamLabel,
      outputArgs,
      duration: project.canvas.duration,
    };
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
  public static compileTextLayerDrawtext(
    item: EditorTrackItem,
    canvasW: number,
    canvasH: number,
    aspectRatio: string = '9:16'
  ): string | null {
    if (!item.text || !item.text.text) return null;

    // Sanitize user text for FFmpeg drawtext (escape backslashes, percent signs, and colons)
    const rawText = item.text.text.replace(/[\r\n]+/g, ' ').slice(0, 100).trim();
    if (!rawText) return null;

    const safeText = rawText
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '')
      .replace(/:/g, '\\:')
      .replace(/%/g, '\\%');

    const font = this.validateFont(item.text.font_family);

    // Compute coordinate scale ratio between preview container and export canvas
    // Preview container reference: 9:16 is 360x640, 1:1 is 480x480, 16:9 is 640x360
    const previewH = aspectRatio === '9:16' ? 640 : aspectRatio === '1:1' ? 480 : 360;
    const previewW = aspectRatio === '9:16' ? 360 : aspectRatio === '1:1' ? 480 : 640;
    const scaleRatio = canvasH / previewH;

    const baseSize = item.text.font_size || 36;
    const itemScale = item.transform?.scale || 1.0;
    const scaledFontSize = Math.max(16, Math.round(baseSize * scaleRatio * itemScale));

    const fontColor = this.sanitizeHexColor(item.text.color, 'FFFFFF');
    const baseOpacity = item.transform?.opacity ?? 1.0;

    const posX = Math.round((item.transform?.position_x || 0) * (canvasW / previewW));
    const posY = Math.round((item.transform?.position_y || 0) * scaleRatio);

    const start = Math.max(0, item.timeline_start);
    const end = Math.max(start + 0.1, item.timeline_end);
    const itemDur = end - start;
    const animDur = Math.min(itemDur * 0.45, item.text.animation_duration || 0.45);
    const anim = item.text.animation || 'none';

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
      `text='${safeText}'`,
      `font='${font}'`,
      `fontsize='${sizeExpr}'`,
      `fontcolor=0x${fontColor}`,
      `alpha='${alphaExpr}'`,
      `x='${xExpr}'`,
      `y='${yExpr}'`,
    ];

    // Background box
    if (item.text.background_color) {
      const boxHex = this.sanitizeHexColor(item.text.background_color, '000000');
      const boxBorderW = Math.max(4, Math.round((item.text.background_padding || 8) * scaleRatio));
      filterParts.push(`box=1:boxcolor=0x${boxHex}@0.8:boxborderw=${boxBorderW}`);
    } else {
      filterParts.push('box=0');
    }

    // Stroke / outline
    if (item.text.stroke_width && item.text.stroke_width > 0) {
      const strokeW = Math.max(1, Math.round(item.text.stroke_width * scaleRatio));
      const strokeHex = this.sanitizeHexColor(item.text.stroke_color, '000000');
      filterParts.push(`borderw=${strokeW}:bordercolor=0x${strokeHex}`);
    }

    // Drop shadow
    if (item.text.shadow_blur && item.text.shadow_blur > 0) {
      const shadowOffset = Math.max(2, Math.round(3 * scaleRatio));
      const shadowHex = this.sanitizeHexColor(item.text.shadow_color, '000000');
      filterParts.push(`shadowx=${shadowOffset}:shadowy=${shadowOffset}:shadowcolor=0x${shadowHex}@0.75`);
    }

    filterParts.push(`enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'`);

    return `drawtext=${filterParts.join(':')}`;
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
        crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
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
      crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
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
