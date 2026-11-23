import {renderHookSourcePreview} from './hookSourcePreview.js';
import crypto from 'node:crypto';
import { dataRepository, ownerContext } from '../../db/repositories/dataRepository.js';
import { ProEditorService } from '../proEditorService.js';
import { logger } from '../../utils/logger.js';
import {
  AppError,
  EditorProject,
  EditorTrack,
  EditorTrackItem,
  HookCandidate,
  ClipRecord,
  SAFE_EDITOR_FONTS,
  SafeEditorFont,
} from '../../types/index.js';


export interface ApplyHookResult {
  updatedProject: EditorProject;
  previousProjectSnapshot: EditorProject;
  appliedOperations: string[];
}

export class HookEditorIntegration {
  /**
   * Non-destructively applies a HookCandidate to an EditorProject.
   * Creates reversible track/item operations (trim, reorder, text overlay, caption emphasis)
   * and preserves the previous project snapshot for immediate Undo/Redo.
   */
  public static async applyCandidateToProject(
    userId: string,
    editorProjectId: string,
    candidate: HookCandidate
  ): Promise<ApplyHookResult> {
    return await ownerContext.run(userId, async () => {
      const currentProject = await ProEditorService.getEditorProject(editorProjectId, userId);
      const previousSnapshot = JSON.parse(JSON.stringify(currentProject)) as EditorProject;
      const appliedOperations: string[] = [];

      // Clone tracks for non-destructive modification
      const updatedTracks: EditorTrack[] = JSON.parse(JSON.stringify(currentProject.tracks));

      // 1. EDITORIAL TRIM (trim silence/filler from the opening)
      if (candidate.delivery_mode === 'EDITORIAL_TRIM' || candidate.trim_plan) {
        const trimDuration = candidate.trim_plan
          ? candidate.trim_plan.trim_end - candidate.trim_plan.trim_start
          : 0.8;

        for (const track of updatedTracks) {
          if (track.type === 'VIDEO' || track.type === 'AUDIO') {
            const firstItem = track.items.find((i) => i.timeline_start <= 0.1);
            if (firstItem && (firstItem.timeline_end - firstItem.timeline_start) > trimDuration + 0.5) {
              const currentItemDuration = firstItem.timeline_end - firstItem.timeline_start;
              firstItem.source_start = Number((firstItem.source_start + trimDuration).toFixed(2));
              const newDuration = Number((currentItemDuration - trimDuration).toFixed(2));
              firstItem.timeline_end = Number((firstItem.timeline_start + newDuration).toFixed(2));
              appliedOperations.push(`Trimmed ${trimDuration.toFixed(1)}s opening silence/filler on ${track.type} track`);
            }
          }
        }
      }

      // 2. TEXT OVERLAY HOOK
      if (
        candidate.delivery_mode === 'TEXT_OVERLAY' ||
        candidate.delivery_mode === 'COMBINED' ||
        candidate.text_overlay_plan
      ) {
        const overlayText = candidate.text_overlay_plan?.text || candidate.text;
        const startTime = candidate.text_overlay_plan?.start_time ?? 0;
        const endTime = candidate.text_overlay_plan?.end_time ?? 3.0;

        let textTrack = updatedTracks.find((t) => t.type === 'TEXT');
        if (!textTrack) {
          textTrack = {
            id: crypto.randomUUID(),
            name: 'Hook Text Overlay',
            type: 'TEXT',
            items: [],
            locked: false,
            muted: false,
            hidden: false,
          };
          updatedTracks.push(textTrack);
        }

        const textItem: EditorTrackItem = {
          id: crypto.randomUUID(),
          track_id: textTrack.id,
          type: 'TEXT',
          timeline_start: startTime,
          timeline_end: endTime,
          source_start: 0,
          source_end: endTime - startTime,
          speed: { speed: 1.0, pitch_preserved: true },
          transform: {
            position_x: 0,
            position_y: candidate.text_overlay_plan?.position_y ?? 0.65,
            scale: 1.0,
            rotation: 0,
            opacity: 1.0,
          },
          keyframes: [],
          effects: [],
          locked: false,
          muted: false,
          hidden: false,
          z_index: 10,
          text: {
            text: overlayText,
            auto_headline: true,
            font_family: (candidate.text_overlay_plan?.font_family as SafeEditorFont) || 'Inter',
            font_size: candidate.text_overlay_plan?.font_size ?? 54,
            font_weight: 'bold',
            italic: false,
            alignment: 'center',
            color: candidate.text_overlay_plan?.color ?? '#FFFFFF',
            background_color: '#000000',
            stroke_color: '#000000',
            stroke_width: 3,
            letter_spacing: 0,
            line_height: 1.2,
          },
        };

        textTrack.items.push(textItem);
        appliedOperations.push(`Added hook text overlay "${overlayText.slice(0, 30)}..." (0s–${endTime}s)`);
      }

      // 3. CAPTION OPENING EMPHASIS
      if (candidate.delivery_mode === 'CAPTION_OPEN') {
        let captionUpdated = false;
        for (const track of updatedTracks) {
          if (track.type === 'CAPTION') {
            const firstCaption = track.items.find((i) => i.type === 'CAPTION' && i.timeline_start <= 1.5);
            if (firstCaption && firstCaption.caption) {
              if (firstCaption.caption.cues && firstCaption.caption.cues.length > 0) {
                firstCaption.caption.cues[0].text = candidate.text;
              }
              firstCaption.caption.highlight_color = '#FFD700'; // Gold emphasis
              captionUpdated = true;
              appliedOperations.push(`Emphasized opening caption with hook text`);
              break;
            }
          }
        }
        if (!captionUpdated) {
          appliedOperations.push('Caption track not present; hook preserved for export');
        }
      }

      // 4. REORDER EXISTING LINE TO FRONT
      if (candidate.delivery_mode === 'REORDER_EXISTING' && candidate.reorder_plan) {
        const { source_start, source_end, source_text } = candidate.reorder_plan;
        const reorderDuration = Number((source_end - source_start).toFixed(2));

        for (const track of updatedTracks) {
          if (track.type === 'VIDEO' || track.type === 'AUDIO') {
            const existingFirst = track.items[0];
            if (existingFirst) {
              // Shift existing items by reorderDuration
              for (const it of track.items) {
                it.timeline_start = Number((it.timeline_start + reorderDuration).toFixed(2));
                it.timeline_end = Number((it.timeline_end + reorderDuration).toFixed(2));
              }

              // Insert the front-loaded hook item at timeline 0
              const frontHookItem: EditorTrackItem = {
                ...JSON.parse(JSON.stringify(existingFirst)),
                id: crypto.randomUUID(),
                source_start,
                source_end,
                timeline_start: 0,
                timeline_end: reorderDuration,
              };

              track.items.unshift(frontHookItem);
            }
          }
        }
        appliedOperations.push(`Moved source segment (${source_start}s–${source_end}s: "${source_text.slice(0, 25)}...") to opening`);
      }

      // Update editor project in DB
      const updatedProject = await ProEditorService.updateEditorProject(editorProjectId, userId, {
        tracks: updatedTracks,
        version: currentProject.version,
      },{clipSyncRequired:false});

      logger.info('Applied HookCandidate to EditorProject', {
        editorProjectId,
        candidateId: candidate.id,
        operations: appliedOperations,
      });

      return {
        updatedProject,
        previousProjectSnapshot: previousSnapshot,
        appliedOperations,
      };
    });
  }

  /**
   * Reverts an applied hook operation by restoring the previous EditorProject snapshot.
   */
  public static async revertCandidateInEditor(
    userId: string,
    editorProjectId: string,
    snapshot: EditorProject
  ): Promise<EditorProject> {
    return await ownerContext.run(userId, async () => {
      const restored = await ProEditorService.updateEditorProject(editorProjectId, userId, {
        tracks: snapshot.tracks,
        canvas: snapshot.canvas,
        settings: snapshot.settings,
        title: snapshot.title,
        version: snapshot.version + 1,
      },{clipSyncRequired:false});

      logger.info('Reverted HookCandidate in EditorProject', { editorProjectId });
      return restored;
    });
  }

  /** Read-only source excerpt. Saved Studio changes are not part of this preview. */
  public static async renderHookPreview(userId:string,clipId:string,candidate:HookCandidate):Promise<{previewUrl:string;duration:number;verified:boolean}>{
    return renderHookSourcePreview(userId,clipId,candidate);
  }
}
