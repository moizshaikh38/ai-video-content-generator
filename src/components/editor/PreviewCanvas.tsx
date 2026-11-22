import {bareSmartSplitReviewForItem,type BareSmartSplitReview} from '../../../server/src/shared/automaticSplitEvidence';
import{suppressStaleCaptionEmojis}from'../../../server/src/shared/sparseCaptionEmojiProject';
import {automaticFitFocusY} from '../../../server/src/shared/automaticFitGeometry';
import {needsAutomaticFitFallback} from '../../../server/src/shared/automaticPreviewFallback';
import {previewBackdropBlurPx,PREVIEW_BACKDROP_COLOR_MATRIX} from '../../../server/src/shared/blurBackdropPreview';
import {mirrorDecodedFrames} from '../../lib/decodedFrameMirror';
import {trackerHandoffSpec,trackerHandoffRect} from '../../../server/src/shared/trackerHandoff';
import {presentFit43} from '../../../server/src/shared/automaticLayoutPolicy';
import {resolveSceneLayoutItem} from '../../../server/src/shared/sceneLayoutOverrides';
import {freezeAutomaticPlan,freezeAutomaticKeyframes} from '../../../server/src/shared/automaticFraming';
import { framingWindowRect, validateFramingWindow } from '../../../server/src/shared/framingWindow';
import { SceneLayoutMenu } from './SceneLayoutMenu';
import { readItemLayout, type SceneLayout } from '../../lib/itemLayout';
import { nonPortraitAutoFullSourceFit } from '../../../server/src/shared/nonPortraitAutoFit';
import { applySceneCaptionPlacement,captionPersistedPanelWindows,captionCompositionWindows,finalizeAutomaticFitCaptionGrowth } from '../../../server/src/shared/sceneCaptionPlacement';
import {effectiveContentLayout, type ContentFramingDecision} from '../../../server/src/shared/contentFramingDecision';
import React, { useRef, useState, useEffect, useMemo } from 'react';
import {
  Layers,
  RotateCw,
  Trash2,
  RectangleHorizontal,
  Maximize2,
  Shield,
} from 'lucide-react';
import {
  EditorProject,
  EditorTrackItem,
  EditorKeyframe,
  TimedCaptionCue,
  ClipAspectRatio,
} from '../../types';
import { UpdateProjectOptions } from '../../hooks/useEditorProject';
import {
  getPreviewFrame,
  regroupCuesForPreset,
  resolveEditorCaptionStyle,
  resolveCaptionPreset,
  isRenderablePresetId,
  getEditorCaptionPresetId,
} from '../../lib/captionPresets';
import { computeCanvasFitScale } from '../../lib/canvasFit';
import { interpolateReframeCenter } from '../../../server/src/shared/reframeInterpolation';
import { CaptionPresetRenderer } from './CaptionPresetRenderer';
import { BackgroundControl } from './BackgroundControl';
import { TrackerControl } from './TrackerControl';
import { CropBoxControl } from './CropBoxControl';
import { PanelsPreview } from './PanelsPreview';
import { normalizePanels, panelSourceWindow, panelTargetRects, panelPixelRects,  PANEL_LABELS } from '../../../server/src/shared/panelLayouts';
import { FIT_BAND_ASPECT, effectiveFitBand, fitBandApplies } from '../../../server/src/shared/fitBand';

interface PreviewCanvasProps {
  geometryOutputSize?:{width:number;height:number};
  contentFramingDecision?: ContentFramingDecision | null;
  project: EditorProject;
  playhead: number;
  isPlaying?: boolean;
  sourceOffset?: number;
  cleanSourceUrl: string | null;
  renderedPreviewUrl: string | null;
  viewMode: 'edit' | 'export_review';
  onPlayheadChange?: (time: number) => void;
  onTogglePlay: () => void;
  selectedItemId: string | null;
  onSelectItem: (itemId: string | null) => void;
  onDeleteItem?: (itemId: string) => void;
  onTurnOffHook?: (itemId: string) => void;
  onTurnOffCaptions?: () => void;
  onUpdateItemTransform: (itemId: string, transform: any, options?: UpdateProjectOptions) => void;
  // Preview-first crop override: dragging the base video pans the per-item crop
  // focus (EditorTrackItem.crop.focusX/focusY), which the render compiler honors
  // ahead of the auto face track.
  onBeginCrop?: () => void;
  onUpdateItemCrop?: (
    itemId: string,
    crop: { mode: 'fit' | 'fill' | 'blur' | 'custom'; focusX: number; focusY: number; scale?: number },
    options?: UpdateProjectOptions
  ) => void;
  /** Multi-panel scene: update one scene's per-panel crops. */
  onUpdateItemPanels?: (itemId: string, panels: NonNullable<EditorTrackItem['panels']>, options?: UpdateProjectOptions, sourceRange?: {start:number;end:number}) => void;
  onCommitProject?: (preOperationProject: EditorProject) => void;
  showSafeGuides: boolean;
  onToggleSafeGuides?: () => void;
  onChangeAspectRatio?: (aspectRatio: ClipAspectRatio) => void;
  onUpdateCropMode?: (mode: 'center' | 'fit' | 'blur' | 'smart') => void;
  /** Set ONE scene's layout (all Opus layouts). When provided the toolbar Layout button opens the full picker. */
  onPickSceneLayout?: (itemId: string, layout: SceneLayout) => void;
  onPickWholeClipLayout?:(layout:SceneLayout)=>void;
  onUpdateCanvas?: (patch: Partial<EditorProject['canvas']>) => void;
  clipId?: string;
  onSetTracker?: (target: { itemId: string | null }, tracker: import('../../types').EditorSubjectTracker | null) => void;
  /**
   * Smart-reframe track for the base video (clip-level, mode 'smart'). When
   * present and the item carries no manual crop override, the base video pans
   * by these keyframes, mirroring the export's buildSmartCropFilter window.
   * Keyframe times are clip-relative; clipStartSec rebases the preview's
   * source time into that frame.
   */
  smartReframe?: {
    keyframes: Array<{ time: number; centerX: number; centerY?: number }>;
    clipStartSec?: number;
  } | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  cues: TimedCaptionCue[];
  /**
   * Split-layout caption zones (mirrors the export's speakerSplit path):
   * reframe keyframes + speaker anchors. Cues attributed to the top-half
   * speaker render in the top-half band (position_y 0.4), exactly like the
   * exported ASS. Null/absent = captions render at the default band.
   */
  speakerSplit?: {
    keyframes: Array<{ time: number; centerX: number }>;
    speaker1X?: number | null;
    speaker2X?: number | null;
    /** Server-computed split framing geometry (mirrors the export's zoom and
     * per-speaker x/y anchors). Null = legacy anchor-only split preview. */
    splitGeometry?: {
      speaker1: { x: number; y: number; windowW: number };
      speaker2: { x: number; y: number; windowW: number };
    } | null;
  } | null;
  /** Free-plan exports burn a VireoClip badge; preview mirrors it (animated
   * like the export) while showing the clean source. Rendered previews
   * already carry the burned badge, so the overlay hides there. */
  watermarkRequired?: boolean;
  /** Server-computed group framing for multi-person single-view (same helper
   * the export's buildGroupFitFilter uses): blur backdrop + the group window
   * fitted to canvas width at 42% height. Null = tight tracking preview. */
    shotComposition?: Array<{start:number;end:number;kind:'group'|'solo'|'fit';split?:{speaker1X:number;speaker2X:number;dividerX:number;focusPanels?:import('../../../server/src/shared/panelLayouts').ItemPanels};contextStatus?:string;uncertainty?:string;presentationProtection?:import('../../../server/src/shared/automaticLayoutPolicy').PresentationProtection;windowW:number;windowH:number;keyframes:Array<{time:number;centerX:number;centerY:number}>}> | null;
  bareSmartSplitReview?: BareSmartSplitReview | null;
  compositionClipStart?: number;
  autoCandidateEnabled?:boolean;
  autoCandidateMixed?:boolean;
  onSetAutoCandidate?:(enabled:boolean)=>void;
  onSetAutomaticFraming?: (itemId:string|null,enabled:boolean,sourceTime:number)=>void;
  groupReframe?: {
    keyframes: Array<{ time: number; centerX: number; centerY: number }>;
    windowW: number;
    /** Export-mirrored composition window height (fraction of source height). */
    windowH?: number;
    sourceWidth: number;
    sourceHeight: number;
  } | null;
  /** Server-side tracking floor: weak dominant track exports as blur, preview mirrors it. */
  automaticPlanReviewRequired?:boolean;
  lowConfidenceTrack?: boolean;
  onUpdateCaptionPosition?: (
    pos: { x?: number; y?: number; cueId?: string; resetCuePosition?: boolean; fontSize?: number } | number,
    options?: UpdateProjectOptions
  ) => void;
}

// Keyframe easing evaluation helper
function evaluateEasing(t: number, easing: string): number {
  switch (easing) {
    case 'ease-in':
      return t * t;
    case 'ease-out':
      return t * (2 - t);
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    case 'linear':
    default:
      return t;
  }
}

// Calculate interpolated value from keyframes
function interpolateKeyframes(
  keyframes: EditorKeyframe[] | undefined,
  property: string,
  itemRelativeTime: number,
  defaultValue: number
): number {
  if (!keyframes || keyframes.length === 0) return defaultValue;
  const propertyKeyframes = keyframes
    .filter((k) => k.property === property)
    .sort((a, b) => a.time - b.time);

  if (propertyKeyframes.length === 0) return defaultValue;
  if (propertyKeyframes.length === 1 || itemRelativeTime <= propertyKeyframes[0].time) {
    return propertyKeyframes[0].value;
  }
  const lastKf = propertyKeyframes[propertyKeyframes.length - 1];
  if (itemRelativeTime >= lastKf.time) {
    return lastKf.value;
  }

  for (let i = 0; i < propertyKeyframes.length - 1; i++) {
    const kf0 = propertyKeyframes[i];
    const kf1 = propertyKeyframes[i + 1];
    if (itemRelativeTime >= kf0.time && itemRelativeTime <= kf1.time) {
      const dt = kf1.time - kf0.time;
      if (dt <= 0) return kf0.value;
      const progress = (itemRelativeTime - kf0.time) / dt;
      const factor = evaluateEasing(progress, kf1.easing);
      return kf0.value + (kf1.value - kf0.value) * factor;
    }
  }

  return defaultValue;
}


/** CSS approximation of the item's colour adjustments + grade preset, mirroring
 * the export renderer's ffmpeg eq/colorbalance/curves mapping so preview and
 * export agree. Applied to the base video stream. */
