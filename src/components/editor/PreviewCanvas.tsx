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
import { CaptionPresetRenderer } from './CaptionPresetRenderer';

interface PreviewCanvasProps {
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
  onUpdateItemTransform: (itemId: string, transform: any, options?: UpdateProjectOptions) => void;
  onCommitProject?: (preOperationProject: EditorProject) => void;
  showSafeGuides: boolean;
  onToggleSafeGuides?: () => void;
  onChangeAspectRatio?: (aspectRatio: ClipAspectRatio) => void;
  onUpdateCropMode?: (mode: 'center' | 'fit' | 'smart') => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  cues: TimedCaptionCue[];
  onUpdateCaptionPosition?: (
    pos: { x?: number; y?: number; cueId?: string; fontSize?: number } | number,
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

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({
  project,
  playhead,
  isPlaying: _isPlaying,
  sourceOffset = 0,
  cleanSourceUrl,
  renderedPreviewUrl,
  viewMode,
  onPlayheadChange: _onPlayheadChange,
  onTogglePlay,
  selectedItemId,
  onSelectItem,
  onDeleteItem,
  onUpdateItemTransform,
  onCommitProject,
  showSafeGuides,
  onToggleSafeGuides,
  onChangeAspectRatio,
  onUpdateCropMode,
  videoRef,
  cues,
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
    let y = 0.667;
    if (captionItem?.caption?.position_x !== undefined) {
      x = captionItem.caption.position_x;
    } else if (captionItem?.transform?.position_x !== undefined) {
      x =
        captionItem.transform.position_x >= 0 && captionItem.transform.position_x <= 1
          ? captionItem.transform.position_x
          : captionItem.transform.position_x / 1920 + 0.5;
    }
    if (captionItem?.caption?.position_y !== undefined) {
      y = captionItem.caption.position_y;
    } else if (captionItem?.transform?.position_y !== undefined && captionItem.transform.position_y > 0) {
      y = captionItem.transform.position_y > 1 ? captionItem.transform.position_y / 1080 : captionItem.transform.position_y;
    }
    return {
      x: Math.max(0.05, Math.min(0.95, x)),
      y: Math.max(0.05, Math.min(0.95, y)),
    };
  }, [captionItem]);

  for (const track of project.tracks) {
    if (track.hidden) continue;
    for (const item of track.items) {
      if (playhead >= item.timeline_start && playhead <= item.timeline_end) {
        if (track.type === 'VIDEO') activeVideoItems.push(item);
        else if (track.type === 'TEXT') activeTextItems.push(item);
        else if (track.type === 'IMAGE' || track.type === 'OVERLAY') activeOverlayItems.push(item);
      }
    }
  }

  const primaryVideoCropMode = useMemo(() => {
    const videoTrack = project.tracks.find((t) => t.type === 'VIDEO');
    return (videoTrack?.items[0] as any)?.crop_mode || 'center';
  }, [project.tracks]);

  // Find active caption cue
  const activeCue = cues.find((c) => playhead >= c.start && playhead <= c.end);

  // Intro/outro title card active at the playhead (full-frame colored card with text).
  const activeTitleCard = project.tracks
    .flatMap((t) => (t.hidden ? [] : t.items))
    .find((i) => i.is_title_card && playhead >= i.timeline_start && playhead <= i.timeline_end);

  // Gallery presets render through the shared preset engine (same cue grouping, timing,
  // geometry and colors as the ASS export). Legacy styles keep the overlay below.
  const captionData = captionItem?.caption;
  const captionTransform = captionItem?.transform;
  const aspectRatio = project.canvas.aspect_ratio;
  const presetStyle = useMemo(
    () => resolveEditorCaptionStyle(captionData, aspectRatio, captionTransform),
    [captionData, aspectRatio, captionTransform]
  );
  const presetCues = useMemo(
    () => (presetStyle ? regroupCuesForPreset(cues, presetStyle).cues : null),
    [cues, presetStyle]
  );

  // Selected item reference
  const selectedItem = project.tracks
    .flatMap((t) => t.items)
    .find((i) => i.id === selectedItemId);

  const isUsingRenderedPreview = viewMode === 'export_review' && Boolean(renderedPreviewUrl);
  const targetVideoTime = useMemo(() => {
    if (isUsingRenderedPreview) return playhead;
    if (activeVideoItems[0]) {
      const item = activeVideoItems[0];
      const speed = item.speed?.speed || 1.0;
      return (item.source_start || 0) + (playhead - item.timeline_start) * speed;
    }
    return (sourceOffset || 0) + playhead;
  }, [isUsingRenderedPreview, activeVideoItems, playhead, sourceOffset]);

  // Synchronize HTML video time with playhead smoothly
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - targetVideoTime) > 0.15) {
      v.currentTime = targetVideoTime;
    }
  }, [targetVideoTime, videoRef]);

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
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('blur', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
    };
  }, [isTransformDragging, dragStartPos, initialTransform, selectedItem, transformDragMode, onUpdateItemTransform, onCommitProject]);

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
            x: activeCue.position_x ?? currentCaptionCoords.x,
            y: activeCue.position_y ?? currentCaptionCoords.y,
          }
        : { ...currentCaptionCoords };

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

  const handleCaptionPointerUp = (e: React.PointerEvent) => {
    if (isDraggingCaption) {
      if (preTransformProjectRef.current) {
        const hasChanged = JSON.stringify(preTransformProjectRef.current.tracks) !== JSON.stringify(projectRef.current.tracks);
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
    const preProject = JSON.parse(JSON.stringify(projectRef.current));
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
    if (onCommitProject) {
      onCommitProject(preProject);
    }
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
            : currentCaptionCoords.x;
        const effY =
          captionScope === 'cue' && activeCue?.position_y !== undefined
            ? activeCue.position_y
            : currentCaptionCoords.y;

        let nextX = effX;
        let nextY = effY;

        if (e.key === 'ArrowUp') nextY = Math.max(0.08, nextY - step);
        if (e.key === 'ArrowDown') nextY = Math.min(0.92, nextY + step);
        if (e.key === 'ArrowLeft') nextX = Math.max(0.08, nextX - step);
        if (e.key === 'ArrowRight') nextX = Math.min(0.92, nextX + step);

        const preProject = JSON.parse(JSON.stringify(projectRef.current));
        onUpdateCaptionPosition(
          {
            x: Number(nextX.toFixed(3)),
            y: Number(nextY.toFixed(3)),
            ...(captionScope === 'cue' && activeCue ? { cueId: activeCue.id } : {}),
          },
          { recordHistory: true, markAsDirty: true }
        );
        if (onCommitProject) {
          onCommitProject(preProject);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isCaptionSelected,
    currentCaptionCoords,
    captionScope,
    activeCue,
    onUpdateCaptionPosition,
    captionItem,
    onCommitProject,
  ]);

  const canvasDims = getAspectRatioDimensions();

  // Fit the fixed design-resolution canvas into the available stage via a uniform scale, so the
  // video grows to fill reclaimed space (e.g. when the inspector collapses) while every child —
  // captions, overlays, transform handles, safe-zone HUD — scales uniformly and keeps parity.
  const baseW = parseFloat(canvasDims.width);
  const baseH = parseFloat(canvasDims.height);
  const fitScale = availSize
    ? computeCanvasFitScale({ baseW, baseH, availW: availSize.w, availH: availSize.h })
    : 1;
  fitScaleRef.current = fitScale;
  const fitW = Math.round(baseW * fitScale);
  const fitH = Math.round(baseH * fitScale);

  return (
    <div
      ref={stageViewportRef}
      onPointerDown={(e) => {
        // Deselect item/caption when clicking on empty stage backdrop or non-selectable area
        if (!(e.target as HTMLElement).closest('[data-selectable-item]')) {
          onSelectItem(null);
        }
      }}
      className="flex-1 bg-[#08090B] flex flex-col items-center p-3 overflow-hidden relative select-none"
    >
      {/* OPUS-STYLE TOP PREVIEW TOOLBAR */}
      <div className="w-full shrink-0 flex items-center justify-center gap-3 pb-2 z-30">
        <div className="flex items-center gap-2 bg-[#12141C]/90 backdrop-blur-md border border-white/[0.08] px-3 py-1 rounded-xl shadow-lg text-xs">
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

          {/* 2. Layout: Fill / Fit */}
          {onUpdateCropMode && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const nextMode = primaryVideoCropMode === 'fit' ? 'center' : 'fit';
                onUpdateCropMode(nextMode);
              }}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition font-medium"
              title={`Layout Mode (Click to switch to ${primaryVideoCropMode === 'fit' ? 'Fill' : 'Fit'})`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Layout: {primaryVideoCropMode === 'fit' ? 'Fit' : 'Fill'}</span>
            </button>
          )}

          <div className="w-px h-3.5 bg-white/[0.1]" />

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
      <div className="flex-1 flex items-center justify-center w-full min-h-0 relative">
        <div
          style={{ width: fitW, height: fitH }}
          className="relative shadow-2xl rounded-xl border border-neutral-800/80 overflow-hidden"
        >
        <div
          ref={canvasContainerRef}
          style={{
            width: canvasDims.width,
            height: canvasDims.height,
            aspectRatio: canvasDims.ratio,
            backgroundColor: project.canvas.background_color || '#000000',
            transform: `scale(${fitScale})`,
            transformOrigin: 'top left',
          }}
          onClick={() => onSelectItem(null)}
          className="relative overflow-hidden flex items-center justify-center"
        >
          {/* HTML5 VIDEO BASE STREAM */}
          {activeVideoSrc ? (
            <video
              ref={videoRef}
              src={activeVideoSrc}
              playsInline
              muted={project.tracks.some((t) => t.type === 'VIDEO' && t.muted)}
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = targetVideoTime;
                }
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (selectedItemId) {
                  onSelectItem(null);
                  return;
                }
                onTogglePlay();
              }}
              className="w-full h-full object-cover cursor-pointer select-none"
            style={{
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
                  )}px) scale(${interpolateKeyframes(
                    activeVideoItems[0].keyframes,
                    'scale',
                    playhead - activeVideoItems[0].timeline_start,
                    activeVideoItems[0].transform?.scale || 1
                  )}) rotate(${interpolateKeyframes(
                    activeVideoItems[0].keyframes,
                    'rotation',
                    playhead - activeVideoItems[0].timeline_start,
                    activeVideoItems[0].transform?.rotation || 0
                  )}deg)`
                : undefined,
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
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onSelectItem(item.id);
                      preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                      setIsTransformDragging(true);
                      setTransformDragMode('move');
                      setDragStartPos({ x: e.clientX, y: e.clientY });
                      setInitialTransform({ ...item.transform });
                    }}
                    style={{
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
                      WebkitTextStroke: t.stroke_width
                        ? `${t.stroke_width}px ${t.stroke_color || '#000000'}`
                        : undefined,
                      textShadow: t.shadow_color
                        ? `0 2px ${t.shadow_blur || 6}px ${t.shadow_color}`
                        : undefined,
                      zIndex: item.z_index || 20,
                    }}
                    className={`absolute pointer-events-auto cursor-move max-w-[90%] leading-tight select-none transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-white/30 ring-offset-2 ring-offset-black/80 shadow-[0_0_20px_rgba(139,92,246,0.4)]'
                        : 'hover:ring-1 hover:ring-white/40'
                    }`}
                  >
                    {displayText}

                    {/* DIRECT MANIPULATION HANDLES ATTACHED TO SELECTED TEXT */}
                    {isSelected && (
                      <>
                        {/* Scale handle (bottom-right) */}
                        <div
                          className="absolute -right-2 -bottom-2 w-4 h-4 bg-white/20 border-2 border-white rounded-full cursor-se-resize shadow pointer-events-auto"
                          title="Drag to Scale Text"
                          onMouseDown={(e) => {
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
                          className="absolute -top-7 left-1/2 -translate-x-1/2 w-5 h-5 bg-white/[0.15] border border-white/60 rounded-full flex items-center justify-center text-white cursor-pointer shadow hover:scale-110 pointer-events-auto transition"
                          title="Rotate Text"
                          onMouseDown={(e) => {
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

                return (
                  <div
                    key={item.id}
                    data-selectable-item="true"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onSelectItem(item.id);
                      preTransformProjectRef.current = JSON.parse(JSON.stringify(projectRef.current));
                      setIsTransformDragging(true);
                      setTransformDragMode('move');
                      setDragStartPos({ x: e.clientX, y: e.clientY });
                      setInitialTransform({ ...item.transform });
                    }}
                    style={{
                      transform: `translate(${posX}px, ${posY}px) scale(${scale}) rotate(${rotation}deg)`,
                      opacity,
                      zIndex: item.z_index || 15,
                    }}
                    className={`absolute pointer-events-auto cursor-move select-none transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-white/30 ring-offset-2 ring-offset-black/80 shadow-[0_0_20px_rgba(139,92,246,0.4)]'
                        : 'hover:ring-1 hover:ring-white/40'
                    }`}
                  >
                    <img
                      src={item.source_path || ''}
                      alt={item.name || 'Element Overlay'}
                      className="max-w-[280px] max-h-[280px] object-contain pointer-events-none select-none"
                      loading="eager"
                    />

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
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                            className="absolute -top-3.5 -right-3.5 w-6 h-6 bg-red-600/95 hover:bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition pointer-events-auto border border-white/90 z-20 group"
                          >
                            <Trash2 className="w-3 h-3 group-hover:scale-110 transition-transform" />
                          </button>
                        )}
                        {/* Scale handle (bottom-right) */}
                        <div
                          className="absolute -right-2 -bottom-2 w-4 h-4 bg-white/20 border-2 border-white rounded-full cursor-se-resize shadow pointer-events-auto"
                          title="Drag to Scale Element"
                          onMouseDown={(e) => {
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
                          className="absolute -top-7 left-1/2 -translate-x-1/2 w-5 h-5 bg-white/[0.15] border border-white/60 rounded-full flex items-center justify-center text-white cursor-pointer shadow hover:scale-110 pointer-events-auto transition"
                          title="Rotate Element"
                          onMouseDown={(e) => {
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

              return (
                <CaptionPresetRenderer
                  style={effectiveStyle}
                  frame={getPreviewFrame(cue, playhead, effectiveStyle)}
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
                  : currentCaptionCoords.x;
              const effY =
                captionScope === 'cue' && activeCue?.position_y !== undefined
                  ? activeCue.position_y
                  : currentCaptionCoords.y;

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
                    transform: 'translate(-50%, -50%)',
                  }}
                  data-selectable-item="true"
                  className={`absolute text-center pointer-events-auto select-none max-w-[88%] transition-opacity ${
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
                        ? 'ring-2 ring-rose-500 rounded-xl shadow-[0_0_15px_rgba(244,63,94,0.5)]'
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
                        ? 'border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                        : 'border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                    }`}
                  />
                )}
                {activeSnapGuides.y !== undefined && (
                  <div
                    style={{ top: `${activeSnapGuides.y * 100}%` }}
                    className={`absolute left-0 right-0 h-0 border-t-2 border-dashed z-30 pointer-events-none ${
                      activeSnapGuides.isDanger
                        ? 'border-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
                        : 'border-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]'
                    }`}
                  />
                )}
                {activeSnapGuides.label && (
                  <div
                    className={`absolute top-12 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full text-[11px] font-mono font-medium shadow-2xl backdrop-blur-md flex items-center gap-1.5 animate-fadeIn pointer-events-none whitespace-nowrap ${
                      activeSnapGuides.isDanger
                        ? 'bg-rose-950/95 border border-rose-500 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                        : 'bg-neutral-950/95 border border-cyan-400 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.4)]'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full animate-pulse ${
                        activeSnapGuides.isDanger ? 'bg-rose-400' : 'bg-cyan-400'
                      }`}
                    />
                    <span>{activeSnapGuides.label}</span>
                  </div>
                )}
              </>
            )}

            {/* FONT SIZE HUD DURING CORNER SCALING */}
            {fontSizeHud !== null && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full text-[11px] font-mono font-medium bg-neutral-950/95 border border-white/50 text-white shadow-[0_0_15px_rgba(167,139,250,0.4)] backdrop-blur-md flex items-center gap-1.5 animate-fadeIn pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                <span>Font Size: {fontSizeHud}px</span>
              </div>
            )}

            {/* FLOATING SCOPE PILL & QUICK PRESETS MICRO-BAR */}
            {isCaptionSelected && !isDraggingCaption && viewMode === 'edit' && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 bg-neutral-900/95 border border-neutral-700/80 rounded-xl px-2 py-1 shadow-2xl backdrop-blur-md animate-fadeIn select-none whitespace-nowrap">
                {/* Scope Toggle */}
                <div className="flex items-center bg-black/60 rounded-lg p-0.5 border border-neutral-800">
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

                {/* Quick Presets */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetPosition('top');
                  }}
                  title="Align to Safe Top (20%)"
                  className="px-2 py-0.5 rounded text-[10px] font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
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
                  className="px-2 py-0.5 rounded text-[10px] font-medium text-neutral-300 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
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
                  className="px-2 py-0.5 rounded text-[10px] font-medium text-emerald-300 hover:text-emerald-200 hover:bg-emerald-950/40 border border-emerald-500/30 transition cursor-pointer"
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
                    <div className="absolute bottom-24 z-30 px-3 py-1.5 rounded-full bg-neutral-900/95 border border-amber-500/80 shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs text-amber-300 animate-fadeIn pointer-events-auto">
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
                className="absolute w-48 h-48 border-2 border-white/40 rounded-lg pointer-events-auto cursor-move flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.25)]"
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