function cssColorFilters(item?: EditorTrackItem | null): string | undefined {
  if (!item) return undefined;
  const f: string[] = [];
  const c = item.color;
  if (c) {
    if (c.brightness) f.push(`brightness(${1 + c.brightness})`);
    if (c.exposure) f.push(`brightness(${1 + c.exposure * 0.8})`);
    if (c.contrast) f.push(`contrast(${1 + c.contrast})`);
    if (c.saturation) f.push(`saturate(${1 + c.saturation})`);
  }
  const p = item.filter?.preset;
  if (p && p !== 'none') {
    switch (p) {
      case 'warm': f.push('sepia(0.25) saturate(1.2)'); break;
      case 'cool': f.push('hue-rotate(180deg) saturate(0.9)'); break;
      case 'film': f.push('contrast(1.15) saturate(0.85) brightness(0.95)'); break;
      case 'mono': f.push('grayscale(1) contrast(1.2)'); break;
      case 'punch': f.push('contrast(1.3) saturate(1.4)'); break;
      case 'soft': f.push('contrast(0.9) brightness(1.05)'); break;
      case 'clean': f.push('contrast(1.05) saturate(1.08)'); break;
      case 'creator': f.push('contrast(1.15) saturate(1.3) sepia(0.08)'); break;
    }
  }
  return f.length ? f.join(' ') : undefined;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  geometryOutputSize,
  project,
  playhead,
  isPlaying,
  sourceOffset = 0,
  cleanSourceUrl,
  renderedPreviewUrl,
  viewMode,
  onPlayheadChange: _onPlayheadChange,
  onTogglePlay,
  selectedItemId,
  onSelectItem,
  onDeleteItem,
  onTurnOffHook,
  onTurnOffCaptions,
  onUpdateItemTransform,
  onUpdateItemCrop,
  onBeginCrop,
  onUpdateItemPanels,
  onCommitProject,
  showSafeGuides,
  onToggleSafeGuides,
  onChangeAspectRatio,
  onUpdateCropMode,
  onPickSceneLayout,
  onPickWholeClipLayout,
  onUpdateCanvas,
  clipId,
  onSetTracker,
  smartReframe,
  videoRef,
  cues: rawCues,
  speakerSplit,
  watermarkRequired = false,
  groupReframe = null,
  contentFramingDecision = null,
  shotComposition: incomingShotComposition = null,
  bareSmartSplitReview = null,
  compositionClipStart = 0,
  onSetAutomaticFraming,
  autoCandidateEnabled,
  autoCandidateMixed,
  onSetAutoCandidate,
  lowConfidenceTrack = false,
  automaticPlanReviewRequired = false,
  onUpdateCaptionPosition,
}) => {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  // Responsive stage: measure the available viewport so the canvas scales to fill it.
  const stageViewportRef = useRef<HTMLDivElement>(null);
  const [availSize, setAvailSize] = useState<{ w: number; h: number } | null>(null);
  // Current render scale, read synchronously inside pointer handlers (move drag is in base px).
  const fitScaleRef = useRef(1);

  // Synchronous ref to project for reliable drag commit calculations
  const projectRef = useRef(project);
  useEffect(() => {
    projectRef.current = project;
  }, [project]);
  const playheadRef = useRef(playhead);
  useEffect(() => { playheadRef.current = playhead; }, [playhead]);

  // Track the stage viewport's available size so the canvas can scale to fill it responsively.
  useEffect(() => {
    const el = stageViewportRef.current;
    if (!el) return;
    const update = () => setAvailSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Snapshot before direct manipulation drag starts
  const preTransformProjectRef = useRef<EditorProject | null>(null);

  // Transform manipulation drag state
  const [isTransformDragging, setIsTransformDragging] = useState<boolean>(false);
  const [transformDragMode, setTransformDragMode] = useState<'move' | 'scale' | 'rotate' | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{ x: number; y: number } | null>(null);
  const [initialTransform, setInitialTransform] = useState<{
    position_x: number;
    position_y: number;
    scale: number;
    rotation: number;
  } | null>(null);

  // Crop-pan drag state (drag the base video to set per-item crop focus)
  const [cropDrag, setCropDrag] = useState<{
    itemId: string;
    startX: number;
    startY: number;
    startFocusX: number;
    startFocusY: number;
    moved: boolean;
  } | null>(null);
  const preCropProjectRef = useRef<EditorProject | null>(null);
  const suppressClickAfterCropDragRef = useRef<boolean>(false);
  const suppressClickAfterCaptionTapRef = useRef<boolean>(false);
  const isCoarsePointer = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

  useEffect(() => {
    const clearSuppress = () => { suppressClickAfterCaptionTapRef.current = false; };
    window.addEventListener('pointerdown', clearSuppress, true);
    return () => window.removeEventListener('pointerdown', clearSuppress, true);
  }, []);
  // Wheel zoom: transient crop.scale changes while scrolling, one history
  // entry committed after the wheel goes idle.
  const cropZoomCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Native wheel listener: React's root wheel listeners are passive, so they
  // cannot preventDefault the page scroll that would otherwise steal the
  // gesture mid-zoom.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !onUpdateItemCrop) return;
    const handleWheel = (e: WheelEvent) => {
      if (viewMode !== 'edit') return;
      e.preventDefault();
      const proj = projectRef.current;
      // Zoom the scene under the playhead (per-scene crop), not always the first clip.
      const vItems = proj?.tracks.find((t) => t.type === 'VIDEO')?.items ?? [];
      const ph = playheadRef.current;
      const item = vItems.find((i) => !i.hidden && ph >= i.timeline_start && ph < i.timeline_end) ?? vItems[0];
      if (!proj || !item || item.locked || proj.tracks.some(t => t.locked && t.items.some(i => i.id===item.id))) return;
      if (!preCropProjectRef.current) {
        preCropProjectRef.current = JSON.parse(JSON.stringify(proj));
      }
      const cur = item.crop?.scale ?? 1;
      const next = Math.min(4, Math.max(1, Number((cur * (e.deltaY < 0 ? 1.1 : 1 / 1.1)).toFixed(3))));
      onUpdateItemCrop(
        item.id,
        { mode: item.crop?.mode ?? ((item as any).crop_mode === 'fit' ? 'fit' : 'custom'), focusX: item.crop?.focusX ?? 0.5, focusY: item.crop?.focusY ?? 0.5, scale: next },
        { recordHistory: false, markAsDirty: false }
      );
      if (cropZoomCommitTimer.current) clearTimeout(cropZoomCommitTimer.current);
      cropZoomCommitTimer.current = setTimeout(() => {
        if (preCropProjectRef.current && onCommitProject) {
          const changed = JSON.stringify(preCropProjectRef.current.tracks) !== JSON.stringify(projectRef.current.tracks);
          if (changed) onCommitProject(preCropProjectRef.current);
        }
        preCropProjectRef.current = null;
        cropZoomCommitTimer.current = null;
      }, 600);
    };
    v.addEventListener('wheel', handleWheel, { passive: false });
    return () => v.removeEventListener('wheel', handleWheel);
  }, [viewMode, onUpdateItemCrop, onCommitProject, videoRef]);

  // Caption 2D dragging state
  const [isDraggingCaption, setIsDraggingCaption] = useState<boolean>(false);
  const [captionScope, setCaptionScope] = useState<'all' | 'cue'>('all');
  const [captionGrabOffset, setCaptionGrabOffset] = useState<{ x: number; y: number } | null>(null);
  const [initialCaptionCoords, setInitialCaptionCoords] = useState<{ x: number; y: number } | null>(null);
  const [activeSnapGuides, setActiveSnapGuides] = useState<{
    x?: number;
    y?: number;
    label?: string;
    isDanger?: boolean;
  } | null>(null);
  const [isInDangerZone, setIsInDangerZone] = useState<boolean>(false);
  const [_isScalingFontSize, setIsScalingFontSize] = useState<boolean>(false);
  const [fontSizeHud, setFontSizeHud] = useState<number | null>(null);

  // Choose active video source based on viewMode:
  // In 'edit' mode, we use cleanSourceUrl so captions are NOT burned into the underlying stream!
  // In 'export_review' mode, we use renderedPreviewUrl so the user can verify final export!
  const activeVideoSrc =
    viewMode === 'export_review'
      ? renderedPreviewUrl || cleanSourceUrl
      : cleanSourceUrl || renderedPreviewUrl;

  // Aspect ratio styling
  const getAspectRatioDimensions = () => {
    switch (project.canvas.aspect_ratio) {
      case '9:16':
        return { width: '360px', height: '640px', ratio: '9/16' };
      case '1:1':
        return { width: '480px', height: '480px', ratio: '1/1' };
      case '4:5':
        return { width: '384px', height: '480px', ratio: '4/5' };
      case '16:9':
      default:
        return { width: '640px', height: '360px', ratio: '16/9' };
    }
  };

  // Find active items at current playhead
  const activeVideoItems: EditorTrackItem[] = [];
  const activeTextItems: EditorTrackItem[] = [];
  const activeOverlayItems: EditorTrackItem[] = [];
  const activeCaptionTrack = project.tracks.find((t) => t.type === 'CAPTION' && !t.hidden);
  const captionItem = activeCaptionTrack?.items[0];

  const isCaptionSelected = Boolean(
    captionItem && (selectedItemId === captionItem.id || selectedItemId === 'caption')
  );

  const currentCaptionCoords = useMemo(() => {
    let x = 0.5;
    // Anchor matches the exported ASS semantics: an explicit position_y is the block's
    // bottom edge (\an2 + marginV / \pos); the unset default mirrors captionService's
    // posConfig margins (bottom: 180/60, middle: centered, top: 220/80 on playRes 1920/1080).
    let y = 0.667;
    let anchorY: 'bottom' | 'center' | 'top' = 'bottom';
    const capPos = captionItem?.caption?.position || 'bottom';
    const isPortrait = project.canvas.aspect_ratio !== '16:9';
    const playResY = isPortrait ? 1920 : 1080;
    if (captionItem?.caption?.position_x !== undefined) {
      x = captionItem.caption.position_x;
    } else if (captionItem?.transform?.position_x !== undefined) {
      // Track transforms are pixel offsets from the canvas center (0 = centered) on a 1080x1920 canvas.
      x = 0.5 + captionItem.transform.position_x / 1080;
    }
    if (captionItem?.caption?.position_y !== undefined) {
      y = captionItem.caption.position_y;
    } else if (captionItem?.transform?.position_y !== undefined) {
      y = 0.5 + captionItem.transform.position_y / 1920;
    } else if (capPos === 'center') {
      y = 0.5;
      anchorY = 'center';
    } else if (capPos === 'top') {
      y = (isPortrait ? 220 : 80) / playResY;
      anchorY = 'top';
    } else {
      y = 1 - (isPortrait ? 180 : 60) / playResY;
    }
    return {
      x: Math.max(0.05, Math.min(0.95, x)),
      y: Math.max(0.05, Math.min(0.95, y)),
      anchorY,
    };
  }, [captionItem, project.canvas.aspect_ratio]);

  for (const track of suppressStaleCaptionEmojis(project).tracks) {
    if (track.hidden) continue;
    for (const item of track.items) {
      if (item.hidden) continue;
      if (playhead >= item.timeline_start && (playhead < item.timeline_end || (playhead === project.canvas.duration && playhead === item.timeline_end))) {
        if (track.type === 'VIDEO') activeVideoItems.push(resolveSceneLayoutItem(item,item.source_start+(playhead-item.timeline_start)*(item.speed?.speed||1)));
        else if (track.type === 'TEXT') activeTextItems.push(item);
        else if (track.type === 'IMAGE' || track.type === 'OVERLAY') activeOverlayItems.push(item);
      }
    }
  }
  // Layout/crop/band/split state is PER SCENE: read the item under the playhead (the export compiles per item),
  // falling back to the first video item only when the playhead is outside every item.
  const layoutBtnRef = React.useRef<HTMLButtonElement>(null);
  const [layoutAnchor, setLayoutAnchor] = React.useState<DOMRect | null>(null);
  const [mobileFramingToolsOpen, setMobileFramingToolsOpen] = useState(false);
  const baseVideoItem: EditorTrackItem | undefined = activeVideoItems[0] ?? project.tracks.find((t) => t.type === 'VIDEO')?.items[0];
  // Resolve the current local scene, not a saved-project map. Pending manual
  // choices take priority immediately; the source-bound plan keeps its clock.
  const shotComposition: PreviewCanvasProps['shotComposition'] = bareSmartSplitReviewForItem(baseVideoItem,bareSmartSplitReview,compositionClipStart) ?? incomingShotComposition;
  // The rendered export preview already contains the panels; only compose them live from the clean source.
  const videoCropLocked = Boolean(baseVideoItem?.locked || project.tracks.some(t => t.locked && t.items.some(i => i.id === baseVideoItem?.id)));
  const manualPanels = viewMode === 'export_review' && renderedPreviewUrl ? null : normalizePanels((baseVideoItem as any)?.panels);

  const backdropColorFilterId = 'vireo-backdrop-'+React.useId().replace(/:/g,'');
  const backdropVideoRef = useRef<HTMLCanvasElement | null>(null);
  const splitBottomRef = useRef<HTMLCanvasElement | null>(null);
  const [videoDims, setVideoDims] = useState<{ w: number; h: number } | null>(null);

  const primaryVideoCropMode = useMemo(() => {
    const item = baseVideoItem;
    // Match the export compiler: item.crop.mode wins; legacy crop_mode only
    // applies when no explicit crop exists. 'fit' letterboxes, 'blur' is a
    // blurred-pad letterbox, everything else covers.
    if (item?.crop?.mode) return item.crop.mode === 'fit' ? 'fit' : item.crop.mode === 'blur' ? 'blur' : 'fill';
    if((item as any)?.crop_config?.layout_mode_source==='auto'&&!shotComposition?.length&&!smartReframe?.keyframes?.length&&!groupReframe?.keyframes?.length)return 'fill';
    return (item as any)?.crop_mode === 'fit' ? 'fit' : 'fill';
  }, [baseVideoItem,shotComposition,smartReframe,groupReframe]);

  const missingAutomaticCamera=needsAutomaticFitFallback((baseVideoItem as any)?.crop_config?.layout_mode_source==='auto',shotComposition,smartReframe?.keyframes,groupReframe?.keyframes);
  const rawPlan=automaticPlanReviewRequired?[{start:0,end:Math.max(project.canvas.duration||1,(baseVideoItem?.source_end||0)-compositionClipStart,1),kind:'fit' as const,windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}],contextStatus:'unresolved-review-required',uncertainty:'Source or scene configuration needs review.'}]:shotComposition?.length?shotComposition:(missingAutomaticCamera&&videoDims?[{start:0,end:Math.max(project.canvas.duration||1,1),kind:'fit' as const,windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]}]:[]);
  const effectiveShotComposition = freezeAutomaticPlan(automaticPlanReviewRequired?rawPlan:presentFit43(rawPlan,videoDims?.w||1920,videoDims?.h||1080),baseVideoItem?.automatic_framing,compositionClipStart);
  const shotSourceTime = (baseVideoItem?.source_start || 0) + (playhead-(baseVideoItem?.timeline_start||0)) * (baseVideoItem?.speed?.speed||1);
  const shotRelativeTime = Math.max(0,shotSourceTime-compositionClipStart);
  const activePlanShot = !baseVideoItem?.crop && !(baseVideoItem as any)?.tracker?.enabled && !baseVideoItem?.framing_window && !manualPanels && (baseVideoItem as any)?.crop_config?.layout_mode_source !== 'user'
    ? effectiveShotComposition.find(s=>shotRelativeTime>=s.start&&shotRelativeTime<s.end&&(!(s as any).requiredAspect||(s as any).requiredAspect===project.canvas.aspect_ratio)) : undefined;
  const automaticMultiPanels: NonNullable<EditorTrackItem['panels']> | null = activePlanShot?.split?.focusPanels && ['three','four','gameplay'].includes(activePlanShot.split.focusPanels.layout) ? activePlanShot.split.focusPanels : null;
  const activePanels = manualPanels || (viewMode === 'export_review' && renderedPreviewUrl ? null : automaticMultiPanels);
  // Applying a displayed Auto Gameplay crop is an explicit manual choice.
  // Keep its source-shot scope; opening/canceling does not adopt anything.
  const automaticPanelEditRange = !manualPanels && activePanels?.layout==='gameplay' && activePlanShot && activePanels.slots.every(s=>s.set&&s.sourceRect) && Number.isFinite(activePlanShot.start) && Number.isFinite(activePlanShot.end)
    ? {start:compositionClipStart+activePlanShot.start,end:compositionClipStart+activePlanShot.end} : undefined;
  // Framing layout pick (Framing panel): 'split' renders a two-speaker
  // top/bottom stack mirroring the export's buildSplitPodcastFilter.
  const primaryLayoutMode = useMemo(() => {
    if(automaticPlanReviewRequired)return 'track';
    return activePlanShot?.split && !(viewMode === 'export_review' && renderedPreviewUrl) ? 'split' : effectiveContentLayout(baseVideoItem,contentFramingDecision);
  }, [baseVideoItem,contentFramingDecision,activePlanShot,viewMode,renderedPreviewUrl,automaticPlanReviewRequired]);

  const splitAnchors = useMemo(() => {
    const splitCfg = activePlanShot?.split || (baseVideoItem as any)?.crop_config?.split;
    return {
      speaker1X: Number(splitCfg?.speaker1X) || 0.25,
      speaker2X: Number(splitCfg?.speaker2X) || 0.75,
    };
  }, [baseVideoItem,activePlanShot]);

  // CSS object-position x matching the export's speaker-centered crop window:
  // export crops x = in_w*spkX - out_w/2 (clamped); CSS p% places the window at
  // (in_w-out_w)*p, so p = (spkX*in_w - out_w/2)/(in_w-out_w) under cover fit.
  const splitObjectPositionX = (spkX: number): string => {
    if (!videoDims || videoDims.w <= 0 || videoDims.h <= 0) return `${(spkX * 100).toFixed(2)}%`;
    const dims = getAspectRatioDimensions();
    const boxW = parseFloat(dims.width) || 360;
    const boxH = (parseFloat(dims.height) || 640) / 2;
    const coverScale = Math.max(boxW / videoDims.w, boxH / videoDims.h);
    const inW = videoDims.w * coverScale;
    if (inW <= boxW) return '50%';
    const p = Math.min(1, Math.max(0, (spkX * inW - boxW / 2) / (inW - boxW)));
    return `${(p * 100).toFixed(2)}%`;
  };

  // Per-panel view when the server supplied split framing geometry: mirrors
  // the export's zoom (scale height = srcH * 1080 / (windowW * srcW), min the
  // panel height) and anchors the panel on the speaker's measured x/y instead
  // of legacy X-only anchoring at vertical center. The object-position keeps
  // the anchor at panel center, so scaling about 50% 50% tracks the export's
  // clamped crop window around the same point.
  const splitGeometryView = (
    geometry: { x: number; y: number; windowW: number } | undefined,
    panel = 0,
  ): { left: string; top: string; width: string; height: string; panelH: number; clipPath?: string } | null => {
    if (!videoDims || videoDims.w <= 0 || videoDims.h <= 0) return null;
    const item = baseVideoItem;
    const cfg = activePlanShot?.split ? {...activePlanShot.split,fit:'contain'} : (item as any)?.crop_config?.split;
    const focus=activePlanShot?.split?.focusPanels;
    if(focus){
      const dims=getAspectRatioDimensions(),boxW=parseFloat(dims.width)||360,boxH=(parseFloat(dims.height)||640)/2;
      const r=panelSourceWindow(focus.slots[panel],videoDims.w,videoDims.h,boxW/boxH);
      const z=boxW/r.w,elW=videoDims.w*z,elH=videoDims.h*z;
      return {left:`${-r.x*z}px`,top:`${-r.y*z}px`,width:`${elW}px`,height:`${elH}px`,panelH:boxH,
        clipPath:`inset(${r.y/videoDims.h*100}% ${(videoDims.w-r.x-r.w)/videoDims.w*100}% ${(videoDims.h-r.y-r.h)/videoDims.h*100}% ${r.x/videoDims.w*100}%)`};
    }
    if (cfg?.fit === 'contain') {
      const dims = getAspectRatioDimensions();
      const boxW = parseFloat(dims.width) || 360;
      const boxH = (parseFloat(dims.height) || 640) / 2;
      const divider = Math.min(0.95, Math.max(0.05, Number(cfg.dividerX) || (splitAnchors.speaker1X + splitAnchors.speaker2X) / 2));
      const anchor = panel === 0 ? splitAnchors.speaker1X : splitAnchors.speaker2X;
      const start = anchor < divider ? 0 : divider;
      const end = anchor < divider ? divider : 1;
      const z = Math.min(boxW / ((end - start) * videoDims.w), boxH / videoDims.h);
      const elW = videoDims.w * z, elH = videoDims.h * z;
      return { left: `${((boxW - (end - start) * elW) / 2 - start * elW).toFixed(2)}px`,
        top: `${((boxH - elH) / 2).toFixed(2)}px`, width: `${elW.toFixed(2)}px`, height: `${elH.toFixed(2)}px`, panelH: boxH,
        clipPath: `inset(0 ${(1-end)*100}% 0 ${start*100}%)` };
    }
    if (!geometry) return null;
    const dims = getAspectRatioDimensions();
    const boxW = parseFloat(dims.width) || 360;
    const boxH = (parseFloat(dims.height) || 640) / 2;
    const clampW = Math.min(0.95, Math.max(0.05, geometry.windowW));
    // Exact mirror of buildSplitPodcastFilter: scale so the window fills the
    // panel (height bound by the panel), then crop a panel-sized window whose
    // center is the speaker anchor, edge-clamped like ffmpeg's crop x/y.
    const z = Math.max(boxH, (videoDims.h * boxW) / (clampW * videoDims.w)) / videoDims.h;
    const elW = videoDims.w * z;
    const elH = videoDims.h * z;
    const winL = Math.min(Math.max(geometry.x * elW - boxW / 2, 0), Math.max(0, elW - boxW));
    const winT = Math.min(Math.max(geometry.y * elH - boxH / 2, 0), Math.max(0, elH - boxH));
    return {
      left: `${(-winL).toFixed(1)}px`,
      top: `${(-winT).toFixed(1)}px`,
      width: `${elW.toFixed(1)}px`,
      height: `${elH.toFixed(1)}px`,
      panelH: boxH,
    };
  };
  const splitView1 = splitGeometryView(speakerSplit?.splitGeometry?.speaker1);
  const splitView2 = splitGeometryView(speakerSplit?.splitGeometry?.speaker2, 1);

  // Source dimensions come from the active media element. Layout windows are
  // the edited VIDEO timeline, shared with export, never the original source clock.
  const placementStyle = resolveEditorCaptionStyle(captionItem?.caption, project.canvas.aspect_ratio, captionItem?.transform);
  const cues = useMemo(() => applySceneCaptionPlacement(rawCues, {
    project, sourceWidth: videoDims?.w, sourceHeight: videoDims?.h,
    fallbackLayout: primaryLayoutMode,
    automaticWindows:[...captionPersistedPanelWindows(project,videoDims?.w||0,videoDims?.h||0,geometryOutputSize),...captionCompositionWindows(project,nonPortraitAutoFullSourceFit(effectiveShotComposition,project.canvas.aspect_ratio)?effectiveShotComposition:(shotComposition||[]),compositionClipStart,videoDims?.w||0,videoDims?.h||0,geometryOutputSize)],
    fontSize: placementStyle?.fontSize ?? captionItem?.caption?.font_size,
    maxCharsPerLine: placementStyle?.maxCharsPerLine,
    maxLines: placementStyle?.maxLines ?? captionItem?.caption?.max_lines,
  }), [rawCues, project, videoDims, geometryOutputSize, primaryLayoutMode, shotComposition, effectiveShotComposition, compositionClipStart, captionItem, placementStyle?.fontSize, placementStyle?.maxLines, placementStyle?.maxCharsPerLine]);
  // Gallery presets render through the shared preset engine (same cue grouping, timing,
  // geometry and colors as the ASS export). Legacy styles keep the overlay below.
  const captionData = captionItem?.caption;
  const captionTransform = captionItem?.transform;
  const aspectRatio = project.canvas.aspect_ratio;
  const presetStyle = useMemo(
    () => resolveEditorCaptionStyle(captionData, aspectRatio, captionTransform),
    [captionData, aspectRatio, captionTransform]
  );
  // Bound each existing edited cue independently. Never merge scene/position/override boundaries.
  const presetCues = presetStyle ? finalizeAutomaticFitCaptionGrowth(cues.flatMap(cue => cue.presetOverride && cue.presetOverride !== presetStyle.presetId ? [cue]
      : regroupCuesForPreset([cue], presetStyle).cues.map(part => ({...part, id: cue.id}))),presetStyle) : null;

  const activeCue = (presetCues || cues).find(c => playhead >= c.start && playhead < c.end);
  const splitCaptionCueY = undefined;
  const effectiveCaptionCoords = {
    x: activeCue?.position_x ?? currentCaptionCoords.x,
    y: activeCue?.position_y ?? currentCaptionCoords.y,
    anchorY: activeCue?.position_anchor ?? currentCaptionCoords.anchorY,
  };

  // Intro/outro title card active at the playhead (full-frame colored card with text).
  const activeTitleCard = project.tracks
    .flatMap((t) => (t.hidden ? [] : t.items))
    .find((i) => i.is_title_card && playhead >= i.timeline_start && playhead <= i.timeline_end);


  // Selected item reference
  const selectedItem = project.tracks
    .flatMap((t) => t.items)
    .find((i) => i.id === selectedItemId);

  const isUsingRenderedPreview = viewMode === 'export_review' && Boolean(renderedPreviewUrl);
  const targetVideoTime = useMemo(() => {
    if (isUsingRenderedPreview) return playhead;
    if (activeVideoItems[0]) {
      const item = activeVideoItems[0];
      // Freeze-frame still: hold the exact source frame for the whole span.
      if ((item as any).is_freeze) {
        return (item as any).freeze_source_time ?? (item.source_start || 0);
      }
      const speed = item.speed?.speed || 1.0;
      return (item.source_start || 0) + (playhead - item.timeline_start) * speed;
    }
    return (sourceOffset || 0) + playhead;
  }, [isUsingRenderedPreview, activeVideoItems, playhead, sourceOffset]);

  // Smart-reframe pan for the base video (mirrors the export's
  // buildSmartCropFilter crop window under a CSS cover fit). Applies only when
  // the clip's reframe track is provided (clip crop mode 'smart'), the layout
  // is the single-track view and the item carries no manual crop override —
  // the same precedence the export's resolveReframeDecision uses. X mirrors
  // the centered window (x = in_w*cX - out_w/2, clamped); Y mirrors the direct
  // proportion ((in_h-out_h)*cY), which is exactly CSS object-position's y
  // percentage semantics under cover fit.
  const smartPanPosition = (() => {
    const trItem = activeVideoItems[0] as any;
    const tr = trItem?.tracker;
    if (tr?.enabled && tr.keyframes?.length && primaryVideoCropMode === 'fill' && primaryLayoutMode !== 'split' && videoDims && videoDims.w > 0 && videoDims.h > 0) {
      const center = interpolateReframeCenter(tr.keyframes, targetVideoTime);
      const dims = getAspectRatioDimensions();
      const boxW = parseFloat(dims.width) || 360;
      const boxH = parseFloat(dims.height) || 640;
      const coverScale = Math.max(boxW / videoDims.w, boxH / videoDims.h);
      const inW = videoDims.w * coverScale;
      const px = inW > boxW ? Math.min(1, Math.max(0, (center.centerX * inW - boxW / 2) / (inW - boxW))) : 0.5;
      return `${(px * 100).toFixed(2)}% ${(Math.min(1, Math.max(0, center.centerY)) * 100).toFixed(2)}%`;
    }
    if (!smartReframe || !smartReframe.keyframes || smartReframe.keyframes.length === 0) return undefined;
    if (primaryLayoutMode !== 'track' || primaryVideoCropMode !== 'fill') return undefined;
    if (lowConfidenceTrack) return undefined; // weak track exports as blur; group fit (if any) overrides at consumption
    const item = activeVideoItems[0] as any;
    const itemCropMode = item?.crop?.mode;
    if (itemCropMode && itemCropMode !== 'smart') return undefined;
    if (!videoDims || videoDims.w <= 0 || videoDims.h <= 0) return undefined;
    const reframeTime = targetVideoTime - (smartReframe.clipStartSec || 0);
    const center = interpolateReframeCenter(freezeAutomaticKeyframes(smartReframe.keyframes,baseVideoItem?.automatic_framing,smartReframe.clipStartSec||0), reframeTime);
    const dims = getAspectRatioDimensions();
    const boxW = parseFloat(dims.width) || 360;
    const boxH = parseFloat(dims.height) || 640;
    const coverScale = Math.max(boxW / videoDims.w, boxH / videoDims.h);
    const inW = videoDims.w * coverScale;
    const px = inW > boxW ? Math.min(1, Math.max(0, (center.centerX * inW - boxW / 2) / (inW - boxW))) : 0.5;
    const py = Math.min(1, Math.max(0, center.centerY));
    return `${(px * 100).toFixed(2)}% ${(py * 100).toFixed(2)}%`;
  })();

  // Group-fit preview (mirrors buildGroupFitFilter): when the server says
  // this multi-person clip exports as blur-fill group fit, the main video is
  // oversized to the group window and positioned by the group midpoint
  // keyframes, band resting at 42% canvas height, over the blurred backdrop.
  const groupFitView = (() => {
    if (isUsingRenderedPreview) return undefined;
    const acceptedItem = activeVideoItems[0];
    if (acceptedItem?.framing_window !== undefined && videoDims) {
      const checked = validateFramingWindow(acceptedItem.framing_window, {item: acceptedItem as any, canvasAspect: project.canvas.aspect_ratio, decodedWidth: videoDims.w, decodedHeight: videoDims.h});
      if (!checked.ok) return undefined;
      const r = framingWindowRect(checked.value, acceptedItem.source_start, targetVideoTime - acceptedItem.source_start);
      const dims = getAspectRatioDimensions(), bw = parseFloat(dims.width)||360, bh = parseFloat(dims.height)||640;
      const scale = bw / r.w, eh = Math.round(videoDims.h * scale / 2) * 2;
      const band = Math.round(r.h * scale / 2) * 2;
      const shift = r.y * scale;
      return {left: `${-r.x*scale}px`, top: `${(bh-band)*.42-shift}px`, width: `${Math.round(videoDims.w*scale/2)*2}px`, height: `${eh}px`, clipPath: `inset(${shift}px 0 ${Math.max(0,eh-shift-band)}px 0)`};
    }
    if ((activeVideoItems[0] as any)?.tracker?.enabled) {
      const item=activeVideoItems[0] as any;
      // Chrome reports481display rows for this480-row source with non-square SAR.
      // Geometry stays in analyzed source pixels; accept only this rounding-size delta.
      const rawW=item.tracker.source_width,rawH=item.tracker.source_height;
      const dimsMatch=videoDims&&videoDims.w===rawW&&Math.abs(videoDims.h-rawH)<=1;
      const spec=dimsMatch&&project.canvas.aspect_ratio==='9:16'&&!item.scene_layout_overrides?.length?trackerHandoffSpec(item,effectiveShotComposition,rawW,rawH,compositionClipStart):null;
      const r=spec&&trackerHandoffRect(spec,targetVideoTime);
      if(r&&videoDims){const dims=getAspectRatioDimensions(),bw=parseFloat(dims.width)||360,scale=bw/r.w;return {left:`${-r.x*scale}px`,top:`${-r.y*scale}px`,width:`${rawW*scale}px`,height:`${rawH*scale}px`,clipPath:'inset(0px)'};}
      return undefined;
    }
    // Editor source timestamps are millisecond-rounded; analysis clip start
    // may retain sub-millisecond precision. Clamp only that rounding sliver.
    const relativeTime = targetVideoTime - compositionClipStart;
    const clipTime = relativeTime < 0 && relativeTime >= -.001 ? 0 : relativeTime;
    const shot = effectiveShotComposition.find(s => clipTime >= s.start && clipTime < s.end)
      ?? (effectiveShotComposition.length && clipTime >= effectiveShotComposition[effectiveShotComposition.length-1].end ? effectiveShotComposition[effectiveShotComposition.length-1] : undefined);
    const geometry = shot || groupReframe;
    if (!geometry || geometry.keyframes.length === 0) return undefined;
    if (primaryLayoutMode !== 'track' || primaryVideoCropMode !== 'fill') return undefined;
    const item = activeVideoItems[0] as any;
    const itemCropMode = item?.crop?.mode;
    if (itemCropMode && itemCropMode !== 'smart') return undefined;
    if (!videoDims || videoDims.w <= 0 || videoDims.h <= 0) return undefined;
    const dims = getAspectRatioDimensions();
    const boxW = parseFloat(dims.width) || 360;
    const boxH = parseFloat(dims.height) || 640;
    const windowW = Math.min(1, Math.max(0.01, geometry.windowW));
    const elW = boxW / windowW;
    const elH = (elW * videoDims.h) / videoDims.w;
    // Mirror buildGroupFitFilter's composition window: adaptive height when
    // the server computed one from face sizes, else the legacy 4:3 window
    // (winH clamped to the source height).
    const winH = geometry.windowH !== undefined
      ? Math.min(videoDims.h, Math.round(geometry.windowH * videoDims.h))
      : Math.min(videoDims.h, Math.round(windowW * videoDims.w * 0.75));
    const bandH = boxW * (winH / (windowW * videoDims.w));
    const center = interpolateReframeCenter(shot ? geometry.keyframes : freezeAutomaticKeyframes(geometry.keyframes,baseVideoItem?.automatic_framing,compositionClipStart), clipTime);
    const cx = Math.min(0.95, Math.max(0.05, center.centerX));
    const cy = Math.min(0.95, Math.max(0.05, center.centerY));
    const left = Math.min(0, Math.max(boxW - elW, -(cx * elW - boxW / 2)));
    const bandTop = (boxH - bandH) * automaticFitFocusY(project.canvas.aspect_ratio);
    // Mirror the export's clamped window: the band shows source rows
    // [shift, shift+bandH] of the oversized element, shift edge-clamped.
    const shift = Math.min(Math.max(cy * elH - bandH / 2, 0), Math.max(0, elH - bandH));
    const top = bandTop - shift;
    return { left: `${left.toFixed(1)}px`, top: `${top.toFixed(1)}px`, width: `${elW.toFixed(1)}px`, height: `${elH.toFixed(1)}px`, clipPath: `inset(${shift.toFixed(1)}px 0 ${Math.max(0,elH-shift-bandH).toFixed(1)}px 0)` };
  })();

  const autoShotTime = Math.max(0,targetVideoTime-compositionClipStart);
  const activeAutomaticShot = !manualPanels && !baseVideoItem?.framing_window && !baseVideoItem?.crop && !(baseVideoItem as any)?.tracker?.enabled && (primaryLayoutMode === 'track' || Boolean(activePlanShot?.split))
    ? effectiveShotComposition.find(s=>autoShotTime>=s.start&&autoShotTime<s.end) : undefined;
  const automaticLayoutLabelBase = automaticPlanReviewRequired?'Auto Fit · Review':!baseVideoItem?.crop&&!activePanels&&missingAutomaticCamera ? 'Auto Fit · Review' : activeAutomaticShot && videoDims
    ? automaticMultiPanels ? `Auto ${PANEL_LABELS[automaticMultiPanels.layout]}` : activeAutomaticShot.split ? 'Auto Split' : Math.abs(activeAutomaticShot.windowW*videoDims.w/(activeAutomaticShot.windowH!*videoDims.h)-9/16)<.01 ? 'Auto Fill' : 'Auto Fit'
    : undefined;
  const automaticLayoutLabel = automaticLayoutLabelBase && activeAutomaticShot?.contextStatus?.startsWith('unresolved') && !automaticLayoutLabelBase.includes('Review')
    ? `${automaticLayoutLabelBase} · Review` : automaticLayoutLabelBase;

  // Tracking-floor fallback (mirrors the export paths): a weak dominant track
  // with no group frame renders as the blurred fit layout, not a tight track.
  const lowConfidenceFallback =
    !isUsingRenderedPreview &&
    Boolean(lowConfidenceTrack) &&
    !baseVideoItem?.crop &&
    !groupFitView &&
    primaryLayoutMode === 'track' &&
    primaryVideoCropMode === 'fill';

  // Synchronize HTML video time with playhead smoothly
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused && Math.abs(v.currentTime - targetVideoTime) > 0.15) {
      v.currentTime = targetVideoTime;
    }
  }, [targetVideoTime, videoRef]);

  // All auxiliary views display the primary decoder's frame. Separate media
  // elements required repeated seeking and drifted on long-GOP sources.
  useEffect(() => {
    const primary=videoRef.current;if(!primary)return;
    return mirrorDecodedFrames(primary,()=>[splitBottomRef.current,backdropVideoRef.current]);
  }, [videoRef,activeVideoSrc,primaryLayoutMode,Boolean(groupFitView),lowConfidenceFallback]);

  // Handle direct item manipulation dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isTransformDragging || !dragStartPos || !initialTransform || !selectedItem) return;

      // Raw screen delta drives the relative scale/rotate gestures; position is in base canvas
      // pixels, so divide by the current render scale to keep the item under the pointer.
      const deltaXRaw = e.clientX - dragStartPos.x;
      const deltaYRaw = e.clientY - dragStartPos.y;
      const s = fitScaleRef.current || 1;
      const deltaX = deltaXRaw / s;
      const deltaY = deltaYRaw / s;

      if (transformDragMode === 'move') {
        let rawX = initialTransform.position_x + deltaX;
        let rawY = initialTransform.position_y + deltaY;

        let snappedX: number | undefined;
        let snappedY: number | undefined;
        let snapLabel: string | undefined;

        // Snap threshold in canvas pixels (14px)
        if (Math.abs(rawX) < 14) {
          rawX = 0;
          snappedX = 0.5; // center guide
          snapLabel = 'Center X';
        }
        if (Math.abs(rawY) < 14) {
          rawY = 0;
          snappedY = 0.5; // center guide
          snapLabel = snapLabel ? 'Center (X & Y)' : 'Center Y';
        }

        if (snappedX !== undefined || snappedY !== undefined) {
          setActiveSnapGuides({
            x: snappedX,
            y: snappedY,
            label: snapLabel,
            isDanger: false,
          });
        } else {
          setActiveSnapGuides(null);
        }

        onUpdateItemTransform(
          selectedItem.id,
          {
            ...selectedItem.transform,
            position_x: Math.round(rawX),
            position_y: Math.round(rawY),
          },
          { recordHistory: false, markAsDirty: false }
        );
      } else if (transformDragMode === 'scale') {
        const scaleFactor = 1 + deltaXRaw / 200;
        const newScale = Math.max(0.1, Math.min(5.0, initialTransform.scale * scaleFactor));
        onUpdateItemTransform(
          selectedItem.id,
          {
            ...selectedItem.transform,
            scale: Math.round(newScale * 100) / 100,
          },
          { recordHistory: false, markAsDirty: false }
        );
      } else if (transformDragMode === 'rotate') {
        const newRot = (initialTransform.rotation + deltaXRaw) % 360;
        onUpdateItemTransform(
          selectedItem.id,
          {
            ...selectedItem.transform,
            rotation: Math.round(newRot),
          },
          { recordHistory: false, markAsDirty: false }
        );
      }
    };

    const handleMouseUp = () => {
      setActiveSnapGuides(null);
      if (preTransformProjectRef.current) {
        const hasChanged = JSON.stringify(preTransformProjectRef.current.tracks) !== JSON.stringify(projectRef.current.tracks);
        if (hasChanged && onCommitProject) {
          onCommitProject(preTransformProjectRef.current);
        }
        preTransformProjectRef.current = null;
      }
      setIsTransformDragging(false);
      setTransformDragMode(null);
      setDragStartPos(null);
      setInitialTransform(null);
    };

    if (isTransformDragging) {
      window.addEventListener('pointermove', handleMouseMove);
      window.addEventListener('pointerup', handleMouseUp);
      window.addEventListener('pointercancel', handleMouseUp);
      window.addEventListener('blur', handleMouseUp);
    }
    return () => {
      window.removeEventListener('pointermove', handleMouseMove);
      window.removeEventListener('pointerup', handleMouseUp);
      window.removeEventListener('pointercancel', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
    };
  }, [isTransformDragging, dragStartPos, initialTransform, selectedItem, transformDragMode, onUpdateItemTransform, onCommitProject]);

  // Crop-pan dragging: in edit mode, dragging the base video pans the per-item crop
  // focus override. Click behavior is preserved via a small movement threshold; the
  // commit goes through the same pre-operation snapshot pattern as transform drags.
  useEffect(() => {
    if (!cropDrag) return;
    const handleMouseMove = (e: MouseEvent) => {
      const s = fitScaleRef.current || 1;
      const dx = (e.clientX - cropDrag.startX) / s;
      const dy = (e.clientY - cropDrag.startY) / s;
      if (!cropDrag.moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
      const dims = getAspectRatioDimensions();
      const baseW = parseFloat(dims.width) || 1;
      const baseH = parseFloat(dims.height) || 1;
      // Dragging the image right reveals more of the left side: focus moves opposite.
      const focusX = clamp01(cropDrag.startFocusX - dx / baseW);
      const focusY = clamp01(cropDrag.startFocusY - dy / baseH);
      onUpdateItemCrop?.(
        cropDrag.itemId,
        { mode: 'custom', focusX: Number(focusX.toFixed(4)), focusY: Number(focusY.toFixed(4)) },
        { recordHistory: false, markAsDirty: false }
      );
      if (!cropDrag.moved) setCropDrag({ ...cropDrag, moved: true });
    };
    const handleMouseUp = () => {
      if (cropDrag.moved && preCropProjectRef.current && onCommitProject) {
        const hasChanged = JSON.stringify(preCropProjectRef.current.tracks) !== JSON.stringify(projectRef.current.tracks);
        if (hasChanged) onCommitProject(preCropProjectRef.current);
      }
      if (cropDrag.moved) suppressClickAfterCropDragRef.current = true;
      preCropProjectRef.current = null;
      setCropDrag(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
    };
  }, [cropDrag, onUpdateItemCrop, onCommitProject]);

  // Handle caption 2D dragging with zero-jump grab offset, Shift horizontal lock, magnetic snap, and danger zone HUD
  const handleCaptionPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!onUpdateCaptionPosition || !captionItem || !canvasContainerRef.current) return;

    onSelectItem(captionItem.id);
    preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));

    const rect = canvasContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pointerNormX = (e.clientX - rect.left) / rect.width;
    const pointerNormY = (e.clientY - rect.top) / rect.height;

    const effCoords =
      captionScope === 'cue' && activeCue
        ? {
            x: activeCue.position_x ?? effectiveCaptionCoords.x,
            y: activeCue.position_y ?? splitCaptionCueY ?? effectiveCaptionCoords.y,
          }
        : { ...effectiveCaptionCoords };

    // Zero-jump grab offset: difference between pointer and current caption center
    setCaptionGrabOffset({
      x: pointerNormX - effCoords.x,
      y: pointerNormY - effCoords.y,
    });
    setInitialCaptionCoords(effCoords);
    setIsDraggingCaption(true);
    setActiveSnapGuides(null);
    setIsInDangerZone(false);

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleCaptionPointerMove = (e: React.PointerEvent) => {
    if (
      !isDraggingCaption ||
      !canvasContainerRef.current ||
      !onUpdateCaptionPosition ||
      !captionGrabOffset ||
      !initialCaptionCoords
    ) {
      return;
    }

    const rect = canvasContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pointerNormX = (e.clientX - rect.left) / rect.width;
    const pointerNormY = (e.clientY - rect.top) / rect.height;

    let targetX = pointerNormX - captionGrabOffset.x;
    let targetY = pointerNormY - captionGrabOffset.y;

    // Shift axis lock: lock horizontal movement to center (0.50)
    if (e.shiftKey) {
      targetX = 0.5;
    }

    // Snapping thresholds (normalized coordinates)
    const snapThresholdX = 0.03;
    const snapThresholdY = 0.035;

    let snappedX: number | undefined;
    let snappedY: number | undefined;

    // Snapping to horizontal center (0.50)
    if (Math.abs(targetX - 0.5) < snapThresholdX) {
      targetX = 0.5;
      snappedX = 0.5;
    }

    // Snapping to vertical safe zones (0.75, 0.50, 0.20)
    if (Math.abs(targetY - 0.75) < snapThresholdY) {
      targetY = 0.75;
      snappedY = 0.75;
    } else if (Math.abs(targetY - 0.5) < snapThresholdY) {
      targetY = 0.5;
      snappedY = 0.5;
    } else if (Math.abs(targetY - 0.2) < snapThresholdY) {
      targetY = 0.2;
      snappedY = 0.2;
    }

    const clampedX = Math.max(0.08, Math.min(0.92, targetX));
    const clampedY = Math.max(0.08, Math.min(0.92, targetY));

    // Platform danger-zone detection (9:16 canvas: bottom 16% Y > 0.84, right action rail X > 0.84 && Y > 0.45)
    const is916 = project.canvas.aspect_ratio === '9:16';
    const isBottomDanger = clampedY > 0.84;
    const isRightRailDanger = clampedX > 0.84 && clampedY > 0.45;
    const inDanger = (is916 || showSafeGuides) && (isBottomDanger || isRightRailDanger);
    setIsInDangerZone(inDanger);

    const hudLabel = inDanger
      ? '⚠️ Inside TikTok/Reels UI Zone'
      : `X: ${Math.round(clampedX * 100)}% • Y: ${Math.round(clampedY * 100)}% • Safe Zone ✓`;

    setActiveSnapGuides({
      x: snappedX,
      y: snappedY,
      label: hudLabel,
      isDanger: inDanger,
    });

    onUpdateCaptionPosition(
      {
        x: Number(clampedX.toFixed(3)),
        y: Number(clampedY.toFixed(3)),
        ...(captionScope === 'cue' && activeCue ? { cueId: activeCue.id } : {}),
      },
      { recordHistory: false, markAsDirty: false }
    );
  };

  // A no-movement pointer release on the caption is a selection tap. Touch needs
  // this because pointer capture suppresses the synthesized click; on mouse it
  // just repeats what the click does. Cancels and releases that land on an inner
  // control (like Turn off captions) are not selection taps.
  const selectCaptionOnTap = (e: React.PointerEvent) => {
    if (e.type === 'pointercancel') return;
    if ((e.target as HTMLElement).closest('button')) return;
    if (!captionItem) return;
    if (e.pointerType === 'touch') {
      // The trailing click of this gesture may be retargeted to the backdrop or
      // video; let only that click through without deselecting. The flag lives
      // until the next pointerdown anywhere: a gesture's trailing click always
      // lands before the next gesture starts, so an unrelated quick tap can
      // never have its own click swallowed.
      suppressClickAfterCaptionTapRef.current = true;
    }
    onSelectItem(captionItem.id);
  };

  const handleCaptionPointerUp = (e: React.PointerEvent) => {
    if (!isDraggingCaption) {
      selectCaptionOnTap(e);
      return;
    }
    if (isDraggingCaption) {
      let captionMoved = false;
      if (preTransformProjectRef.current) {
        const hasChanged = JSON.stringify(preTransformProjectRef.current.tracks) !== JSON.stringify(projectRef.current.tracks);
        captionMoved = hasChanged;
        if (hasChanged && onCommitProject) {
          onCommitProject(preTransformProjectRef.current);
        }
        preTransformProjectRef.current = null;
      }
      setIsDraggingCaption(false);
      setCaptionGrabOffset(null);
      setInitialCaptionCoords(null);
      setActiveSnapGuides(null);
      setIsInDangerZone(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      if (!captionMoved) selectCaptionOnTap(e);
    }
  };

  // Corner-handle direct font size scaling (32px to 110px) with single undo snapshot
  const handleResizeHandlePointerDown = (_corner: string, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!onUpdateCaptionPosition || !captionItem) return;

    preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
    setIsScalingFontSize(true);

    const targetElem = e.currentTarget.parentElement as HTMLElement;
    const rect = targetElem?.getBoundingClientRect() || (e.currentTarget as HTMLElement).getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const initialDist = Math.max(15, Math.hypot(e.clientX - centerX, e.clientY - centerY));
    const initialFont = captionItem?.caption?.font_size || presetStyle?.fontSize || 60;

    let currentScaleFont = initialFont;

    const handlePointerMove = (ev: PointerEvent) => {
      const dist = Math.hypot(ev.clientX - centerX, ev.clientY - centerY);
      const ratio = dist / initialDist;
      const newFontSize = Math.round(Math.max(32, Math.min(110, initialFont * ratio)));
      currentScaleFont = newFontSize;
      setFontSizeHud(newFontSize);
      onUpdateCaptionPosition({ fontSize: newFontSize }, { recordHistory: false, markAsDirty: false });
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      setIsScalingFontSize(false);
      setFontSizeHud(null);

      onUpdateCaptionPosition({ fontSize: currentScaleFont }, { recordHistory: true, markAsDirty: true });
      if (preTransformProjectRef.current && onCommitProject) {
        onCommitProject(preTransformProjectRef.current);
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  // Quick alignment / reset handlers with scope support
  const handleResetPosition = (target: 'top' | 'center' | 'safe' | 'reset') => {
    if (!onUpdateCaptionPosition || !captionItem) return;
    let nextX = 0.5;
    let nextY = 0.667;
    if (target === 'top') {
      nextX = 0.5;
      nextY = 0.2;
    } else if (target === 'center') {
      nextX = 0.5;
      nextY = 0.5;
    } else if (target === 'safe') {
      nextX = 0.5;
      nextY = 0.75;
    } else if (target === 'reset') {
      nextX = 0.5;
      nextY = 0.667;
    }

    const payload: any = {
      x: Number(nextX.toFixed(3)),
      y: Number(nextY.toFixed(3)),
    };
    if (captionScope === 'cue' && activeCue) {
      payload.cueId = activeCue.id;
    }

    onUpdateCaptionPosition(payload, { recordHistory: true, markAsDirty: true });
  };

  // Keyboard accessibility for fine arrow key nudging (0.005, 0.025 with Shift)
  useEffect(() => {
    if (!isCaptionSelected || !onUpdateCaptionPosition || !captionItem) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 0.025 : 0.005;
        const effX =
          captionScope === 'cue' && activeCue?.position_x !== undefined
            ? activeCue.position_x
            : effectiveCaptionCoords.x;
        const effY =
          captionScope === 'cue' && activeCue?.position_y !== undefined
            ? activeCue.position_y
            : (splitCaptionCueY ?? effectiveCaptionCoords.y);

        let nextX = effX;
        let nextY = effY;

        if (e.key === 'ArrowUp') nextY = Math.max(0.08, nextY - step);
        if (e.key === 'ArrowDown') nextY = Math.min(0.92, nextY + step);
        if (e.key === 'ArrowLeft') nextX = Math.max(0.08, nextX - step);
        if (e.key === 'ArrowRight') nextX = Math.min(0.92, nextX + step);

        onUpdateCaptionPosition(
          {
            x: Number(nextX.toFixed(3)),
            y: Number(nextY.toFixed(3)),
            ...(captionScope === 'cue' && activeCue ? { cueId: activeCue.id } : {}),
          },
          { recordHistory: true, markAsDirty: true }
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCaptionSelected,
    effectiveCaptionCoords,
    captionScope,
    activeCue,
    onUpdateCaptionPosition,
    captionItem,
    onCommitProject,
  ]);

  const canvasDims = getAspectRatioDimensions();
  // Short-height landscape phones: allow the canvas to shrink below the desktop floor so it always
  // fits the stage instead of overflowing behind the framing bar, dock or timeline.
  const isShortLandscape = typeof window !== 'undefined' && window.matchMedia('(max-height: 600px) and (max-width: 1023.9px)').matches;
  // Background panel spacing/radius: mirrors buildBackdropFitChain (inset box, rounded corners) in export.
  const backdropInset = (() => {
    const mode = primaryVideoCropMode;
    // Fit band: 4:3 cover-cropped band, full canvas width (inset by spacing), centred; mirrors the band crop in buildBackdropFitChain.
    if ((mode === 'fit' || mode === 'blur') && primaryLayoutMode !== 'split' && fitBandApplies(project.canvas.aspect_ratio) && effectiveFitBand(project.canvas, baseVideoItem as any) === '4:3') {
      const w = parseFloat(canvasDims.width);
      const h = parseFloat(canvasDims.height);
      const exportW = project.canvas.aspect_ratio === '16:9' ? 1920 : 1080;
      const space = (w * (Number(project.canvas.background_spacing) || 0)) / 100;
      const bw = Math.max(2, w - 2 * space);
      const bh = Math.min(bw / FIT_BAND_ASPECT, Math.max(2, h - 2 * space));
      return {
        position: 'absolute' as const,
        left: (w - bw) / 2, top: (h - bh) / 2, width: bw, height: bh,
        borderRadius: (Number(project.canvas.background_corner_radius) || 0) * (w / exportW),
        overflow: 'hidden' as const,
        objectFit: 'cover' as const,
      };
    }
    const sp = Number(project.canvas.background_spacing) || 0;
    const rad = Number(project.canvas.background_corner_radius) || 0;
    if ((mode !== 'fit' && mode !== 'blur') || (sp <= 0 && rad <= 0) || primaryLayoutMode === 'split') return null;
    const w = parseFloat(canvasDims.width);
    const h = parseFloat(canvasDims.height);
    const exportW = project.canvas.aspect_ratio === '16:9' ? 1920 : 1080;
    const space = (w * sp) / 100;
    const boxW = Math.max(2, w - 2 * space);
    const boxH = Math.max(2, h - 2 * space);
    // Size the element to the contained frame (not the whole inset box) so the rounded
    // corners hug the visible video, matching buildBackdropFitChain.
    const vw = videoDims && videoDims.w > 0 ? videoDims.w : 16;
    const vh = videoDims && videoDims.h > 0 ? videoDims.h : 9;
    const k = Math.min(boxW / vw, boxH / vh);
    const fw = vw * k;
    const fh = vh * k;
    return {
      position: 'absolute' as const,
      left: (w - fw) / 2, top: (h - fh) / 2, width: fw, height: fh,
      borderRadius: rad * (w / exportW),
      overflow: 'hidden' as const,
    };
  })();

  // Fit the fixed design-resolution canvas into the available stage via a uniform scale, so the
  // video grows to fill reclaimed space (e.g. when the inspector collapses) while every child —
  // captions, overlays, transform handles, safe-zone HUD — scales uniformly and keeps parity.
  const baseW = parseFloat(canvasDims.width);
  const baseH = parseFloat(canvasDims.height);
  const fitScale = availSize
    ? computeCanvasFitScale({ baseW, baseH, availW: availSize.w, availH: availSize.h, ...(isShortLandscape ? { min: 0.03, pad: 8 } : {}) })
    : 1;
  fitScaleRef.current = fitScale;
  const fitW = Math.round(baseW * fitScale);
  const fitH = Math.round(baseH * fitScale);

  return (
    <div
      onPointerDown={(e) => {
        // Deselect item/caption when clicking on empty stage backdrop or non-selectable area
        if (!(e.target as HTMLElement).closest('[data-selectable-item]')) {
          onSelectItem(null);
        }
      }}
      className="flex-1 min-h-0 bg-vc-surface1 flex flex-col items-center p-3 overflow-hidden relative select-none"
    >
      {/* OPUS-STYLE TOP PREVIEW TOOLBAR */}
      <div className="w-full shrink-0 flex flex-col items-center justify-center gap-1 pb-2 z-30 max-md:pr-9 short:pr-9">
        <div className="md:hidden w-full flex items-center justify-between gap-2 glass-float px-2 py-1 rounded-xl text-xs" data-testid="mobile-framing-summary">
          <span className="truncate min-w-0 text-neutral-300">{project.canvas.aspect_ratio || '9:16'} · {(automaticLayoutLabel ? automaticLayoutLabel+(!automaticLayoutLabel.includes('Review')&&activeAutomaticShot?.contextStatus?.startsWith('unresolved')?' · Review':'') : undefined) || (baseVideoItem?.framing_window ? 'Context window' : activePanels ? PANEL_LABELS[activePanels.layout] : primaryLayoutMode === 'split' ? 'Split' : primaryVideoCropMode === 'fit' ? 'Fit' : primaryVideoCropMode === 'blur' ? 'Blur' : 'Fill')}</span>
          <button
            type="button"
            data-testid="mobile-framing-toggle"
            aria-expanded={mobileFramingToolsOpen}
            aria-label={mobileFramingToolsOpen ? 'Close framing tools' : 'Open framing tools'}
            onClick={(e) => { e.stopPropagation(); setLayoutAnchor(null); setMobileFramingToolsOpen(open => !open); }}
            className="shrink-0 min-h-[40px] rounded-lg px-2.5 bg-white/10 text-white font-medium"
          >{mobileFramingToolsOpen ? 'Done' : 'Framing tools'}</button>
        </div>
        <div data-testid="preview-framing-tools" className={`vc-framing-tools ${mobileFramingToolsOpen ? 'flex' : 'hidden'} md:flex relative flex-wrap items-center justify-center gap-x-2 gap-y-1 max-w-full glass-float px-3 py-1 rounded-2xl text-xs whitespace-nowrap`}>
          {shotComposition?.some(s=>s.contextStatus?.startsWith('unresolved')) && (
            <span data-testid="automatic-context-review" className="text-amber-300" title={activeAutomaticShot?.uncertainty || "Automatic 4:3 Fit crops side pixels. Some scenes need a side-content review before sharing."}>Review side context</span>
          )}
          {/* 1. Aspect Ratio Pill */}
          {onChangeAspectRatio && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const ratios: ClipAspectRatio[] = ['9:16', '1:1', '16:9'];
                const currentIdx = ratios.indexOf(project.canvas.aspect_ratio || '9:16');
                const nextRatio = ratios[(currentIdx + 1) % ratios.length];
                onChangeAspectRatio(nextRatio);
              }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition font-medium"
              title="Click to cycle Aspect Ratio (9:16 / 1:1 / 16:9)"
            >
              <RectangleHorizontal className="w-3.5 h-3.5" />
              <span>{project.canvas.aspect_ratio || '9:16'}</span>
            </button>
          )}

          <div className="w-px h-3.5 bg-white/[0.1]" />

          {onSetAutomaticFraming && baseVideoItem && Boolean((baseVideoItem as any).crop_config?.layout_mode_source==='auto'||shotComposition?.length || smartReframe?.keyframes?.length || groupReframe?.keyframes?.length) && (
            <div className="flex items-center gap-1 flex-wrap whitespace-normal" data-testid="auto-reframe-controls">
              <button type="button" data-testid="auto-reframe-toggle" aria-pressed={baseVideoItem.automatic_framing?.enabled !== false}
                className="px-2 py-1 rounded-lg hover:bg-white/10 text-neutral-200"
                title="This video item: hold automatic movement at the current position. Each detected shot keeps its layout. Manual edits stay unchanged."
                onClick={()=>onSetAutomaticFraming(baseVideoItem.id,baseVideoItem.automatic_framing?.enabled===false,targetVideoTime)}>
                Auto Reframe: {baseVideoItem.automatic_framing?.enabled===false?'OFF':'ON'}
              </button>
              <span className="text-[9px] text-neutral-500">This video item{baseVideoItem.crop || manualPanels || baseVideoItem.tracker?.enabled || baseVideoItem.framing_window || (baseVideoItem as any).crop_config?.layout_mode_source==='user' ? ' · Manual framing takes priority' : ''}</span>
              <button type="button" data-testid="auto-reframe-all" className="px-2 py-1 rounded hover:bg-white/10 text-[10px] text-neutral-400"
                title="Apply this Auto Reframe setting to all video scenes. Manual edits stay unchanged."
                onClick={()=>onSetAutomaticFraming(null,baseVideoItem.automatic_framing?.enabled!==false,targetVideoTime)}>Apply to whole clip</button>
            </div>
          )}
          {onSetAutoCandidate && <button type="button" data-testid="auto-layout-candidate-toggle" aria-pressed={autoCandidateMixed?'mixed':Boolean(autoCandidateEnabled)} onClick={()=>onSetAutoCandidate(!autoCandidateEnabled)}
            className="px-2 py-1 rounded-lg text-amber-200 hover:bg-white/10"
            title="Apply review candidate to editable video items in this clip. Mixed means some items remain OFF; locked items are unchanged. Tries measured head/shoulder Split and body-only framing. Manual edits and locked items keep priority. Text protection requires available analysis evidence; review before sharing.">
            Auto candidate: {autoCandidateMixed?'MIXED · review':autoCandidateEnabled?'ON · review':'OFF'}
          </button>}
          {onSetAutoCandidate && baseVideoItem && <span data-testid="active-auto-candidate-state" className="text-[10px] text-neutral-400">This item: candidate {(baseVideoItem as any).crop_config?.automaticLayoutCandidate==='review-v1'?'ON':'OFF'}{baseVideoItem.locked?' · locked':''}</span>}
          {automaticLayoutLabel?.includes('Fit') && <span data-testid="automatic-fit-aspect" className="text-[10px] text-amber-300" title="Actual sharp-view aspect. A full-source context fallback is not 4:3. Side content outside a crop remains unverified; review before sharing.">{automaticPlanReviewRequired?'Full-source Fit · Review':activeAutomaticShot?.presentationProtection?.preserveWindow&&videoDims&&Math.abs(activeAutomaticShot.windowW*videoDims.w/(activeAutomaticShot.windowH*videoDims.h)-4/3)>.02?'Full-source Fit · context conflict':'4:3 Fit · check sides'}</span>}
          {/* 2. Layout: Fill / Fit / Blur - one toggle cycling the three fill modes */}
          {onUpdateCropMode && (
            <>
            <button
              type="button"
              ref={layoutBtnRef}
              data-testid="toolbar-layout"
              onClick={(e) => {
                e.stopPropagation();
                if (onPickSceneLayout && baseVideoItem) { setLayoutAnchor(layoutAnchor ? null : layoutBtnRef.current!.getBoundingClientRect()); return; }
                const nextMode = primaryVideoCropMode === 'fill' ? 'fit' : primaryVideoCropMode === 'fit' ? 'blur' : 'center';
                onUpdateCropMode(nextMode);
              }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition font-medium"
              title="Choose Auto analysis or a fixed layout for this video item"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>{automaticLayoutLabel ? baseVideoItem?.automatic_framing?.enabled===false ? 'Held layout: ' : 'Layout Auto: ' : 'Layout: '}{automaticLayoutLabel ? automaticLayoutLabel.replace('Auto ', '') : baseVideoItem?.framing_window ? 'Context window' : activePanels ? PANEL_LABELS[activePanels.layout] : primaryLayoutMode === 'split' ? 'Split' : primaryLayoutMode === 'blur' ? 'Blur' : primaryLayoutMode === 'screencast' ? 'Screencast' : (primaryVideoCropMode === 'fit' || (primaryVideoCropMode === 'blur' && (baseVideoItem as any)?.crop?.choice === 'fit')) ? 'Fit' : primaryVideoCropMode === 'blur' ? 'Blur' : 'Fill'}</span>
            </button>
            {layoutAnchor && onPickSceneLayout && baseVideoItem && (
              <SceneLayoutMenu autoAvailable scopeTitle={shotComposition?.length ? "Layout for this scene only" : "Layout for this video item"} onPickWholeClip={onPickWholeClipLayout} anchor={layoutAnchor} current={activeAutomaticShot ? 'auto' : readItemLayout(baseVideoItem)} onPick={(l) => onPickSceneLayout(baseVideoItem.id, l)} onClose={() => setLayoutAnchor(null)} />
            )}
            </>
          )}

          <div className="w-px h-3.5 bg-white/[0.1]" />

          {onUpdateCropMode && onUpdateCanvas && (
            <>
              <BackgroundControl
                project={project}
                sceneItem={baseVideoItem}
                cropMode={primaryVideoCropMode === 'blur' ? 'blur' : primaryVideoCropMode === 'fit' ? 'fit' : 'fill'}
                onSetCropMode={onUpdateCropMode}
                onUpdateCanvas={onUpdateCanvas}
              />
              <div className="w-px h-3.5 bg-white/[0.1]" />
            </>
          )}

          {onUpdateItemPanels && !activePanels && primaryLayoutMode === 'split' && baseVideoItem && (
            <button type="button" disabled={videoCropLocked}
              className="px-2 py-0.5 rounded-lg hover:bg-white/10 disabled:opacity-40"
              title="Switch this scene to independent Split crop boxes. Review both views before export."
              onClick={() => {
                if (videoCropLocked) return;
                onUpdateItemPanels(baseVideoItem.id, {layout:'split2',slots:[
                  {focusX:splitAnchors.speaker1X,focusY:.5,scale:1},
                  {focusX:splitAnchors.speaker2X,focusY:.5,scale:1},
                ]}, {recordHistory:true,markAsDirty:true});
              }}>Edit Split views</button>
          )}
          {onUpdateItemPanels && (manualPanels || automaticPanelEditRange) && activePanels && videoDims && videoDims.w > 0 && baseVideoItem && (
            <>
              {panelTargetRects(activePanels).map((r, i) => {
                const cw = parseFloat(canvasDims.width), ch = parseFloat(canvasDims.height);
                const physicalTarget=geometryOutputSize?panelPixelRects(activePanels.layout,geometryOutputSize.width,geometryOutputSize.height,activePanels.topFraction)[i]:undefined;
                return (
                  <CropBoxControl
                    key={`${baseVideoItem.id}-${activePanels.layout}-${i}`}
                    allowRegionFit
                    inlineTarget={stageViewportRef.current}
                    label={['watch_party','streaming'].includes(activePanels.layout) ? `${i===0?'Facecam (top)':'Stream / Display (bottom)'}${activePanels.slots[i].set ? '' : ' - set view'}` : activePanels.slots[i].set ? `Panel ${i + 1}` : `Panel ${i + 1} (set view)`}
                    videoSrc={cleanSourceUrl || activeVideoSrc || null}
                    sourceTime={targetVideoTime}
                    srcW={videoDims.w}
                    srcH={videoDims.h}
                    canvasAspect={physicalTarget?physicalTarget.w/physicalTarget.h:(r.w * cw) / (r.h * ch)}
                    current={activePanels.slots[i]}
                    notice={automaticPanelEditRange ? "Apply makes this scene manual; Cancel keeps Auto. Fill replaces the chosen source region. Fit keeps or resizes it." : activePanels.slots[i].sourceRect ? "This view uses a chosen source region. Fill replaces it with a full-source crop. Fit lets you keep or resize the region." : undefined}
                    enabled={!videoCropLocked}
                    disabledReason="Unlock this scene or track to change its panel crop."
                    onOpen={() => { setMobileFramingToolsOpen(false); onBeginCrop?.(); }}
                    onApply={(c) => {
                      if (videoCropLocked) return;
                      const slots = activePanels.slots.map((s: import('../../../server/src/shared/panelLayouts.js').PanelSlot, j: number) => (j === i ? { ...c, set: true } : s));
                      onUpdateItemPanels(baseVideoItem.id, { ...activePanels, slots }, { recordHistory: true, markAsDirty: true }, automaticPanelEditRange);
                    }}
                  />
                );
              })}
              <div className="w-px h-3.5 bg-white/[0.1]" />
            </>
          )}
          {onUpdateItemCrop && videoDims && videoDims.w > 0 && activeVideoItems[0] && !activePanels && (
            <>
              <CropBoxControl
                key={activeVideoItems[0].id}
                inlineTarget={stageViewportRef.current}
                onOpen={() => { setMobileFramingToolsOpen(false); onBeginCrop?.(); }}
                disabledReason={videoCropLocked ? "Unlock this scene or track to change its crop." : undefined}
                notice={activeVideoItems[0].framing_window ? "Applying a manual crop replaces this scene's context window. Cancel keeps it unchanged." : undefined}
                videoSrc={cleanSourceUrl || activeVideoSrc || null}
                sourceTime={targetVideoTime}
                srcW={videoDims.w}
                srcH={videoDims.h}
                canvasAspect={(parseFloat(canvasDims.width) || 360) / (parseFloat(canvasDims.height) || 640)}
                current={{ focusX: activeVideoItems[0].crop?.focusX ?? 0.5, focusY: activeVideoItems[0].crop?.focusY ?? 0.5, scale: activeVideoItems[0].crop?.scale ?? 1 }}
                enabled={!videoCropLocked && primaryVideoCropMode === 'fill' && primaryLayoutMode !== 'split'}
                onApply={(c) => onUpdateItemCrop(activeVideoItems[0].id, { mode: 'custom', ...c }, { recordHistory: true, markAsDirty: true })}
              />
              <div className="w-px h-3.5 bg-white/[0.1]" />
            </>
          )}

          {clipId && onSetTracker && (
            <>
              <TrackerControl
                clipId={clipId}
                project={project}
                videoSrc={cleanSourceUrl || activeVideoSrc || null}
                sourceTime={targetVideoTime}
                activeItemId={(activeVideoItems[0] as any)?.id ?? null}
                onSetTracker={onSetTracker}
              />
              <div className="w-px h-3.5 bg-white/[0.1]" />
            </>
          )}

          {/* 3. Platform Safe Zones */}
          {onToggleSafeGuides && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSafeGuides();
              }}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg transition font-medium ${
                showSafeGuides
                  ? 'bg-white/[0.14] text-white shadow-sm'
                  : 'hover:bg-white/[0.08] text-neutral-400 hover:text-white'
              }`}
              title="Toggle Platform Safe Zones Overlay"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Safe Zones: {showSafeGuides ? 'ON' : 'OFF'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Viewport container (centered in remaining space) */}
      <div ref={stageViewportRef} className="flex-1 flex items-center justify-center w-full min-h-0 relative">
        <div
          style={{ width: fitW, height: fitH }}
          className="relative shadow-2xl rounded-xl border border-neutral-800/80 overflow-hidden"
        >
        <div
          ref={canvasContainerRef}
          data-testid="preview-layout-canvas"
          data-automatic-shot-start={activeAutomaticShot?.start}
          data-automatic-shot-kind={activeAutomaticShot?.kind}
          onContextMenu={e=>{if(!onPickSceneLayout||!baseVideoItem||baseVideoItem.locked)return;e.preventDefault();e.stopPropagation();setLayoutAnchor(new DOMRect(e.clientX,e.clientY,1,1));}}
          style={{
            width: canvasDims.width,
            height: canvasDims.height,
            aspectRatio: canvasDims.ratio,
            backgroundColor: project.canvas.background_color || '#000000',
            transform: `scale(${fitScale})`,
            transformOrigin: 'top left',
          }}
          onClick={() => { if (suppressClickAfterCaptionTapRef.current) { suppressClickAfterCaptionTapRef.current = false; return; } onSelectItem(null); }}
          className="relative overflow-hidden flex items-center justify-center"
        >
          <svg aria-hidden style={{position:'absolute',width:0,height:0,pointerEvents:'none'}}>
            <defs><filter id={backdropColorFilterId} colorInterpolationFilters="sRGB">
              <feColorMatrix type="matrix" values={PREVIEW_BACKDROP_COLOR_MATRIX}/>
            </filter></defs>
          </svg>
          {/* HTML5 VIDEO BASE STREAM */}
          {(primaryVideoCropMode === 'blur' || primaryLayoutMode === 'blur' || Boolean(groupFitView) || lowConfidenceFallback) && activeVideoSrc ? (
            <canvas
              ref={backdropVideoRef}
              aria-hidden
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              style={{
                // Design-scale blur and additive color approximation. Export stays authoritative.
                filter: `blur(${previewBackdropBlurPx(parseFloat(canvasDims.width))}px) url(#${backdropColorFilterId})`,
              }}
            />
          ) : null}
          {activeVideoSrc ? (
            <video
              ref={videoRef}
              src={activeVideoSrc}
              playsInline
              muted={project.tracks.some((t) => t.type === 'VIDEO' && t.muted)}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = targetVideoTime;
                  if (videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
                    setVideoDims({ w: videoRef.current.videoWidth, h: videoRef.current.videoHeight });
                  }
                }
              }}
              onDoubleClick={(e) => {
                // Double-click resets the crop reframe (edit mode only).
                if (viewMode !== 'edit' || !onUpdateItemCrop) return;
                const item = activeVideoItems[0];
                if (!item || !item.crop || videoCropLocked) return;
                e.stopPropagation();
                onUpdateItemCrop(item.id, { mode: item.crop.mode ?? ((item as any).crop_mode === 'fit' ? 'fit' : 'custom'), focusX: 0.5, focusY: 0.5, scale: 1 });
              }}
              onMouseDown={(e) => {
                // Drag the base video to pan its crop focus (edit mode only).
                if (viewMode !== 'edit' || !onUpdateItemCrop) return;
                const item = activeVideoItems[0];
                if (!item || videoCropLocked) return;
                preCropProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                setCropDrag({
                  itemId: item.id,
                  startX: e.clientX,
                  startY: e.clientY,
                  startFocusX: item.crop?.focusX ?? 0.5,
                  startFocusY: item.crop?.focusY ?? 0.5,
                  moved: false,
                });
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (suppressClickAfterCropDragRef.current) {
                  suppressClickAfterCropDragRef.current = false;
                  return;
                }
                if (selectedItemId) {
                  if (suppressClickAfterCaptionTapRef.current) { suppressClickAfterCaptionTapRef.current = false; return; }
                  onSelectItem(null);
                  return;
                }
                onTogglePlay();
              }}
              className={
                primaryLayoutMode === 'split'
                  ? splitView1
                    ? 'absolute top-0 left-0 cursor-pointer select-none'
                    : 'w-full h-1/2 absolute top-0 left-0 cursor-pointer select-none'
                  : groupFitView
                    ? 'absolute cursor-pointer select-none'
                    : 'w-full h-full cursor-pointer select-none'
              }
            style={{
              filter: cssColorFilters(activeVideoItems[0]),
              // Explicit px sizing mirrors the export's crop window; Tailwind
              // preflight caps video at max-width:100%, which would silently
              // shrink the oversized element back into the panel, so unset it.
              ...(backdropInset ?? {}),
              ...(activePanels ? { opacity: 0 } : {}),
              ...(groupFitView
                ? { left: groupFitView.left, top: groupFitView.top, width: groupFitView.width, height: groupFitView.height, clipPath: groupFitView.clipPath, maxWidth: 'none' }
                : {}),
              ...(primaryLayoutMode === 'split' && splitView1
                ? { left: splitView1.left, top: splitView1.top, width: splitView1.width, height: splitView1.height, clipPath: splitView1.clipPath, maxWidth: 'none' }
                : {}),
              // Fit/Blur = letterbox (matches export's buildFitFilter pad / blur fill); Fill = cover-crop;
              // group fit sizes the element exactly, so cover introduces no extra crop
              objectFit: backdropInset && (backdropInset as any).objectFit === 'cover' ? 'cover' : primaryVideoCropMode === 'fit' || primaryVideoCropMode === 'blur' || primaryLayoutMode === 'blur' || lowConfidenceFallback ? 'contain' : 'cover',
              objectPosition:
                primaryLayoutMode === 'split'
                  ? splitView1
                    ? '0% 0%'
                    : `${splitObjectPositionX(splitAnchors.speaker1X)} 50%`
                  : groupFitView
                    ? '0% 0%'
                    : smartPanPosition ||
                      `${((activeVideoItems[0]?.crop?.focusX ?? 0.5) * 100).toFixed(2)}% ${((activeVideoItems[0]?.crop?.focusY ?? 0.5) * 100).toFixed(2)}%`,
              transform: activeVideoItems[0]
                ? `translate(${interpolateKeyframes(
                    activeVideoItems[0].keyframes,
                    'position_x',
                    playhead - activeVideoItems[0].timeline_start,
                    activeVideoItems[0].transform?.position_x || 0
                  )}px, ${interpolateKeyframes(
                    activeVideoItems[0].keyframes,
                    'position_y',
                    playhead - activeVideoItems[0].timeline_start,
                    activeVideoItems[0].transform?.position_y || 0
                  )}px) scale(${(interpolateKeyframes(
                    activeVideoItems[0].keyframes,
                    'scale',
                    playhead - activeVideoItems[0].timeline_start,
                    activeVideoItems[0].transform?.scale || 1
                  ) as number) * (activeVideoItems[0].crop?.scale ?? 1)}) rotate(${interpolateKeyframes(
                    activeVideoItems[0].keyframes,
                    'rotation',
                    playhead - activeVideoItems[0].timeline_start,
                    activeVideoItems[0].transform?.rotation || 0
                  )}deg)`
                : undefined,
              // Crop zoom magnifies around the crop focus, matching the
              // single-pass crop window the export filter computes.
              transformOrigin: `${((activeVideoItems[0]?.crop?.focusX ?? 0.5) * 100).toFixed(2)}% ${((activeVideoItems[0]?.crop?.focusY ?? 0.5) * 100).toFixed(2)}%`,
              opacity: activeVideoItems[0]
                ? interpolateKeyframes(
                    activeVideoItems[0].keyframes,
                    'opacity',
                    playhead - activeVideoItems[0].timeline_start,
                    activeVideoItems[0].transform?.opacity ?? 1
                  )
                : 1,
            }}
          />
        ) : (
          <div className="text-center p-4 text-neutral-500 text-xs">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-40 text-neutral-600" />
            <span>No Video Source Loaded</span>
          </div>
        )}

        {/* SPLIT LAYOUT: bottom speaker half (mirrors export's buildSplitPodcastFilter
            vstack: top = speaker1, bottom = speaker2). Synced to the main video
            via the primary media clock; same look chain + transform. */}
        {primaryLayoutMode === 'split' && activeVideoSrc ? (
          <canvas
            ref={splitBottomRef}
            aria-hidden
            className={splitView2 ? 'absolute left-0 pointer-events-none select-none' : 'w-full h-1/2 absolute bottom-0 left-0 pointer-events-none select-none'}
            style={{
              filter: cssColorFilters(activeVideoItems[0]),
              objectFit: 'cover',
              // Panel 2 sits at the canvas's bottom half: base offset panelH
              // minus the export-mirrored clamped window top.
              ...(splitView2
                ? {
                    left: splitView2.left,
                    top: `${(splitView2.panelH + parseFloat(splitView2.top)).toFixed(1)}px`,
                    width: splitView2.width,
                    height: splitView2.height,
                    clipPath: splitView2.clipPath,
                    maxWidth: 'none',
                  }
                : {}),
              objectPosition: splitView2 ? '0% 0%' : `${splitObjectPositionX(splitAnchors.speaker2X)} 50%`,
              transform: activeVideoItems[0]
                ? `scale(${(interpolateKeyframes(
                    activeVideoItems[0].keyframes,
                    'scale',
                    playhead - activeVideoItems[0].timeline_start,
                    activeVideoItems[0].transform?.scale || 1
                  ) as number) * (activeVideoItems[0].crop?.scale ?? 1)})`
                : undefined,
              transformOrigin: '50% 50%',
            }}
          />
        ) : null}

        {activePanels && activeVideoSrc && videoDims && videoDims.w > 0 ? (
          <PanelsPreview
            outputSize={geometryOutputSize}
            src={activeVideoSrc}
            panels={activePanels}
            canvasW={parseFloat(canvasDims.width)}
            canvasH={parseFloat(canvasDims.height)}
            srcW={videoDims.w}
            srcH={videoDims.h}
            time={targetVideoTime}
            playing={Boolean(isPlaying)}
            filter={cssColorFilters(baseVideoItem)}
          />
        ) : null}

        {/* WATERMARK BADGE: mirrors the export's animated VireoClip badge
            (slide-in from the right, then gentle opacity breathing) while the
            preview plays the clean source. Hidden in export review, where the
            badge is already burned into the rendered file. */}
        {watermarkRequired && !isUsingRenderedPreview && (() => {
          // Playhead-driven (not CSS wall-clock) so seek/pause mirror the
          // export's t-based drawtext expressions exactly: 0.45s ease-out
          // quadratic slide-in from the right, then 3.2s alpha breathing.
          const t = Math.max(0, playhead);
          const ENTRY = 0.45;
          const inEntry = t < ENTRY;
          const k = inEntry ? t / ENTRY : 1;
          const easeOut = 1 - (1 - k) * (1 - k);
          const opacity = inEntry ? k : Math.max(0, Math.min(1, (2 - t) / 0.5));
          const markOpacity = Math.max(0, Math.min(1, (t - 1.5) / 0.5));
          const tx = inEntry ? (1 - easeOut) * 120 : 0;
          return (<>
            <img src="/brand/vireoclip-mark.png" alt="" aria-hidden className="absolute top-[2.5%] right-[3%] z-30 pointer-events-none" style={{ width: `${96 / 1080 * 100}%`, opacity: markOpacity }} />
            <div
              aria-hidden
              className="absolute top-[2.5%] right-[3%] z-30 pointer-events-none select-none text-white/90 font-medium [text-shadow:0_2px_2px_rgba(0,0,0,0.6),0_0_1px_rgba(0,0,0,0.35)]"
              style={{
                fontSize: 'clamp(11px, 1.6vw, 18px)',
                opacity,
                transform: tx > 0.01 ? `translateX(${tx.toFixed(2)}%)` : undefined,
              }}
            >
              VireoClip
            </div></>
          );
        })()}

        {/* INTRO / OUTRO TITLE CARD (full-frame colored card with centered text) */}
        {activeTitleCard && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              onSelectItem(activeTitleCard.id);
            }}
            style={{ backgroundColor: activeTitleCard.background_color || '#0B0D12' }}
            className="absolute inset-0 z-10 flex items-center justify-center cursor-pointer"
          >
            <span className="text-white font-bold text-2xl md:text-3xl text-center px-6 drop-shadow-lg">
              {activeTitleCard.title_card_text || activeTitleCard.name || ''}
            </span>
          </div>
        )}

        {/* COMPOSITED VISUAL LAYERS (Active only in Live Edit Mode) */}
        {viewMode === 'edit' && (
          <>
            {/* TEXT LAYERS OVERLAY */}
            {activeTextItems
              .slice()
              .sort((a, b) => (a.z_index || 10) - (b.z_index || 10))
              .map((item) => {
                if (!item.text) return null;
                const t = item.text;
                const isSelected = selectedItemId === item.id;

                // Motion & Entrance/Exit Animation interpolation
                const relTime = Math.max(0, playhead - item.timeline_start);
                const itemDur = Math.max(0.1, item.timeline_end - item.timeline_start);
                const anim = t.animation || 'none';
                const animDur = Math.min(itemDur * 0.45, t.animation_duration || 0.45);

                let animOpacity = 1;
                let animOffsetY = 0;
                let animScale = 1;
                let displayText = t.text;

                if (anim !== 'none' && animDur > 0) {
                  // Entrance phase
                  if (relTime < animDur) {
                    const p = relTime / animDur;
                    switch (anim) {
                      case 'fade':
                        animOpacity = p;
                        break;
                      case 'slide_up':
                        animOpacity = p;
                        animOffsetY = (1 - p) * 35;
                        break;
                      case 'pop':
                        animOpacity = Math.min(1, p * 2);
                        animScale = p < 0.7 ? 0.5 + (p / 0.7) * 0.65 : 1.15 - ((p - 0.7) / 0.3) * 0.15;
                        break;
                      case 'scale':
                        animOpacity = p;
                        animScale = 0.75 + p * 0.25;
                        break;
                      case 'bounce_lite':
                        animOpacity = Math.min(1, p * 2);
                        animOffsetY = Math.sin(p * Math.PI * 2) * (1 - p) * 16;
                        break;
                      case 'typewriter':
                        const count = Math.max(1, Math.floor(p * t.text.length));
                        displayText = t.text.slice(0, count);
                        break;
                    }
                  }
                  // Exit phase (fade out over last animDur seconds)
                  else if (relTime > itemDur - animDur) {
                    const exitP = Math.max(0, (itemDur - relTime) / animDur);
                    animOpacity = exitP;
                    if (anim === 'slide_up') {
                      animOffsetY = (1 - exitP) * -15;
                    }
                  }
                }

                const posX = item.transform?.position_x || 0;
                const posY = (item.transform?.position_y || 0) + animOffsetY;
                const scale = (item.transform?.scale || 1) * animScale;
                const rotation = item.transform?.rotation || 0;
                const baseOpacity = item.transform?.opacity ?? 1;

                return (
                  <div
                    key={item.id}
                    data-selectable-item="true"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelectItem(item.id);
                      preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                      setIsTransformDragging(true);
                      setTransformDragMode('move');
                      setDragStartPos({ x: e.clientX, y: e.clientY });
                      setInitialTransform({ ...item.transform });
                    }}
                    style={{
                      touchAction: 'none',
                      fontFamily: t.font_family || 'Inter',
                      fontSize: `${t.font_size || 36}px`,
                      fontWeight:
                        t.font_weight === 'black'
                          ? 900
                          : t.font_weight === 'bold'
                          ? 700
                          : t.font_weight === 'medium'
                          ? 600
                          : 400,
                      fontStyle: t.italic ? 'italic' : 'normal',
                      color: t.color || '#FFFFFF',
                      textAlign: t.alignment || 'center',
                      letterSpacing: t.letter_spacing ? `${t.letter_spacing}px` : undefined,
                      lineHeight: t.line_height ? `${t.line_height}` : 1.2,
                      transform: `translate(${posX}px, ${posY}px) scale(${scale}) rotate(${rotation}deg)`,
                      opacity: baseOpacity * animOpacity,
                      backgroundColor: t.background_color || 'transparent',
                      padding: t.background_padding
                        ? `${t.background_padding}px ${Math.round(t.background_padding * 1.5)}px`
                        : t.background_color
                        ? '6px 12px'
                        : '2px 4px',
                      borderRadius: `${t.background_corner_radius || 0}px`,
                      // Outline sits behind the fill (as the export's border does) so a dark outline cannot thin the glyphs
                      paintOrder: 'stroke fill',
                      WebkitTextStroke: t.stroke_width
                        ? `${t.stroke_width}px ${t.stroke_color || '#000000'}`
                        : undefined,
                      textShadow: t.shadow_color
                        ? `0 2px ${t.shadow_blur || 6}px ${t.shadow_color}`
                        : undefined,
                      // pre-line: explicit newlines in the item text are preserved (the
                      // export burns one drawtext per line); long lines wrap at 90% width.
                      whiteSpace: 'pre-line',
                      zIndex: item.z_index || 20,
                    }}
                    className={`absolute pointer-events-auto cursor-move max-w-[90%] leading-tight select-none transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-white/30 ring-offset-2 ring-offset-black/80'
                        : 'hover:ring-1 hover:ring-white/40'
                    }`}
                  >
                    {displayText}

                    {/* DIRECT MANIPULATION HANDLES ATTACHED TO SELECTED TEXT */}
                    {isSelected && (
                      <>
                        {/* Turn-off control for the hook (reversible: hides it, text is kept) */}
                        {viewMode === 'edit' && onTurnOffHook && t.auto_headline && (
                          <button
                            type="button"
                            aria-label="Turn off hook"
                            title="Turn off hook (turn it back on in Hook display)"
                            onClick={(e) => { e.stopPropagation(); onTurnOffHook(item.id); }}
                            onPointerDown={(e) => { e.stopPropagation(); }}
                            className={isCoarsePointer
                              ? "absolute pointer-events-auto flex items-center justify-center bg-transparent"
                              : "absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-600/95 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg pointer-events-auto max-md:after:content-[''] max-md:after:absolute max-md:after:-inset-[15px]"}
                            style={isCoarsePointer ? { width: 44 / fitScale, height: 44 / fitScale, top: -6 / fitScale, right: -6 / fitScale } : undefined}
                          >
                            {isCoarsePointer ? (
                              <span
                                className="rounded-full bg-red-600/95 text-white flex items-center justify-center shadow-lg"
                                style={{ width: 26 / fitScale, height: 26 / fitScale }}
                              >
                                <Trash2 style={{ width: 14 / fitScale, height: 14 / fitScale }} />
                              </span>
                            ) : (
                              <Trash2 className="w-3 h-3" />
                            )}
                          </button>
                        )}
                        {/* Scale handle (bottom-right) */}
                        <div
                          className="touch-none before:content-[''] before:absolute before:-inset-4 absolute -right-2 -bottom-2 w-4 h-4 bg-white/20 border-2 border-white rounded-full cursor-se-resize shadow pointer-events-auto"
                          title="Drag to Scale Text"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                            setIsTransformDragging(true);
                            setTransformDragMode('scale');
                            setDragStartPos({ x: e.clientX, y: e.clientY });
                            setInitialTransform({ ...item.transform });
                          }}
                        />
                        {/* Rotate handle (top-center) */}
                        <div
                          className="touch-none before:content-[''] before:absolute before:-inset-4 absolute -top-7 left-1/2 -translate-x-1/2 w-5 h-5 bg-white/[0.15] border border-white/60 rounded-full flex items-center justify-center text-white cursor-pointer shadow hover:scale-110 pointer-events-auto transition"
                          title="Rotate Text"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                            setIsTransformDragging(true);
                            setTransformDragMode('rotate');
                            setDragStartPos({ x: e.clientX, y: e.clientY });
                            setInitialTransform({ ...item.transform });
                          }}
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

            {/* STICKERS & ELEMENTS OVERLAY */}
            {activeOverlayItems
              .slice()
              .sort((a, b) => (a.z_index || 15) - (b.z_index || 15))
              .map((item) => {
                const isSelected = selectedItemId === item.id;
                const posX = item.transform?.position_x || 0;
                const posY = item.transform?.position_y || 0;
                const scale = item.transform?.scale || 1.0;
                const rotation = item.transform?.rotation || 0;
                const opacity = item.transform?.opacity ?? 1.0;
                // Versioned semantics: 'design_center' items (new inserts) use the
                // export's center-origin design-space contract; legacy unmarked
                // items keep the historical top-left translate so saved projects
                // render exactly where the user left them.
                const designCenter = item.transform?.position_space === 'design_center';

                return (
                  <div
                    key={item.id}
                    data-selectable-item="true"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelectItem(item.id);
                      preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                      setIsTransformDragging(true);
                      setTransformDragMode('move');
                      setDragStartPos({ x: e.clientX, y: e.clientY });
                      setInitialTransform({ ...item.transform });
                    }}
                    style={{
                      touchAction: 'none',
                      ...(designCenter ? { left: '50%', top: '50%' } : {}),
                      transform: designCenter
                        ? `translate(-50%, -50%) translate(${posX}px, ${posY}px) scale(${scale}) rotate(${rotation}deg)`
                        : `translate(${posX}px, ${posY}px) scale(${scale}) rotate(${rotation}deg)`,
                      opacity,
                      zIndex: item.z_index || 15,
                    }}
                    className={`absolute pointer-events-auto cursor-move select-none transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-white/30 ring-offset-2 ring-offset-black/80'
                        : 'hover:ring-1 hover:ring-white/40'
                    }`}
                  >
                    {(item as any).card ? (
                      // Synthesized card background: same width/height/radius/color
                      // values the export's PNG synthesizer consumes (parity by construction).
                      <div
                        className="pointer-events-none select-none"
                        style={{
                          width: (item as any).card.width,
                          height: (item as any).card.height,
                          borderRadius: (item as any).card.radius,
                          backgroundColor: (item as any).card.color,
                        }}
                      />
                    ) : (
                      <img
                        src={item.source_path || ''}
                        alt={item.name || 'Element Overlay'}
                        className="max-w-[280px] max-h-[280px] object-contain pointer-events-none select-none"
                        loading="eager"
                      />
                    )}

                    {/* DIRECT MANIPULATION HANDLES ATTACHED TO SELECTED STICKER / ELEMENT */}
                    {isSelected && (
                      <>
                        {/* Delete control (top-right of selected overlay in Live Edit mode) */}
                        {viewMode === 'edit' && (
                          <button
                            type="button"
                            aria-label="Remove element from video"
                            title="Remove element (Delete)"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onDeleteItem) {
                                onDeleteItem(item.id);
                              }
                            }}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                            }}
                            className="absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-600/95 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition pointer-events-auto border border-white/90 z-20 group"
                          >
                            <Trash2 className="w-3 h-3 group-hover:scale-110 transition-transform" />
                          </button>
                        )}
                        {/* Scale handle (bottom-right) */}
                        <div
                          className="touch-none before:content-[''] before:absolute before:-inset-4 absolute -right-2 -bottom-2 w-4 h-4 bg-white/20 border-2 border-white rounded-full cursor-se-resize shadow pointer-events-auto"
                          title="Drag to Scale Element"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                            setIsTransformDragging(true);
                            setTransformDragMode('scale');
                            setDragStartPos({ x: e.clientX, y: e.clientY });
                            setInitialTransform({ ...item.transform });
                          }}
                        />
                        {/* Rotate handle (top-center) */}
                        <div
                          className="touch-none before:content-[''] before:absolute before:-inset-4 absolute -top-7 left-1/2 -translate-x-1/2 w-5 h-5 bg-white/[0.15] border border-white/60 rounded-full flex items-center justify-center text-white cursor-pointer shadow hover:scale-110 pointer-events-auto transition"
                          title="Rotate Element"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                            setIsTransformDragging(true);
                            setTransformDragMode('rotate');
                            setDragStartPos({ x: e.clientX, y: e.clientY });
                            setInitialTransform({ ...item.transform });
                          }}
                        >
                          <RotateCw className="w-2.5 h-2.5" />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}

            {/* PRESET CAPTIONS (export-parity renderer) */}
            {presetStyle && presetCues && (() => {
              const cue = presetCues.find((c) => playhead >= c.start && playhead < c.end);
              if (!cue) return null;
              const frameWidthPx = parseFloat(canvasDims.width);
              const rawCue = cues.find((c) => playhead >= c.start && playhead < c.end);
              const effectivePresetId = cue.presetOverride || rawCue?.presetOverride;
              const effectiveOverrides = cue.styleOverrides || rawCue?.styleOverrides;
              const effectiveStyle = effectivePresetId && isRenderablePresetId(effectivePresetId)
                ? resolveCaptionPreset(effectivePresetId, effectiveOverrides, aspectRatio)
                : effectiveOverrides
                ? resolveCaptionPreset(getEditorCaptionPresetId(captionData), effectiveOverrides, aspectRatio)
                : presetStyle;

              const frameCue =
                splitCaptionCueY !== undefined && cue.position_y === undefined
                  ? { ...cue, position_y: splitCaptionCueY }
                  : cue;

              return (
                <CaptionPresetRenderer
                  style={effectiveStyle}
                  frame={getPreviewFrame(frameCue, playhead, effectiveStyle)}
                  scale={frameWidthPx / effectiveStyle.playResX}
                  interactive={true}
                  isSelected={isCaptionSelected}
                  isDragging={isDraggingCaption}
                  isInDangerZone={isInDangerZone}
                  showResizeHandles={isCaptionSelected && !isDraggingCaption && viewMode === 'edit'}
                  onResizeHandlePointerDown={handleResizeHandlePointerDown}
                  onPointerDown={handleCaptionPointerDown}
                  onPointerMove={handleCaptionPointerMove}
                  onPointerUp={handleCaptionPointerUp}
                  onPointerCancel={handleCaptionPointerUp}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (captionItem) onSelectItem(captionItem.id);
                  }}
                  onTurnOffCaptions={onTurnOffCaptions}
                  turnOffScale={fitScale}
                  turnOffCoarse={isCoarsePointer}
                />
              );
            })()}

            {/* KINETIC CAPTIONS OVERLAY (LEGACY STYLES, NEVER DUPLICATED) */}
            {!presetStyle && activeCue && activeCaptionTrack && (() => {
              const capStyle = captionItem?.caption?.style || 'clean';
              const highlightCol = captionItem?.caption?.highlight_color || '#FF6B35';
              const primaryCol = captionItem?.caption?.primary_color || '#FFFFFF';

              const config = (() => {
                switch (capStyle) {
                  case 'bold':
                    return {
                      fontFamily: "'Impact', 'Arial Black', sans-serif",
                      fontWeight: 900,
                      textTransform: 'uppercase' as const,
                      containerClass: 'bg-black/75 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10 shadow-2xl',
                      activeScale: 'scale(1.15)',
                    };
                  case 'minimal':
                    return {
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 600,
                      textTransform: 'none' as const,
                      containerClass: 'bg-transparent px-3 py-1 drop-shadow-lg',
                      activeScale: 'scale(1.06)',
                    };
                  case 'podcast':
                    return {
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 800,
                      textTransform: 'none' as const,
                      containerClass: 'bg-neutral-950/85 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-amber-500/30 shadow-xl',
                      activeScale: 'scale(1.12)',
                    };
                  case 'karaoke':
                    return {
                      fontFamily: "'Arial Black', sans-serif",
                      fontWeight: 900,
                      textTransform: 'uppercase' as const,
                      containerClass: 'bg-black/70 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/20 shadow-xl',
                      activeScale: 'scale(1.22)',
                    };
                  case 'highlight':
                    return {
                      fontFamily: "'Arial Black', sans-serif",
                      fontWeight: 900,
                      textTransform: 'uppercase' as const,
                      containerClass: 'bg-black/80 backdrop-blur-sm px-4 py-2 rounded-xl border border-emerald-500/40 shadow-2xl',
                      activeScale: 'scale(1.18)',
                    };
                  case 'clean':
                  default:
                    return {
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: 700,
                      textTransform: 'none' as const,
                      containerClass: 'bg-black/60 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10 shadow-xl',
                      activeScale: 'scale(1.1)',
                    };
                }
              })();

              const capCustom = captionItem?.caption;
              const fontFamily = capCustom?.font_family || config.fontFamily;
              const fontWeight = capCustom?.font_weight === 'black' ? 900 : capCustom?.font_weight === 'bold' ? 700 : capCustom?.font_weight === 'regular' ? 400 : (typeof capCustom?.font_weight === 'number' ? capCustom?.font_weight : config.fontWeight);
              const textTransform = capCustom?.uppercase !== undefined ? (capCustom.uppercase ? 'uppercase' : 'none') : config.textTransform;
              const strokeWidth = capCustom?.stroke_width ?? 0;
              const strokeColor = capCustom?.stroke_color || '#000000';
              const shadowEnabled = capCustom?.shadow_enabled ?? true;
              const shadowBlur = capCustom?.shadow_blur ?? 4;
              const maxLines = capCustom?.max_lines ?? 2;
              const effX =
                captionScope === 'cue' && activeCue?.position_x !== undefined
                  ? activeCue.position_x
                  : effectiveCaptionCoords.x;
              const effY =
                captionScope === 'cue' && activeCue?.position_y !== undefined
                  ? activeCue.position_y
                  : (splitCaptionCueY ?? effectiveCaptionCoords.y);

              // Split-attributed cues anchor like the exported ASS: bottom edge
              // at position_y (0.4 = upper-half band above the divider).
              const cueHasOwnY =
                (captionScope === 'cue' && activeCue?.position_y !== undefined) || splitCaptionCueY !== undefined;
              const effAnchorY = activeCue.position_anchor ?? (cueHasOwnY ? 'bottom' : effectiveCaptionCoords.anchorY);
              const anchorTransform =
                effAnchorY === 'center'
                  ? 'translate(-50%, -50%)'
                  : effAnchorY === 'top'
                    ? 'translate(-50%, 0)'
                    : 'translate(-50%, -100%)';

              return (
                <div
                  onPointerDown={handleCaptionPointerDown}
                  onPointerMove={handleCaptionPointerMove}
                  onPointerUp={handleCaptionPointerUp}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (captionItem) onSelectItem(captionItem.id);
                  }}
                  style={{
                    top: `${effY * 100}%`,
                    left: `${effX * 100}%`,
                    // Anchored like the exported ASS (bottom edge at effY for \an2 styles,
                    // center/top for the middle/top unset-position defaults).
                    transform: anchorTransform,
                    // Lift the selected caption (and its turn-off control) above the
                    // generic non-text transform-handle box, which otherwise swallows taps.
                    zIndex: isCaptionSelected ? 30 : undefined,
                  }}
                  data-selectable-item="true"
                  className={`absolute text-center pointer-events-auto select-none touch-none max-w-[88%] transition-opacity ${
                    isDraggingCaption ? 'cursor-grabbing opacity-90' : 'cursor-grab opacity-100'
                  }`}
                >
                  <div
                    className={`relative inline-block ${config.containerClass} max-w-full transition-all ${
                      maxLines === 1 ? 'whitespace-nowrap overflow-hidden text-ellipsis' : ''
                    } ${
                      isDraggingCaption
                        ? 'cursor-grabbing opacity-90'
                        : isInDangerZone
                        ? 'ring-2 ring-rose-500 rounded-xl'
                        : isCaptionSelected
                        ? 'ring-2 ring-white/30 rounded-xl shadow-lg'
                        : 'hover:ring-1 hover:ring-white/30 rounded-xl'
                    }`}
                  >
                    <span
                      style={{
                        fontFamily,
                        fontWeight,
                        fontSize: capCustom?.font_size ? `${capCustom.font_size}px` : undefined,
                        textTransform,
                        WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : undefined,
                      }}
                      className="text-lg text-white tracking-wide"
                    >
                      {activeCue.words && activeCue.words.length > 0 ? (
                        activeCue.words.map((w, wIdx) => {
                          const isWordActive = playhead >= w.start && playhead <= w.end;
                          return (
                            <span
                              key={wIdx}
                              style={{
                                color: isWordActive ? highlightCol : primaryCol,
                                transform: isWordActive ? config.activeScale : 'scale(1)',
                                display: 'inline-block',
                                transition: 'all 0.08s ease',
                                marginRight: '0.25rem',
                                textShadow: shadowEnabled
                                  ? (isWordActive
                                      ? `0 0 16px ${highlightCol}80, 0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0,0,0,0.85)`
                                      : `0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0,0,0,0.85)`)
                                  : 'none',
                              }}
                            >
                              {w.text}
                            </span>
                          );
                        })
                      ) : (
                        <span
                          style={{
                            color: primaryCol,
                            textShadow: shadowEnabled ? `0 ${shadowBlur}px ${shadowBlur * 2}px rgba(0,0,0,0.85)` : 'none',
                          }}
                        >
                          {activeCue.text}
                        </span>
                      )}
                    </span>

                    {isCaptionSelected && !isDraggingCaption && viewMode === 'edit' && onTurnOffCaptions && (
                      <button
                        type="button"
                        aria-label="Turn off captions"
                        title="Turn off captions (turn them back on with Captions On)"
                        onClick={(e) => { e.stopPropagation(); onTurnOffCaptions(); }}
                        onPointerDown={(e) => { e.stopPropagation(); }}
                        className={isCoarsePointer
                          ? "absolute z-40 pointer-events-auto flex items-center justify-center bg-transparent"
                          : "absolute -top-4 left-1/2 -translate-x-1/2 w-6 h-6 bg-red-600/95 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg z-40 pointer-events-auto max-md:after:content-[''] max-md:after:absolute max-md:after:-inset-[15px]"}
                        style={isCoarsePointer ? {
                          width: 44 / fitScale,
                          height: 44 / fitScale,
                          // Corner-attached so the control never covers caption text, and
                          // flipped below the chip when the caption sits near the canvas top.
                          right: -10 / fitScale,
                          ...(effY > 0.28 ? { top: -50 / fitScale } : { bottom: -50 / fitScale }),
                        } : undefined}
                      >
                        {isCoarsePointer ? (
                          <span
                            className="rounded-full bg-red-600/95 text-white flex items-center justify-center shadow-lg"
                            style={{ width: 26 / fitScale, height: 26 / fitScale }}
                          >
                            <Trash2 style={{ width: 14 / fitScale, height: 14 / fitScale }} />
                          </span>
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                    {/* Corner handles on legacy caption for font size scaling */}
                    {isCaptionSelected && !isDraggingCaption && viewMode === 'edit' && (
                      <>
                        <div
                          onPointerDown={(e) => handleResizeHandlePointerDown('nw', e)}
                          className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-black/60 rounded-sm cursor-nwse-resize shadow-md z-30 pointer-events-auto"
                          title="Drag to Scale Font Size"
                        />
                        <div
                          onPointerDown={(e) => handleResizeHandlePointerDown('ne', e)}
                          className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-black/60 rounded-sm cursor-nesw-resize shadow-md z-30 pointer-events-auto"
                          title="Drag to Scale Font Size"
                        />
                        <div
                          onPointerDown={(e) => handleResizeHandlePointerDown('sw', e)}
                          className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-black/60 rounded-sm cursor-nesw-resize shadow-md z-30 pointer-events-auto"
                          title="Drag to Scale Font Size"
                        />
                        <div
                          onPointerDown={(e) => handleResizeHandlePointerDown('se', e)}
                          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-black/60 rounded-sm cursor-nwse-resize shadow-md z-30 pointer-events-auto"
                          title="Drag to Scale Font Size"
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* AUTO-REVEALING PLATFORM DANGER-ZONES (TIKTOK / REELS / SHORTS) */}
            {/* Only visible when dragging an item/caption AND entering danger zone */}
            {(isDraggingCaption || isTransformDragging) && isInDangerZone && project.canvas.aspect_ratio === '9:16' && (
              <div className="absolute inset-0 pointer-events-none z-20">
                {/* Bottom 16% Description & Audio Dead Zone (Y > 0.84) */}
                <div
                  style={{ top: '84%', height: '16%' }}
                  className={`absolute left-0 right-0 border-t-2 transition-all ${
                    isInDangerZone
                      ? 'bg-rose-500/25 border-rose-500 shadow-[inset_0_0_20px_rgba(244,63,94,0.35)]'
                      : 'bg-rose-500/10 border-rose-400/40'
                  } flex items-center justify-center`}
                >
                  <span className="text-[9px] font-mono tracking-wider uppercase text-rose-300 font-semibold px-2 py-0.5 rounded bg-black/60 shadow">
                    TikTok / Reels Description Dead Zone
                  </span>
                </div>

                {/* Right Action Rail Dead Zone (X > 0.84, Y > 0.45 to Y < 0.84) */}
                <div
                  style={{ left: '84%', width: '16%', top: '45%', height: '39%' }}
                  className={`absolute border-l-2 transition-all ${
                    isInDangerZone
                      ? 'bg-rose-500/25 border-rose-500 shadow-[inset_0_0_20px_rgba(244,63,94,0.35)]'
                      : 'bg-rose-500/10 border-rose-400/40'
                  } flex flex-col items-center justify-center text-center p-1`}
                >
                  <span className="text-[8px] font-mono tracking-wider uppercase text-rose-300 font-semibold leading-tight px-1 py-0.5 rounded bg-black/60 shadow">
                    Action Rail
                  </span>
                </div>
              </div>
            )}

            {/* ACTIVE SNAPPING ALIGNMENT GUIDES & HUD PILL */}
            {activeSnapGuides && (
              <>
                {activeSnapGuides.x !== undefined && (
                  <div
                    style={{ left: `${activeSnapGuides.x * 100}%` }}
                    className={`absolute top-0 bottom-0 w-0 border-l-2 border-dashed z-30 pointer-events-none ${
                      activeSnapGuides.isDanger
                        ? 'border-rose-400'
                        : 'border-violet-400'
                    }`}
                  />
                )}
                {activeSnapGuides.y !== undefined && (
                  <div
                    style={{ top: `${activeSnapGuides.y * 100}%` }}
                    className={`absolute left-0 right-0 h-0 border-t-2 border-dashed z-30 pointer-events-none ${
                      activeSnapGuides.isDanger
                        ? 'border-rose-400'
                        : 'border-violet-400'
                    }`}
                  />
                )}
                {activeSnapGuides.label && (
                  <div
                    className={`absolute top-12 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full text-[11px] font-mono font-medium shadow-2xl backdrop-blur-md flex items-center gap-1.5 animate-fadeIn pointer-events-none whitespace-nowrap ${
                      activeSnapGuides.isDanger
                        ? 'bg-rose-950/95 border border-rose-500 text-rose-200'
                        : 'bg-neutral-950/95 border border-violet-400 text-violet-100'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full animate-pulse ${
                        activeSnapGuides.isDanger ? 'bg-rose-400' : 'bg-violet-400'
                      }`}
                    />
                    <span>{activeSnapGuides.label}</span>
                  </div>
                )}
              </>
            )}

            {/* FONT SIZE HUD DURING CORNER SCALING */}
            {fontSizeHud !== null && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-neutral-950/95 text-white backdrop-blur-md flex items-center gap-1.5 animate-fadeIn pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>Font Size: {fontSizeHud}px</span>
              </div>
            )}

            {/* FLOATING SCOPE PILL & QUICK PRESETS MICRO-BAR */}
            {isCaptionSelected && !isDraggingCaption && viewMode === 'edit' && (
              <div onPointerDown={e=>e.stopPropagation()} className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex flex-wrap justify-center items-center gap-1.5 glass-overlay rounded-xl px-2 py-1 shadow-2xl animate-fadeIn select-none whitespace-nowrap w-max max-w-[calc(100%-16px)]">
                {/* Scope Toggle */}
                <div className="flex items-center bg-black/60 rounded-lg p-0.5 ">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCaptionScope('all');
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer flex items-center gap-1 ${
                      captionScope === 'all'
                        ? 'bg-white/[0.15] text-white font-semibold shadow'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                    title="Apply changes to all captions in track"
                  >
                    <span>🌐</span> All Cues
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeCue) setCaptionScope('cue');
                    }}
                    disabled={!activeCue}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer flex items-center gap-1 ${
                      captionScope === 'cue'
                        ? 'bg-white/[0.15] text-white font-semibold shadow'
                        : activeCue
                        ? 'text-neutral-400 hover:text-neutral-200'
                        : 'text-neutral-600 cursor-not-allowed'
                    }`}
                    title={
                      activeCue
                        ? `Apply changes to active cue ("${activeCue.text.slice(0, 15)}...") only`
                        : 'No active cue at current playhead'
                    }
                  >
                    <span>📌</span> This Cue Only
                  </button>
                </div>

                <div className="w-px h-4 bg-neutral-700 mx-0.5" />

                {captionScope === 'cue' && activeCue && (
                  <button type="button" title="Remove this cue's manual position and inherit track or scene placement"
                    className="px-2 py-0.5 rounded text-[10px] font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                    onClick={e=>{e.stopPropagation();if(!onUpdateCaptionPosition)return;onUpdateCaptionPosition({cueId:activeCue.id,resetCuePosition:true},{recordHistory:true,markAsDirty:true});}}>
                    Inherit Position
                  </button>
                )}

                {/* Quick Presets */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetPosition('top');
                  }}
                  title="Align to Safe Top (20%)"
                  aria-pressed={Math.abs(effectiveCaptionCoords.y-.2)<.002 && Math.abs(effectiveCaptionCoords.x-.5)<.002}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${Math.abs(effectiveCaptionCoords.y-.2)<.002 && Math.abs(effectiveCaptionCoords.x-.5)<.002 ? 'bg-white/20 text-white ring-1 ring-white/30' : 'text-neutral-300 hover:text-white hover:bg-neutral-800'}`}
                >
                  Top (20%)
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetPosition('center');
                  }}
                  title="Align to Horizontal & Vertical Center (50%)"
                  aria-pressed={Math.abs(effectiveCaptionCoords.y-.5)<.002 && Math.abs(effectiveCaptionCoords.x-.5)<.002}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${Math.abs(effectiveCaptionCoords.y-.5)<.002 && Math.abs(effectiveCaptionCoords.x-.5)<.002 ? 'bg-white/20 text-white ring-1 ring-white/30' : 'text-neutral-300 hover:text-white hover:bg-neutral-800'}`}
                >
                  Center (50%)
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetPosition('safe');
                  }}
                  title="Snap to Safe Bottom (75%)"
                  aria-pressed={Math.abs(effectiveCaptionCoords.y-.75)<.002 && Math.abs(effectiveCaptionCoords.x-.5)<.002}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition cursor-pointer ${Math.abs(effectiveCaptionCoords.y-.75)<.002 && Math.abs(effectiveCaptionCoords.x-.5)<.002 ? 'bg-white/20 text-white ring-1 ring-white/30' : 'text-neutral-300 hover:text-white hover:bg-neutral-800'}`}
                >
                  Bottom Safe (75%)
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetPosition('reset');
                  }}
                  title="Reset to Default Preset Position"
                  className="px-2 py-0.5 rounded text-[10px] font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                >
                  Reset Center
                </button>
                {onTurnOffCaptions && (
                  <button
                    type="button"
                    aria-label="Turn off captions"
                    title="Turn off captions (turn them back on with Captions On)"
                    onClick={(e) => { e.stopPropagation(); onTurnOffCaptions(); }}
                    className="w-5 h-5 rounded-full bg-red-600/95 hover:bg-red-500 text-white flex items-center justify-center cursor-pointer relative max-md:after:content-[''] max-md:after:absolute max-md:after:-inset-[15px]"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* SAFE AREA GUIDES OVERLAY & HAZARD WARNING */}
            {(() => {
              const captionY = captionItem?.transform?.position_y ?? 720;
              const captionPercentY = (captionY / 1080) * 100;
              // Preset captions are placed by margins/anchor exactly like export; check their real edges.
              const presetEdgePct = presetStyle ? (presetStyle.marginV / presetStyle.playResY) * 100 : 0;
              const isBottomHazard = presetStyle
                ? presetStyle.alignment === 2 && 100 - presetEdgePct > 87.5
                : captionPercentY > 75;
              const isTopHazard = presetStyle
                ? presetStyle.alignment === 8 && presetEdgePct < 7.5
                : captionPercentY < 12;
              const hasHazard = isBottomHazard || isTopHazard;

              return (
                <>
                  {showSafeGuides && (
                    <div className="absolute inset-0 pointer-events-none border border-white/[0.12]">
                      <div className={`absolute top-0 left-0 right-0 h-12 ${isTopHazard ? 'bg-amber-500/25 border-b-2 border-amber-400' : 'bg-white/[0.06] border-b border-white/40'} flex items-center justify-center text-[9px] font-mono text-neutral-300 uppercase tracking-widest`}>
                        Platform Header Safe Zone
                      </div>
                      <div className={`absolute bottom-0 left-0 right-0 h-20 ${isBottomHazard ? 'bg-amber-500/25 border-t-2 border-amber-400' : 'bg-white/[0.06] border-t border-white/40'} flex items-center justify-center text-[9px] font-mono text-neutral-300 uppercase tracking-widest`}>
                        Action Buttons & Title Danger Zone
                      </div>
                      <div className="absolute top-12 bottom-20 right-0 w-12 bg-white/[0.06] border-l border-white/40" />
                    </div>
                  )}

                  {/* Interactive Safe-Zone Collision Warning Badge */}
                  {hasHazard && (
                    <div className="absolute bottom-24 z-30 px-3 py-1.5 rounded-full glass-overlay !border-amber-500/80 shadow-2xl flex items-center gap-2 text-xs text-amber-300 animate-fadeIn pointer-events-auto">
                      <span>⚠️ Captions in {isBottomHazard ? 'bottom' : 'top'} UI danger area</span>
                      {onUpdateCaptionPosition && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleResetPosition('safe');
                          }}
                          className="px-2 py-0.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-semibold text-[10px] transition cursor-pointer"
                        >
                          Snap to Safe
                        </button>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {/* DIRECT MANIPULATION TRANSFORM HANDLES (FOR NON-TEXT ITEMS) */}
            {selectedItem && selectedItem.type !== 'TEXT' && (
              <div
                style={{
                  transform: `translate(${selectedItem.transform?.position_x || 0}px, ${
                    selectedItem.transform?.position_y || 0
                  }px) scale(${selectedItem.transform?.scale || 1}) rotate(${
                    selectedItem.transform?.rotation || 0
                  }deg)`,
                }}
                className="absolute w-48 h-48 border-2 border-white/40 rounded-lg pointer-events-auto cursor-move flex items-center justify-center"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                  setIsTransformDragging(true);
                  setTransformDragMode('move');
                  setDragStartPos({ x: e.clientX, y: e.clientY });
                  setInitialTransform({ ...selectedItem.transform });
                }}
              >
                {/* Scale handle (bottom right) */}
                <div
                  className="absolute -right-2 -bottom-2 w-4 h-4 bg-white/20 border-2 border-white rounded cursor-se-resize shadow"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                    setIsTransformDragging(true);
                    setTransformDragMode('scale');
                    setDragStartPos({ x: e.clientX, y: e.clientY });
                    setInitialTransform({ ...selectedItem.transform });
                  }}
                />
                {/* Rotate handle (top center) */}
                <div
                  className="absolute -top-7 w-5 h-5 bg-white/[0.15] rounded-full flex items-center justify-center text-white cursor-pointer shadow hover:scale-110 transition"
                  title="Rotate Item"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                    setIsTransformDragging(true);
                    setTransformDragMode('rotate');
                    setDragStartPos({ x: e.clientX, y: e.clientY });
                    setInitialTransform({ ...selectedItem.transform });
                  }}
                >
                  <RotateCw className="w-3 h-3" />
                </div>
              </div>
            )}
          </>
        )}
      </div>
      </div>
      </div>
    </div>
  );
};
