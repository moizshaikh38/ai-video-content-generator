import {templateCanvasConsentKey} from '../../lib/templateCanvasConsent';
import {normalGamingManualChoices,type NormalGamingManualEnvelope} from '../../../server/src/shared/normalGamingManualChoice';
import{placementUpdate}from'../../../server/src/shared/manualVideoPlacement';
import {SourceTextReviewBanner} from './SourceTextReviewBanner';
import {initialExportResolution} from '../../../server/src/shared/initialExportResolution.js';
import {canvasForResolution} from '../../../server/src/shared/renderResolution.js';
import {HookModeControls} from './HookModeControls';
import {sourceTextReviewNotice} from '../../lib/sourceTextReviewNotice';
import {centerProjectHook, reviewHookCanvasPosition} from '../../../server/src/shared/hookCanvasPosition';
import {applyHookDisplayMode, applyHookPreset, hookMode, hookPresetLinked, hookPresetSupported, hookPresetIssue, type HookDisplayMode} from '../../../server/src/shared/hookDisplayMode';
import {freshPresetTypography} from '../../../server/src/shared/freshPresetTypography';
import {applyCuePosition,resetCuePosition} from '../../lib/cuePosition';
import{measuredPanelChoicesForManualPick}from'../../../server/src/shared/measuredPanelChoice';
import {expandSceneLayoutItem,resolveSceneLayoutItem,sceneCropPanelUpdate} from '../../../server/src/shared/sceneLayoutOverrides';
import {resolvePreviewItemPlan,type PreviewMeasuredPlanEnvelope} from '../../../server/src/shared/previewItemAutomaticPlan';
import {normalizeEditorCanvasAspect} from '../../../server/src/shared/editorCanvasAspect';
import {setProjectAutoCandidate,projectAutoCandidate,projectAutoCandidateState} from '../../../server/src/shared/automaticLayoutCandidate';
import { applyLayoutAtSourceTime, applyWholeClipLayout, readItemLayout, applyFramingStrategy, applyDisplayedPanelCrop } from '../../lib/itemLayout';
import { applyPlanSceneToProject, FRAMING_WINDOW_PREVIEW_PARITY, type PlanShot } from '../../../server/src/shared/framingWindow';
import { SceneLayoutGrid } from './SceneLayoutMenu';
import { captionLegacyColorDefaults } from '../../lib/captionPresets';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useJournalIssue } from '../../lib/editorJournal';
import {
  EditorProject,
  RenderedClip,
  TimedCaptionCue,
  EditorTrackItem,
  EditorTrack,
  EditorCaptionItem,
} from '../../types';
import {FONT_EM_PER_ASS_SIZE, isRenderablePresetId, resolveCaptionPreset, NEW_CAPTION_PRESET_ID} from '../../../server/src/shared/captionPresets';
import { applyPresetToEditorCaption, CaptionPresetId, RenderableCaptionPresetId } from '../../lib/captionPresets';
import { CreditService } from '../../services/creditService';
import { useEditorPlayback } from '../../hooks/useEditorPlayback';
import { useEditorSelection, SidebarTab, AiToolType } from '../../hooks/useEditorSelection';
import { useEditorShortcuts } from '../../hooks/useEditorShortcuts';
import { useEditorRender } from '../../hooks/useEditorRender';
import { UpdateProjectOptions } from '../../hooks/useEditorProject';
import { EditorTopBar } from './EditorTopBar';
import { EditorSidebar, PRIMARY_TABS } from './EditorSidebar';
import { PreviewCanvas } from './PreviewCanvas';
import { PlaybackController } from './PlaybackController';
import { ContextualInspector } from './ContextualInspector';
import { TranscriptEditor } from './TranscriptEditor';
import { UnifiedTimeline } from './UnifiedTimeline';
import { ExportDialog } from './ExportDialog';
import { MediaBin } from './MediaBin';
import { CommandPalette } from './CommandPalette';
import { AICopilotPanel } from './AICopilotPanel';
import { AudioWorkspacePanel } from './AudioWorkspacePanel';
import { MotionWorkspacePanel } from './MotionWorkspacePanel';
import { FramingWorkspacePanel } from './FramingWorkspacePanel';
import { AspectRatioWorkspacePanel } from './AspectRatioWorkspacePanel';
import { AiToolsPanel } from './AiToolsPanel';
import { BrandKitPanel } from './BrandKitPanel';
import { TextWorkspacePanel } from './TextWorkspacePanel';
import { ElementsWorkspacePanel, ElementMediaItem } from './ElementsWorkspacePanel';
import { ProducerPanel } from '../producer/ProducerPanel';
import { TranslationWorkspace } from '../translation/TranslationWorkspace';
import { ContentPackWorkspace } from '../contentPack/ContentPackWorkspace';
import { HookLabWorkspace } from '../hookLab/HookLabWorkspace';
import { ThumbnailLabWorkspace } from '../thumbnailLab/ThumbnailLabWorkspace';
import { AutopilotWorkspace } from '../autopilot/AutopilotWorkspace';
import { ABStudioWorkspace } from '../abStudio/ABStudioWorkspace';
import { ArrowLeft, Sparkles, Type as TypeIcon, Film, X, PanelRightOpen } from 'lucide-react';
import { insertIntroOutro, createTitleCardItem } from '../../utils/introOutro';
import { initCoveredEnd, healCaptionTracks } from '../../lib/captionExtendMerge';
import { clipRenderService, type ExportResolution } from '../../services/clipRenderService';
import { applyOutputTemplateToProject, getOutputTemplate, OutputTemplateId } from '../../../server/src/shared/outputTemplates';

interface EditorShellProps {
  clip: RenderedClip;
  project: EditorProject;
  cleanSourceUrl: string | null;
  renderedPreviewUrl: string | null;
  watermarkRequired: boolean;
  cues: TimedCaptionCue[];
  canUndo: boolean;
  canRedo: boolean;
  saveStatus: 'saved' | 'saving' | 'dirty' | 'error';
  persistedReframeSourceKey?: string | null;
  saveError: string | null;
  onSaveNow: () => void | Promise<boolean>;
  onUndo: () => void;
  onRedo: () => void;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject, options?: UpdateProjectOptions) => void;
  onCommitProject?: (preOperationProject: EditorProject) => void;
  onUpdateTrackItem: (trackId: string, itemId: string, updates: Partial<EditorTrackItem>, options?: UpdateProjectOptions) => void;
  onUpdateCueText: (cueId: string, newText: string) => void;
  onDeleteCue: (cueId: string, cutMedia?: boolean) => void;
  onDeleteTimeRange?: (startSec: number, endSec: number) => void;
  onDeleteTimeRanges?: (ranges: Array<{ startSec: number; endSec: number }>) => void;
  onReplaceWordGlobally?: (targetWord: string, replacementWord: string) => void;
  onUpdateWordTiming?: (cueId: string, wordIndex: number, newStart: number, newEnd: number) => void;
  onSplitTrackItem: (trackId: string, itemId: string, splitTime: number) => void;
  onDeleteTrackItem?: (trackId: string, itemId: string) => void;
  onRippleDeleteTrackItem: (trackId: string, itemId: string) => void;
  onDuplicateTrackItem: (trackId: string, itemId: string) => void;
  onReloadData: (options?: { silent?: boolean }) => Promise<void>;
}

// Phones in short landscape (e.g. 844x390): height, not width, is the binding constraint.
export const isShortLandscapeViewport = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(max-height: 600px) and (max-width: 1023.9px)').matches;

export const EditorShell: React.FC<EditorShellProps> = ({
  clip,
  project,
  cleanSourceUrl,
  renderedPreviewUrl,
  watermarkRequired,
  cues,
  canUndo,
  canRedo,
  saveStatus,
  persistedReframeSourceKey,
  saveError,
  onSaveNow,
  onUndo,
  onRedo,
  onUpdateProject,
  onCommitProject,
  onUpdateTrackItem,
  onUpdateCueText,
  onDeleteCue,
  onDeleteTimeRange,
  onDeleteTimeRanges,
  onReplaceWordGlobally,
  onUpdateWordTiming,
  onSplitTrackItem,
  onDeleteTrackItem,
  onRippleDeleteTrackItem,
  onDuplicateTrackItem,
  onReloadData,
}) => {
  const navigate = useNavigate();

  // Selection & UI Presets hook
  const {
    selectedItemId,
    selectedTrackId,
    selectedCueId,
    activeSidebarTab,
    activeAiTool,
    viewMode,
    selectItem,
    selectCue,
    setActiveSidebarTab,
    setActiveAiTool,
    setViewMode,
    clearSelection,
  } = useEditorSelection('captions');

  // Determine if active playback source is the raw unclipped video or pre-rendered MP4
  const isCleanSource = viewMode === 'edit' || !renderedPreviewUrl;
  const primaryVideoItem = project.tracks
    ?.find((t) => t.type === 'VIDEO' && !t.hidden)
    ?.items?.[0];
  const sourceOffset = isCleanSource
    ? (primaryVideoItem?.source_start ?? (Number(clip.start_seconds || 0) + Number(clip.trim_start_offset || 0)))
    : 0;

  // Playback hook
  const {
    videoRef,
    currentTime,
    duration,
    isPlaying, isMediaAdvancing,
    playbackRate,
    volume,
    isMuted,
    isLooping,
    showSafeGuides,
    previewQuality,
    togglePlay,
    pauseForEdit,
    seek,
    stepFrames,
    setVolume,
    toggleMute,
    setPlaybackRate,
    toggleLoop,
    toggleSafeGuides,
    setPreviewQuality,
    formatTime,
  } = useEditorPlayback({
    initialDuration: project.canvas.duration || 30,
    initialTime: project.playhead || 0,
    fps: project.canvas.fps || 30,
    sourceOffset,
    sourceSlices: isCleanSource ? (project.tracks.find(t => t.type === 'VIDEO' && !t.hidden)?.items || [])
      .filter(i => !i.hidden && !(i as any).is_title_card && !(i as any).is_freeze)
      .slice().sort((a,b) => a.timeline_start-b.timeline_start) : [],
    onTimeUpdate: (t) => {
      // Keep playhead aligned in project
      project.playhead = t;
    },
  });

  // Render & Export hook
  const {
    isRendering,
    renderProgress,
    renderStage,
    renderError,
    renderSuccessMsg,
    triggerRender,
    clearRenderStatus,
    resolveSavedRequest,
  } = useEditorRender({
    clipId: clip.id,
    onRenderComplete: () => {
      onReloadData({ silent: true });
    },
  });

  // Dialogs state
  const [geometryResolution,setGeometryResolution]=useState<ExportResolution>(()=>initialExportResolution(clip));
  useEffect(()=>{setGeometryResolution(initialExportResolution(clip));},[clip.id]);
  const geometryOutputSize=canvasForResolution(project.canvas.aspect_ratio,geometryResolution);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState<boolean>(false);
  // Concise notice when an extend cannot supply full caption coverage
  // (missing/short transcript) or the coverage fetch fails after extending.
  const [extendCaptionNotice, setExtendCaptionNotice] = useState<string | null>(null);
  // Split-layout caption zones: reframe keyframes + measured speaker anchors
  // for the preview's export-parity caption attribution (speakerSplit).
  const [speakerSplitData, setSpeakerSplit] = useState<{
    keyframes: Array<{ time: number; centerX: number }>;
    speaker1X: number | null;
    speaker2X: number | null;
    splitGeometry?: {
      speaker1: { x: number; y: number; windowW: number };
      speaker2: { x: number; y: number; windowW: number };
    } | null;
    measuredCapabilities?: import('../../../server/src/shared/measuredReframeCapabilities').MeasuredReframeCapabilities|null;
    shotComposition?: Array<{start:number;end:number;kind:'group'|'solo'|'fit';split?:{speaker1X:number;speaker2X:number;dividerX:number;focusPanels?:import('../../../server/src/shared/panelLayouts').ItemPanels};windowW:number;windowH:number;keyframes:Array<{time:number;centerX:number;centerY:number}>}> | null;
    contentFramingDecision?: import('../../../server/src/shared/contentFramingDecision').ContentFramingDecision | null;
    bareSmartSplitReview?:import('../../../server/src/shared/automaticSplitEvidence').BareSmartSplitReview|null;
    analyzedTrimStart?: number;
    groupFrame?: {
      keyframes: Array<{ time: number; centerX: number; centerY: number }>;
      windowW: number;
      /** Composition window height (fraction of source height) when face
       * sizes are known; absent = legacy 4:3 window. */
      windowH?: number;
      sourceWidth: number;
      sourceHeight: number;
    } | null;
    lowConfidenceTrack?: boolean;
    analyzedSourcePath?: string | null;
    sourceWidth?: number | null;
    sourceHeight?: number | null;
    analysisVersion?: number | null;
  } | null>(null);
  const [normalGamingOption,setNormalGamingOption]=useState<NormalGamingManualEnvelope|null>(null);
  const autoCandidateEnabled=projectAutoCandidate(project);
  const [stableShotComposition,setStableShotComposition]=useState<NonNullable<typeof speakerSplitData>['shotComposition']>(null);
  const [adaptivePlanExpected,setAdaptivePlanExpected]=useState(false);
  const [candidatePlanEnvelope,setCandidatePlanEnvelope]=useState<PreviewMeasuredPlanEnvelope|null>(null);
  const [stablePlanEnvelope,setStablePlanEnvelope]=useState<PreviewMeasuredPlanEnvelope|null>(null);
  const activeCandidateBase=project.tracks.find(t=>t.type==='VIDEO'&&!t.hidden)?.items.find(i=>!i.hidden&&currentTime>=i.timeline_start&&(currentTime<i.timeline_end||(currentTime===project.canvas.duration&&currentTime===i.timeline_end)));
  const activeCandidateSourceTime=activeCandidateBase?activeCandidateBase.source_start+(currentTime-activeCandidateBase.timeline_start)*(activeCandidateBase.speed?.speed||1):0;
  const activeCandidateScenes=React.useMemo(()=>{try{return activeCandidateBase?expandSceneLayoutItem(activeCandidateBase):[];}catch{return[];}},[activeCandidateBase]);
  const activeCandidateItem=activeCandidateScenes.find(i=>activeCandidateSourceTime>=i.source_start&&(activeCandidateSourceTime<i.source_end||(currentTime===project.canvas.duration&&activeCandidateSourceTime===i.source_end)));
  const activeCandidate=activeCandidateItem?.crop_config?.automaticLayoutCandidate==='review-v1';
  const activeEnvelope=activeCandidate?candidatePlanEnvelope:stablePlanEnvelope;
  const [warnDetailsOpen, setWarnDetailsOpen] = useState(false);
  const sourceReviewNotice = React.useMemo(() => sourceTextReviewNotice(clip), [clip]);
  const previewItemPlan=adaptivePlanExpected&&activeCandidateBase?(activeCandidateItem?resolvePreviewItemPlan(activeCandidateItem,activeEnvelope,{sourceAssetId:clip.id,sourcePath:clip.source_storage_path,outputAspect:project.canvas.aspect_ratio,layoutPolicy:clip.crop_config?.layoutPolicy,sourceVersion:(clip as any).selection_source_receipt?.source_receipt?.sha256}):{status:'unavailable' as const,reason:'effective-scene-clock-invalid'}):null;
  const automaticPlanReviewRequired=previewItemPlan?.status==='unavailable';
  const compositionSourceStart=previewItemPlan?.status==='ready'?previewItemPlan.identity.analysisSourceStart:(Number(clip?.start_seconds)||0)+(speakerSplitData?.analyzedTrimStart||0);
  const selectedComposition=previewItemPlan?.status==='ready'?previewItemPlan.shots as NonNullable<typeof speakerSplitData>['shotComposition']:adaptivePlanExpected?null:activeCandidate?speakerSplitData?.shotComposition:stableShotComposition;
  const speakerSplit=automaticPlanReviewRequired?null:speakerSplitData?{...speakerSplitData,shotComposition:selectedComposition}:null;
  const measuredParticipantChoices=adaptivePlanExpected?measuredPanelChoicesForManualPick(activeCandidateItem?{...activeCandidateItem,id:activeCandidateBase?.id}:undefined,activeEnvelope,{sourceAssetId:clip.id,sourcePath:clip.source_storage_path,outputAspect:project.canvas.aspect_ratio,layoutPolicy:clip.crop_config?.layoutPolicy,sourceVersion:(clip as any).selection_source_receipt?.source_receipt?.sha256}):undefined;
  // Late template analysis may never update another clip, project or source,
  // including A -> B -> A navigation and unmount/reopen of the same identity.
  const seedIdentityKey=JSON.stringify([clip.id,project.id,clip.source_storage_path,(clip as any).selection_source_receipt?.source_receipt?.sha256,persistedReframeSourceKey]);
  const seedIdentityRef=useRef({key:seedIdentityKey,version:0});
  if(seedIdentityRef.current.key!==seedIdentityKey)seedIdentityRef.current={key:seedIdentityKey,version:seedIdentityRef.current.version+1};
  const splitSeedSequence=useRef(0),hookSeedSequence=useRef(0);
  useEffect(()=>()=>{seedIdentityRef.current.version++;splitSeedSequence.current++;hookSeedSequence.current++},[]);
  const currentSourceVersionRef=useRef<string|undefined>(undefined);currentSourceVersionRef.current=(clip as any).selection_source_receipt?.source_receipt?.sha256;
  const measuredGamingChoices=normalGamingManualChoices(activeCandidateItem?{...activeCandidateItem,id:activeCandidateBase?.id}:undefined,normalGamingOption,{sourceAssetId:clip.id,sourcePath:clip.source_storage_path,outputAspect:project.canvas.aspect_ratio,layoutPolicy:clip.crop_config?.layoutPolicy,sourceVersion:(clip as any).selection_source_receipt?.source_receipt?.sha256});
  const measuredPanelChoices=[...(measuredParticipantChoices||[]),...(measuredGamingChoices||[])];
  const manualGamingSideReview=activeCandidateItem?.panels?.layout==='gameplay'&&activeCandidateItem.panels.slots?.some(s=>s.sourceRect);
  useEffect(() => {
    let cancelled = false;
    setSpeakerSplit(null);
    setNormalGamingOption(null);
    setAdaptivePlanExpected(false);setCandidatePlanEnvelope(null);setStablePlanEnvelope(null);
    if (!clip?.id) return;
    Promise.all([clipRenderService.getClipReframe(clip.id,true),clipRenderService.getClipReframe(clip.id,false)])
      .then(([r,stable]) => {
        if (cancelled) return;
        setNormalGamingOption(stable.normalGamingManualEnvelope??null);
        setAdaptivePlanExpected(Boolean(r.adaptiveComposition||stable.adaptiveComposition));
        setCandidatePlanEnvelope(r.measuredPlanEnvelope??null);setStablePlanEnvelope(stable.measuredPlanEnvelope??null);
        setStableShotComposition(stable.status==='ready'&&!stable.isStale?stable.shotComposition??null:null);
        if (r.status === 'ready' && !r.isStale && Array.isArray(r.smoothedKeyframes) && r.smoothedKeyframes.length > 0) {
          setSpeakerSplit({
            keyframes: r.smoothedKeyframes.map((k) => ({ time: Number(k.time), centerX: Number(k.centerX) })),
            speaker1X: typeof r.speaker1X === 'number' ? r.speaker1X : null,
            speaker2X: typeof r.speaker2X === 'number' ? r.speaker2X : null,
            splitGeometry: r.splitGeometry ?? null,
            groupFrame: r.groupFrame ?? null,
            shotComposition: r.shotComposition ?? null,
            measuredCapabilities: r.measuredCapabilities ?? null,
            contentFramingDecision: r.contentFramingDecision ?? null,
            bareSmartSplitReview: r.bareSmartSplitReview ?? null,
            analyzedTrimStart: Number(r.analyzedTrimStart) || 0,
            lowConfidenceTrack: Boolean(r.lowConfidenceTrack),
            analyzedSourcePath: typeof r.analyzedSourcePath === 'string' ? r.analyzedSourcePath : null,
            sourceWidth: Number.isFinite(r.sourceWidth) ? Number(r.sourceWidth) : null,
            sourceHeight: Number.isFinite(r.sourceHeight) ? Number(r.sourceHeight) : null,
            analysisVersion: Number.isFinite(r.analysisVersion) ? Number(r.analysisVersion) : null,
          });
        }
      })
      .catch(() => {
        // No reframe data: split captions render at the default band.
      });
    return () => {
      cancelled = true;
    };
  }, [clip?.id, persistedReframeSourceKey]);
  // Non-destructive reason when an action is refused (e.g. locked followers).
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [templateConsent,setTemplateConsent]=useState<{templateId:OutputTemplateId;name:string;aspect:string;canvasKey:string;consentKey:string;identityVersion:number}|null>(null);
  // Refusal feedback for canvas turn-off controls: shown in normal flow above the canvas (the transcript notice area is collapsed on phones).
  const [lockNotice, setLockNotice] = useState<string | null>(null);
  const journalIssue = useJournalIssue(project);
  const saveStatusRef = useRef(saveStatus); saveStatusRef.current = saveStatus;
  // Back to project: wait for the project save and clip sync to finish. If saving failed, ask before discarding.
  // Single-flight, and cancelled when this editor unmounts or the clip changes, so a stale wait can never prompt or navigate elsewhere.
  const backBusyRef = useRef(false);
  const backTokenRef = useRef(0);
  useEffect(() => () => { backTokenRef.current += 1; backBusyRef.current = false; }, [clip.id]);
  const guardedBack = useCallback(async () => {
    if (backBusyRef.current) return;
    backBusyRef.current = true;
    const token = backTokenRef.current;
    const alive = () => backTokenRef.current === token;
    const go = () => { if (alive()) navigate(`/projects/${clip.project_id}`); };
    try {
      for (let i = 0; i < 30; i++) {
        if (!alive()) return;
        const st = saveStatusRef.current;
        if (st === 'saved') { go(); return; }
        if (st === 'error') {
          if (window.confirm('Your latest changes could not be saved. Leave anyway and discard them?')) go();
          return;
        }
        if (st === 'dirty') { void onSaveNow(); }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (alive() && window.confirm('Saving is taking longer than expected. Leave anyway?')) go();
    } finally {
      if (alive()) backBusyRef.current = false;
    }
  }, [navigate, clip.project_id, clip.id, onSaveNow]);
  useEffect(() => { if (!lockNotice) return; const t = window.setTimeout(() => setLockNotice(null), 7000); return () => window.clearTimeout(t); }, [lockNotice]);
  const hookPositionReview = React.useMemo(() => reviewHookCanvasPosition(project as any), [project]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  // Export staleness: caption setting changed after the last completed render;
  // the previously rendered file must not be offered as the changed export.
  const [exportStale, setExportStale] = useState<boolean>(false);
  // Last non-'none' caption preset, so Captions Off/On restores the chosen style.
  const [lastCaptionPreset, setLastCaptionPreset] = useState<RenderableCaptionPresetId>(NEW_CAPTION_PRESET_ID);
  // Plan-allowed caption presets (null until loaded). Applying a premium preset
  // the plan does not include would make every subsequent save fail with
  // PRESET_RESTRICTED (the save endpoint enforces the same list), so resolve to
  // a free fallback at apply time instead. Fail-open while unloaded: the save
  // endpoint remains the backstop, matching SubtitleEditor's gallery behavior.
  const [allowedCaptionPresets, setAllowedCaptionPresets] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    CreditService.getUserEntitlements()
      .then((e) => {
        if (!cancelled) setAllowedCaptionPresets((e.allowedSubtitlePresets || []).map((x) => x.toLowerCase()));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const resolvePlanAllowedPreset = useCallback((preset: RenderableCaptionPresetId): RenderableCaptionPresetId => {
    if (!allowedCaptionPresets) return preset;
    if (allowedCaptionPresets.includes('*')) return preset; // pro/studio wildcard
    // Fallback must be both plan-free and a renderable preset (CAPTION_PRESETS
    // has no 'clean' entry; the output-template mapper resolves preset colors).
    return allowedCaptionPresets.includes(preset.toLowerCase()) ? preset : 'simple';
  }, [allowedCaptionPresets]);
  // Intro/outro: which menu is open, and a pending position armed for the next media pick.
  const [introOutroMenu, setIntroOutroMenu] = useState<'intro' | 'outro' | null>(null);
  const [pendingIntroOutro, setPendingIntroOutro] = useState<'intro' | 'outro' | null>(null);
  // Timeline visibility state (persisted presentation preference, decoupled from project undo/redo history)
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('vireo_editor_timeline_collapsed');
      if (stored !== null) return stored === 'true';
    } catch {}
    // Phones in landscape have too little vertical room for preview + timeline;
    // default to collapsed (still one tap to reopen) so the preview stays visible.
    if (typeof window !== 'undefined' && window.innerHeight < 480 && window.innerWidth < 1024) return true;
    return false;
  });

  const handleToggleTimelineCollapse = () => {
    setIsTimelineCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('vireo_editor_timeline_collapsed', String(next));
      } catch {}
      return next;
    });
    // Short landscape phones: not enough vertical room for a bottom sheet AND the timeline.
    // Expanding the timeline closes any open sheet (one bottom region at a time).
    if (isTimelineCollapsed && isShortLandscapeViewport()) {
      setTranscriptCollapsed(true);
      setInspectorCollapsed(true);
      if (isDrawerTab) setActiveSidebarTab('transcript');
    }
  };

  // Responsive screen size tracking (< 1280px mutual exclusion between Left Drawer & Right Inspector)
  const [windowWidth, setWindowWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isCompactScreen = windowWidth < 1280;

  // UI-only inspector collapse: lets the stage reclaim the right column's width when toggled.
  const [inspectorCollapsed, setInspectorCollapsed] = useState<boolean>(() => {
    try {
      // Compact phone sheets must not cover the stage on every fresh open.
      // Selecting Captions explicitly reopens the sheet; desktop keeps its preference.
      if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
      return localStorage.getItem('vireo_inspector_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const toggleInspectorCollapsed = useCallback(() => {
    setInspectorCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem('vireo_inspector_collapsed', next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);

  const isDrawerTab =
    activeSidebarTab === 'media' ||
    activeSidebarTab === 'broll' ||
    activeSidebarTab === 'translate' ||
    activeSidebarTab === 'copilot' ||
    activeSidebarTab === 'ai_tools' ||
    activeSidebarTab === 'audio' ||
    activeSidebarTab === 'brand' ||
    activeSidebarTab === 'text' ||
    activeSidebarTab === 'elements' ||
    activeSidebarTab === 'layout' ||
    activeSidebarTab === 'framing' ||
    activeSidebarTab === 'aspect_ratio';

  const showLeftDrawer = isDrawerTab && (!isCompactScreen || !selectedItemId);
  const showRightInspector = !showLeftDrawer && activeSidebarTab !== 'transcript';

  // Transcript dock (far right). UI-only, persisted per viewer — never touches project state.
  // Defaults collapsed on narrower screens so the stage keeps its share of the width.
  const [transcriptCollapsed, setTranscriptCollapsed] = useState<boolean>(() => {
    // Phone: the dock is a bottom sheet that would cover the tool panels, so it always starts closed.
    if (typeof window !== 'undefined' && window.innerWidth < 768) return true;
    try {
      const stored = localStorage.getItem('vireo_transcript_collapsed');
      if (stored !== null) return stored === '1';
    } catch {}
    return typeof window !== 'undefined' && window.innerWidth < 1280;
  });
  const toggleTranscriptCollapsed = useCallback(() => {
    setTranscriptCollapsed((v) => {
      const next = !v;
      // Phone: opening the transcript sheet hides the tool sheet (one bottom sheet at a time).
      if (!next && typeof window !== 'undefined' && window.innerWidth < 768) setActiveSidebarTab('transcript');
      try {
        localStorage.setItem('vireo_transcript_collapsed', next ? '1' : '0');
      } catch {}
      return next;
    });
  }, []);

  // Short landscape: opening any bottom sheet collapses the timeline, so the preview and the
  // sheet never fight the expanded timeline for the same 390px-tall screen.
  const anyBottomSheetOpen = showLeftDrawer || (showRightInspector && !inspectorCollapsed) || !transcriptCollapsed;
  useEffect(() => {
    if (anyBottomSheetOpen && !isTimelineCollapsed && isShortLandscapeViewport()) {
      setIsTimelineCollapsed(true);
      try {
        localStorage.setItem('vireo_editor_timeline_collapsed', 'true');
      } catch {}
    }
  }, [anyBottomSheetOpen, isTimelineCollapsed]);

  const [timelineHeight, setTimelineHeight] = useState<number>(() => {
    try {
      const s = localStorage.getItem('vireo_timeline_height');
      if (s) {
        const val = parseInt(s, 10);
        if (!isNaN(val) && val >= 140 && val <= 450) return val;
      }
    } catch {}
    return 240;
  });

  // Horizontal divider resize handler (Timeline Height)
  const handleStartResizeTimeline = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = timelineHeight;
    let latestH = startH;

    const onPointerMove = (ev: PointerEvent) => {
      const newH = Math.max(140, Math.min(450, startH + (startY - ev.clientY)));
      latestH = newH;
      setTimelineHeight(newH);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      try {
        localStorage.setItem('vireo_timeline_height', String(latestH));
      } catch {}
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  // Global Keyboard Shortcuts
  useEditorShortcuts({
    onTogglePlay: togglePlay,
    onUndo,
    onRedo,
    onSave: onSaveNow,
    onDeleteSelected: () => {
      if (selectedItemId && selectedTrackId) {
        const track = project.tracks.find((t) => t.id === selectedTrackId);
        if (track?.type === 'OVERLAY' || track?.type === 'IMAGE') {
          if (onDeleteTrackItem) {
            onDeleteTrackItem(selectedTrackId, selectedItemId);
          } else {
            onUpdateProject((prev) => ({
              ...prev,
              tracks: prev.tracks.map((t) =>
                t.id === selectedTrackId
                  ? { ...t, items: t.items.filter((i) => i.id !== selectedItemId) }
                  : t
              ),
            }));
          }
        } else {
          onRippleDeleteTrackItem(selectedTrackId, selectedItemId);
        }
        clearSelection();
      }
    },
    onSplit: () => {
      if (selectedItemId && selectedTrackId) {
        onSplitTrackItem(selectedTrackId, selectedItemId, currentTime);
      }
    },
    onStepFrame: stepFrames,
    onToggleCommandPalette: () => setIsCommandPaletteOpen((prev) => !prev),
    onEscape: () => {
      clearSelection();
      setIsExportDialogOpen(false);
      clearRenderStatus();
      setIsCommandPaletteOpen(false);
    },
  });

  // Freeze frame: split the selected video item at the playhead and insert a
  // still segment holding that exact source frame. Later content ripples by
  // the freeze duration and caption cues/words shift with it, so speech and
  // burned text stay aligned across the hold. One history step.
  const FREEZE_DURATION_SEC = 2;
  const handleFreezeFrame = () => {
    if (!selectedItemId || !selectedTrackId) return;
    const track = project.tracks.find((t) => t.id === selectedTrackId);
    const item = track?.items.find((i) => i.id === selectedItemId);
    if (!track || !item || track.type !== 'VIDEO' || item.is_freeze) return;
    const t = currentTime;
    if (t <= item.timeline_start + 0.05 || t >= item.timeline_end - 0.05) return;
    // Refuse the freeze when a locked track holds content past the freeze
    // point: everything else ripples +dur, which would silently misalign the
    // locked content (consistent with scene reorder's locked-follower block).
    const lockedHit = project.tracks.some(
      (tr) => tr.locked && tr.items.some((it) => it.timeline_end > t)
    );
    if (lockedHit) {
      setActionNotice('Freeze not applied: a locked track has content past the playhead. Unlock it first - nothing was changed.');
      return;
    }
    const dur = FREEZE_DURATION_SEC;
    const itemSpeed = item.speed?.speed || 1;
    const srcTime = item.source_start + (t - item.timeline_start) * itemSpeed;
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    onUpdateProject((prev) => ({
      ...prev,
      // The freeze extends the timeline; the canvas must grow with it or the
      // tail of the clip falls off the end of preview and export.
      canvas: { ...prev.canvas, duration: r3(prev.canvas.duration + dur) },
      tracks: prev.tracks.map((tr) => {
        if (tr.locked) return tr;
        const items: EditorTrackItem[] = [];
        for (const it of tr.items) {
          if (it.timeline_end <= t) {
            items.push(it);
            continue;
          }
          if (it.timeline_start >= t) {
            const shifted: EditorTrackItem = {
              ...it,
              timeline_start: r3(it.timeline_start + dur),
              timeline_end: r3(it.timeline_end + dur),
            };
            if (tr.type === 'CAPTION' && it.caption && Array.isArray(it.caption.cues)) {
              shifted.caption = {
                ...it.caption,
                cues: it.caption.cues.map((c: any) => ({
                  ...c,
                  start: r3(c.start + dur),
                  end: r3(c.end + dur),
                  words: Array.isArray(c.words)
                    ? c.words.map((w: any) => ({ ...w, start: r3(w.start + dur), end: r3(w.end + dur) }))
                    : c.words,
                })),
              };
            }
            items.push(shifted);
            continue;
          }
          if (tr.id === selectedTrackId && it.id === selectedItemId) {
            const left: EditorTrackItem = { ...it, timeline_end: r3(t), source_end: r3(srcTime) };
            const freeze: EditorTrackItem = {
              ...it,
              id: crypto.randomUUID(),
              type: 'IMAGE',
              is_freeze: true,
              freeze_source_time: r3(srcTime),
              timeline_start: r3(t),
              timeline_end: r3(t + dur),
              source_start: r3(srcTime),
              source_end: r3(srcTime + 0.1),
              muted: true,
            };
            const right: EditorTrackItem = {
              ...it,
              id: crypto.randomUUID(),
              timeline_start: r3(t + dur),
              timeline_end: r3(it.timeline_end + dur),
              source_start: r3(srcTime),
            };
            items.push(left, freeze, right);
            continue;
          }
          if (tr.type === 'CAPTION' && it.caption && Array.isArray(it.caption.cues)) {
            // Caption item spans the freeze: stretch its span; cues after t
            // shift with the ripple, a cue straddling t stretches over the
            // hold and only its post-freeze words move.
            const cues = it.caption.cues.map((c: any) => {
              if (c.start >= t) {
                return {
                  ...c,
                  start: r3(c.start + dur),
                  end: r3(c.end + dur),
                  words: Array.isArray(c.words)
                    ? c.words.map((w: any) => ({ ...w, start: r3(w.start + dur), end: r3(w.end + dur) }))
                    : c.words,
                };
              }
              if (c.end > t) {
                return {
                  ...c,
                  end: r3(c.end + dur),
                  words: Array.isArray(c.words)
                    ? c.words.map((w: any) =>
                        w.start >= t ? { ...w, start: r3(w.start + dur), end: r3(w.end + dur) } : w
                      )
                    : c.words,
                };
              }
              return c;
            });
            items.push({ ...it, timeline_end: r3(it.timeline_end + dur), caption: { ...it.caption, cues } });
            continue;
          }
          if (tr.type === 'AUDIO' && it.source_path) {
            // Speech/music pauses during the hold: split and shift.
            const aSpeed = it.speed?.speed || 1;
            const aSrc = it.source_start + (t - it.timeline_start) * aSpeed;
            items.push(
              { ...it, timeline_end: r3(t), source_end: r3(aSrc) },
              {
                ...it,
                id: crypto.randomUUID(),
                timeline_start: r3(t + dur),
                timeline_end: r3(it.timeline_end + dur),
                source_start: r3(aSrc),
              }
            );
            continue;
          }
          // Static overlays stretch over the freeze.
          items.push({ ...it, timeline_end: r3(it.timeline_end + dur) });
        }
        return { ...tr, items };
      }),
    }));
  };

  // Smart-reframe track for the base-video preview pan. The export reads the
  // same track (clip.crop_config.mode === 'smart' -> ReframeTrackRecord); the
  // preview mirrors its crop window via PreviewCanvas. Fetched again after a successfully persisted framing-source change.
  const [smartReframe, setSmartReframe] = useState<{
    keyframes: Array<{ time: number; centerX: number; centerY?: number }>;
    clipStartSec?: number;
  } | null>(null);
  // Layout helpers consume source-clock windows; fetched tracks are clip-relative.
  const layoutSubjectKeyframes=React.useMemo(()=>smartReframe?.keyframes.map(k=>({...k,time:k.time+(smartReframe.clipStartSec||0)}))??null,[smartReframe]);
  const layoutSubjectSourceSize=speakerSplitData?.sourceWidth&&speakerSplitData?.sourceHeight?{width:speakerSplitData.sourceWidth,height:speakerSplitData.sourceHeight}:undefined;
  useEffect(() => {
    const clipId = clip?.id;
    const mode = (clip?.crop_config as { mode?: string } | null | undefined)?.mode;
    if (!clipId || mode !== 'smart') {
      setSmartReframe(null);
      return;
    }
    let cancelled = false;
    void clipRenderService
      .getClipReframe(clipId)
      .then((r) => {
        if (cancelled) return;
        const kfs = Array.isArray(r.smoothedKeyframes) ? r.smoothedKeyframes : [];
        // Stale tracks mirror the export's resolveReframeDecision: it falls
        // back to center (reason stale_track), so the preview must not pan
        // on them either.
        if (r.status === 'ready' && kfs.length > 0 && !r.isStale) {
          setSmartReframe({ keyframes: kfs, clipStartSec: Number(clip?.start_seconds) || 0 });
        } else {
          setSmartReframe(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSmartReframe(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clip?.id, (clip?.crop_config as { mode?: string } | null | undefined)?.mode, persistedReframeSourceKey]);

  // Split speaker-anchor seeding, shared by the panel's Split button and the
  // Podcast Split output template: fetch measured analysis anchors (GET
  // /clips/:id/reframe) and seed item.crop_config.split. Existing values are
  // user picks (panel sliders) and are never overwritten; when analysis has
  // no credible pair the symmetric defaults apply.
  const seedSplitAnchorsFromAnalysis = () => {
    if (!clip?.id) return;
    const identityVersion=seedIdentityRef.current.version,sequence=++splitSeedSequence.current;
    const currentSeed=()=>seedIdentityRef.current.version===identityVersion&&splitSeedSequence.current===sequence;
    const item = project.tracks.find((t) => t.type === 'VIDEO')?.items[0] as any;
    const existing = item?.crop_config?.split;
    if (Number.isFinite(existing?.speaker1X) && Number.isFinite(existing?.speaker2X)) return;
    void clipRenderService
      .getClipReframe(clip.id)
      .then((r) => {
        if(!currentSeed()||r.status!=='ready'||r.isStale!==false)return;
        const s1 = typeof r.speaker1X === 'number' && Number.isFinite(r.speaker1X) ? r.speaker1X : 0.25;
        const s2 = typeof r.speaker2X === 'number' && Number.isFinite(r.speaker2X) ? r.speaker2X : 0.75;
        onUpdateProject((prev) => !currentSeed()?prev:({
          ...prev,
          tracks: prev.tracks.map((t) => {
            if (t.type !== 'VIDEO'||t.locked) return t;
            return {
              ...t,
              items: t.items.map((i: any) => {
                if(i.locked)return i;
                const cur = i?.crop_config?.split;
                if (Number.isFinite(cur?.speaker1X) && Number.isFinite(cur?.speaker2X)) return i;
                return {
                  ...i,
                  crop_config: {
                    ...(i.crop_config || {}),
                    split: { ...(cur || {}), speaker1X: s1, speaker2X: s2 },
                  },
                };
              }),
            };
          }),
        }));
      })
      .catch(() => {
        // Anchor fetch failed: preview + export both fall back to the
        // symmetric defaults; sliders remain available.
      });
  };

  // Face-safe hook placement: a template hook inserted at the template's
  // default band can cover the tracked subject's face (measured: the
  // headline_impact box at position_y -240 overlapped the woman's forehead in
  // the two-shot fixture). When analysis exists, move the INSERTED hook (never
  // a pre-existing/user-positioned text item) to the band opposite the
  // dominant face zone inside the hook window. Without analysis the template
  // default stands. Mirrors the export exactly: the item transform persists
  // and drawtext burns the same position.
  const seedHookPlacementFromAnalysis = (hookDurationSec: number,target:{id:string;snapshot?:string}) => {
    if (!clip?.id) return;
    const identityVersion=seedIdentityRef.current.version,sequence=++hookSeedSequence.current;
    const currentSeed=()=>seedIdentityRef.current.version===identityVersion&&hookSeedSequence.current===sequence;
    void clipRenderService
      .getClipReframe(clip.id)
      .then((r) => {
        if(!currentSeed()||r.status!=='ready'||r.isStale!==false)return;
        const kfs = (r.smoothedKeyframes || []).filter((k) => k.time < hookDurationSec);
        if (kfs.length === 0) return;
        const faceY = kfs.reduce((acc, k) => acc + (k.centerY ?? 0.5), 0) / kfs.length;
        // Face clearly in the upper band -> hook below center but ABOVE the
        // caption zone (measured: +240 lands inside the bottom caption band);
        // clearly lower -> upper band; middle -> keep the template default.
        const hookY = faceY < 0.45 ? 140 : faceY > 0.6 ? -240 : null;
        if (hookY === null) return;
        onUpdateProject((prev) => !currentSeed()?prev:({
          ...prev,
          tracks: prev.tracks.map((t) => {
            if (t.type !== 'TEXT'||t.locked) return t;
            return {
              ...t,
              items: t.items.map((i: any) => {
                // Only this action's newly inserted hook, unchanged since insert.
                // Same time/position is never identity; all intervening item edits win.
                if (!target.snapshot || i.id!==target.id || JSON.stringify(i)!==target.snapshot) return i;
                if (i.locked || i.timeline_start >= hookDurationSec) return i;
                if (i.transform?.position_y !== -240) return i;
                return { ...i, transform: { ...i.transform, position_y: hookY } };
              }),
            };
          }),
        }));
      })
      .catch(() => {
        // Placement fetch failed: the template default band stands.
      });
  };

  // One-click output template: ONE object owns aspect + framing + captions +
  // hook + transitions. Applied through the pure shared mapper so preview and
  // export see exactly what a hand-picked combination would produce.
  const handleApplyOutputTemplate = (templateId: OutputTemplateId,approval?:NonNullable<typeof templateConsent>) => {
    const tpl = getOutputTemplate(templateId);
    if (!tpl) return;
    const targetCanvas=normalizeEditorCanvasAspect({...project.canvas,aspect_ratio:tpl.aspectRatio});
    const startingCanvasKey=JSON.stringify(project.canvas);
    const consentKey=templateCanvasConsentKey(project,targetCanvas);
    if(approval&&(approval.templateId!==templateId||approval.canvasKey!==startingCanvasKey||approval.consentKey!==consentKey||approval.identityVersion!==seedIdentityRef.current.version)){
      setTemplateConsent(null);setActionNotice('Template not applied because the canvas or locked content changed. Choose the template again to review.');return;
    }
    if(consentKey&&!approval){setTemplateConsent({templateId,name:tpl.name,aspect:tpl.aspectRatio,canvasKey:startingCanvasKey,consentKey,identityVersion:seedIdentityRef.current.version});return;}
    setTemplateConsent(null);
    setActionNotice(consentKey?'Template canvas change confirmed. Locked content keeps its coordinates and may be cropped. Undo restores the previous project. If locked content changes before application, apply the template again.':'Applying template. If locked content or the canvas changes before application, this action is skipped. Apply again to review.');
    splitSeedSequence.current++;hookSeedSequence.current++;
    setExportStale(true);
    // A template whose caption preset exceeds the current plan would otherwise
    // stamp a premium style the save endpoint then rejects (PRESET_RESTRICTED),
    // blocking every later save. Substitute the free fallback for this plan.
    const allowedPreset = resolvePlanAllowedPreset(tpl.captions.presetId);
    if (allowedPreset !== tpl.captions.presetId) {
      setActionNotice(`The "${tpl.name}" template's caption preset is not on your current plan - applied the free "simple" preset instead. Framing, aspect and hook are unchanged.`);
    }
    const effectiveTpl = allowedPreset === tpl.captions.presetId
      ? tpl
      : { ...tpl, captions: { ...tpl.captions, presetId: allowedPreset } };
    // The shared mapper is typed against the server EditorProject; the client
    // type is structurally identical for every field the mapper touches
    // (tracks/items/caption/crop/canvas), so the boundary cast is safe.
    const hookTarget={id:crypto.randomUUID(),snapshot:undefined as string|undefined};
    onUpdateProject((prev) => {
      // Never reuse consent for newly locked or changed locked content, or a
      // different starting canvas, when React runs this updater later.
      const currentConsent=templateCanvasConsentKey(prev,normalizeEditorCanvasAspect({...prev.canvas,aspect_ratio:tpl.aspectRatio}));
      if(JSON.stringify(prev.canvas)!==startingCanvasKey||currentConsent!==consentKey){hookTarget.snapshot=undefined;splitSeedSequence.current++;hookSeedSequence.current++;return prev;}
      const next=applyOutputTemplateToProject(prev as any,effectiveTpl,{hookItemId:hookTarget.id}) as unknown as EditorProject;
      const inserted=next.tracks.flatMap(t=>t.type==='TEXT'?t.items:[]).find(i=>i.id===hookTarget.id);
      hookTarget.snapshot=inserted?JSON.stringify(inserted):undefined;
      return next;
    });
    if (tpl.framing.layoutMode === 'split') seedSplitAnchorsFromAnalysis();
    if (tpl.hook) seedHookPlacementFromAnalysis(tpl.hook.durationSec,hookTarget);
  };

  // Apply Caption Preset: 'none' hides the caption track (captionEnabled=false on save),
  // any other preset re-enables it and swaps the style while keeping cues and position.
  const handleApplyCaptionPreset = (requested: CaptionPresetId, options?: {keepColors?: boolean}) => {
    const preset: CaptionPresetId = requested === 'none'
      ? 'none'
      : resolvePlanAllowedPreset(requested as RenderableCaptionPresetId);
    const linked = hookPresetLinked(project as any);
    if (linked && !allowedCaptionPresets) {
      setActionNotice('Available presets are still loading. No changes made.');
      return;
    }
    if (linked && preset !== 'none') {
      const style = resolveCaptionPreset(preset, freshPresetTypography(preset), project.canvas.aspect_ratio);
      const reason = hookPresetIssue(project as any, style, FONT_EM_PER_ASS_SIZE[style.fontFamily]);
      if (reason) {
        setActionNotice(reason);
        return;
      }
    }
    if (requested !== 'none' && preset !== requested) {
      setActionNotice(`The "${requested.replace(/_/g, ' ')}" preset is not on your plan. Applied the free "simple" preset instead.`);
    }
    if (preset !== 'none') setLastCaptionPreset(preset as RenderableCaptionPresetId);
    setExportStale(true);
    onUpdateProject((prev) => {
      let next: EditorProject = {
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.type !== 'CAPTION') return t;
          if (preset === 'none') return { ...t, hidden: true };
          return {
            ...t,
            hidden: hookMode(prev as any) === 'hook_only',
            items: t.items.map((i) => {
              const applied = applyPresetToEditorCaption(i.caption, preset);
              return { ...i, caption: options?.keepColors ? {
                ...applied,
                ...(i.caption?.primary_color ? {primary_color:i.caption.primary_color} : {}),
                ...(i.caption?.highlight_color ? {highlight_color:i.caption.highlight_color} : {}),
                ...(i.caption?.stroke_color ? {stroke_color:i.caption.stroke_color} : {}),
              } : applied };
            }),
          };
        }),
      };
      if (preset !== 'none' && hookPresetLinked(prev as any)) {
        const caption = next.tracks.find(t => t.type === 'CAPTION')?.items.find(i => i.caption)?.caption;
        const style = resolveCaptionPreset(preset, {
          ...freshPresetTypography(preset),
          ...(options?.keepColors && caption?.primary_color ? {textColor:caption.primary_color} : {}),
          ...(options?.keepColors && caption?.stroke_color ? {outlineColor:caption.stroke_color} : {}),
        }, next.canvas.aspect_ratio);
        next = applyHookPreset(next as any, style, FONT_EM_PER_ASS_SIZE[style.fontFamily]) as unknown as EditorProject;
      }
      return next;
    });
  };

  const handleHookMode = (mode: HookDisplayMode) => {
    if (!allowedCaptionPresets) {
      setActionNotice('Available presets are still loading. No changes made.');
      return;
    }
    try {
      const current = project.tracks.find(t => t.type === 'CAPTION')?.items.find(i => i.caption)?.caption?.style;
      let preset = resolvePlanAllowedPreset(isRenderablePresetId(current) ? current : 'simple');
      let style = resolveCaptionPreset(preset, freshPresetTypography(preset), project.canvas.aspect_ratio);
      const unsupported = !hookPresetSupported(style);
      if (unsupported) {
        preset = 'simple';
        style = resolveCaptionPreset(preset, undefined, project.canvas.aspect_ratio);
      }
      // Validate without changing the project before handing React an updater.
      applyHookPreset(applyHookDisplayMode(project as any, mode), style, FONT_EM_PER_ASS_SIZE[style.fontFamily]);
      setExportStale(true);
      onUpdateProject(prev => applyHookPreset(applyHookDisplayMode(prev as any, mode), style, FONT_EM_PER_ASS_SIZE[style.fontFamily]) as unknown as EditorProject);
      setActionNotice(unsupported
        ? 'Hook mode applied with Simple styling because the current caption font is not supported for static hooks. Choose another supported preset under Hook display.'
        : 'Hook mode applied. Check its position in the preview. Preset styling is static, without caption motion or word highlights.');
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : 'Hook mode could not be applied.');
    }
  };

  const hookControls = <HookModeControls project={project} disabled={isRendering} allowedPresetIds={allowedCaptionPresets}
    onMode={handleHookMode} onPreset={handleApplyCaptionPreset} />;

  // A completed render matches current editor settings again.
  useEffect(() => {
    if (renderSuccessMsg) setExportStale(false);
  }, [renderSuccessMsg]);

  // Persistent staleness: the rendered file predates the current editor
  // project whenever the project was SAVED after the snapshot taken at render
  // start (updated_at comparison; a never-edited project - updated_at equals
  // created_at - matches the default state the render already reflects).
  const editorProjectStale =
    !!clip &&
    clip.render_status === 'ready' &&
    !!(clip as any).rendered_editor_saved_at &&
    project.updated_at > (clip as any).rendered_editor_saved_at &&
    project.updated_at !== project.created_at;

  // Discoverable Captions On/Off. Hiding the track already preserves the
  // item's caption config, so re-enabling just unhides - the chosen style
  // (gallery preset or legacy style) survives the off/on round-trip.
  const handleToggleCaptions = (enabled: boolean) => {
    setExportStale(true);
    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.type !== 'CAPTION') return t;
        if (!enabled) return { ...t, hidden: true };
        const hasConfig = t.items.some((i) => i.caption && i.caption.style);
        if (hasConfig) return { ...t, hidden: false };
        // No config to restore (unexpected): fall back to the last used preset.
        return {
          ...t,
          hidden: false,
          items: t.items.map((i) => ({
            ...i,
            caption: applyPresetToEditorCaption(i.caption, lastCaptionPreset),
          })),
        };
      }),
    }));
  };

  const hasWordTiming = cues.some((c) => Array.isArray(c.words) && c.words.length > 0);

  // Add Track Item (for Text / Template overlays)
  const handleAddTrackItem = (item: EditorTrackItem) => {
    let targetTrackId = item.track_id;

    onUpdateProject((prev) => {
      const existingTextTrack = prev.tracks.find((t) => t.type === 'TEXT');
      if (!existingTextTrack) {
        targetTrackId = crypto.randomUUID();
        const newTextTrack: EditorTrack = {
          id: targetTrackId,
          name: 'Text Overlay',
          type: 'TEXT',
          items: [{ ...item, track_id: targetTrackId }],
          locked: false,
          hidden: false,
          muted: false,
        };
        return {
          ...prev,
          tracks: [...prev.tracks, newTextTrack],
        };
      }

      targetTrackId = existingTextTrack.id;
      const updatedItem = { ...item, track_id: targetTrackId };
      return {
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.id !== targetTrackId) return t;
          return { ...t, items: [...t.items, updatedItem] };
        }),
      };
    });

    selectItem(item.id, targetTrackId);
  };

  // Add Element / Sticker Layer
  const handleAddElement = (element: ElementMediaItem) => {
    let targetTrackId = '';
    const itemDuration = 3.0; // 3 seconds default duration

    let createdItemId = '';

    onUpdateProject((prev) => {
      let elementsTrack = prev.tracks.find(
        (t) => t.type === 'OVERLAY' || t.name === 'Elements & Stickers'
      );

      if (!elementsTrack) {
        targetTrackId = crypto.randomUUID();
        createdItemId = crypto.randomUUID();
        const newTrack: EditorTrack = {
          id: targetTrackId,
          name: 'Elements & Stickers',
          type: 'OVERLAY',
          items: [],
          locked: false,
          hidden: false,
          muted: false,
        };
        const newItem: EditorTrackItem = {
          id: createdItemId,
          track_id: targetTrackId,
          type: 'OVERLAY',
          name: `${element.type === 'sticker' ? 'Sticker' : 'GIF'}: ${element.title || 'Overlay'}`,
          timeline_start: currentTime,
          timeline_end: Math.min(prev.canvas.duration, currentTime + itemDuration),
          source_start: 0,
          source_end: itemDuration,
          transform: {
            position_x: 0,
            position_y: 0,
            scale: 1.0,
            rotation: 0,
            opacity: 1.0,
            // Versioned overlay semantics (see EditorTransform.position_space):
            // new elements speak center-origin design space in both channels.
            position_space: 'design_center',
          },
          source_path: element.sourceUrl,
          speed: { speed: 1.0, pitch_preserved: true },
          effects: [],
          keyframes: [],
          locked: false,
          muted: false,
          hidden: false,
          z_index: 25,
        };
        return {
          ...prev,
          tracks: [...prev.tracks, { ...newTrack, items: [newItem] }],
        };
      }

      targetTrackId = elementsTrack.id;
      createdItemId = crypto.randomUUID();
      const newItem: EditorTrackItem = {
        id: createdItemId,
        track_id: targetTrackId,
        type: 'OVERLAY',
        name: `${element.type === 'sticker' ? 'Sticker' : 'GIF'}: ${element.title || 'Overlay'}`,
        timeline_start: currentTime,
        timeline_end: Math.min(prev.canvas.duration, currentTime + itemDuration),
        source_start: 0,
        source_end: itemDuration,
        transform: {
          position_x: 0,
          position_y: 0,
          scale: 1.0,
          rotation: 0,
          opacity: 1.0,
          // Versioned overlay semantics (see EditorTransform.position_space):
          // new elements speak center-origin design space in both channels.
          position_space: 'design_center',
        },
        source_path: element.sourceUrl,
        speed: { speed: 1.0, pitch_preserved: true },
        effects: [],
        keyframes: [],
        locked: false,
        muted: false,
        hidden: false,
        z_index: 25,
      };

      return {
        ...prev,
        tracks: prev.tracks.map((t) => {
          if (t.id !== targetTrackId) return t;
          return { ...t, items: [...t.items, newItem] };
        }),
      };
    });

    if (createdItemId && targetTrackId) {
      selectItem(createdItemId, targetTrackId);
    }
  };

  // Add Text Layer (legacy / quick button)
  const handleAddTextLayer = (text: string) => {
    const textTrack = project.tracks.find((t) => t.type === 'TEXT');
    const trackId = textTrack ? textTrack.id : crypto.randomUUID();

    const newItem: EditorTrackItem = {
      id: crypto.randomUUID(),
      track_id: trackId,
      type: 'TEXT',
      timeline_start: currentTime,
      timeline_end: Math.min(project.canvas.duration, currentTime + 3.0),
      source_start: 0,
      source_end: 3.0,
      transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
      speed: { speed: 1.0, pitch_preserved: true },
      text: {
        text,
        font_family: 'Inter',
        font_size: 44,
        font_weight: 'bold',
        italic: false,
        alignment: 'center',
        color: '#FFFFFF',
        background_color: '#00000099',
        preset: 'bold',
        animation: 'pop',
        animation_duration: 0.4,
      },
      effects: [],
      keyframes: [],
      locked: false,
      muted: true,
      hidden: false,
      z_index: 20,
    };

    handleAddTrackItem(newItem);
  };

  // Add Media Layer (B-Roll or Library footage/image/audio)
  const handleAddMediaLayer = (
    type: any,
    name: string,
    url: string,
    duration = 3.0
  ) => {
    const isAudio = type === 'AUDIO';
    const targetTrack =
      project.tracks.find((t) => t.type === type) ||
      (isAudio ? project.tracks.find((t) => t.type === 'AUDIO') : project.tracks.find((t) => t.type === 'VIDEO')) ||
      project.tracks[0];
    if (!targetTrack) return;

    const itemDuration = Math.max(0.5, Math.min(10.0, duration));
    const newItem: EditorTrackItem = {
      id: crypto.randomUUID(),
      track_id: targetTrack.id,
      type: isAudio ? 'AUDIO' : type === 'IMAGE' ? 'IMAGE' : 'VIDEO',
      timeline_start: currentTime,
      timeline_end: Math.min(project.canvas.duration, currentTime + itemDuration),
      source_start: 0,
      source_end: itemDuration,
      transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
      speed: { speed: 1.0, pitch_preserved: true },
      source_path: url,
      name,
      effects: [],
      keyframes: [],
      locked: false,
      muted: false,
      hidden: false,
      z_index: isAudio ? 2 : 5,
    };

    // If an intro/outro slot was armed, insert this media there (ripple) instead of inline.
    if (pendingIntroOutro) {
      const videoTrack = project.tracks.find((t) => t.type === 'VIDEO') || targetTrack;
      const mediaItem: EditorTrackItem = { ...newItem, track_id: videoTrack.id, type: type === 'IMAGE' ? 'IMAGE' : 'VIDEO', name };
      const pos = pendingIntroOutro;
      setPendingIntroOutro(null);
      onUpdateProject((prev) => insertIntroOutro(prev, pos, videoTrack.id, mediaItem).project);
      selectItem(mediaItem.id, videoTrack.id);
      return;
    }

    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.id !== targetTrack.id) return t;
        return { ...t, items: [...t.items, newItem] };
      }),
    }));

    selectItem(newItem.id, targetTrack.id);
  };

  // Intro/outro: open the choice menu, then insert a title card or arm a media pick.
  const handleAddIntroOutro = (position: 'intro' | 'outro') => {
    setIntroOutroMenu(position);
  };

  const handleInsertTitleCard = (position: 'intro' | 'outro') => {
    const videoTrack = project.tracks.find((t) => t.type === 'VIDEO') || project.tracks[0];
    if (!videoTrack) return;
    const card = createTitleCardItem(videoTrack.id, position, 0);
    onUpdateProject((prev) => insertIntroOutro(prev, position, videoTrack.id, card).project);
    selectItem(card.id, videoTrack.id);
    setIntroOutroMenu(null);
  };

  const handlePickMediaForIntroOutro = (position: 'intro' | 'outro') => {
    setPendingIntroOutro(position);
    setActiveSidebarTab('media');
    setIntroOutroMenu(null);
  };

  // The contextual options panel sits beside the tool rail and swaps content with the selected
  // tool. A drawer tab renders its own drawer; everything else (and any selected canvas object)
  // renders the inspector here, so there is only ever one contextual column.
  const inspectorPanel = (
    <ContextualInspector
      project={project}
      clip={clip}
      selectedItemId={selectedItemId}
      selectedTrackId={selectedTrackId}
      activeSidebarTab={activeSidebarTab}
      activeAiTool={activeAiTool}
      onSelectAiTool={setActiveAiTool}
      onNavigateTab={setActiveSidebarTab}
      onUpdateProject={(update)=>{setExportStale(true);onUpdateProject(update);}}
      onUpdateItem={(itemId, updates, options) => {
        // Selection via the preview overlay sets only the item id; resolve the
        // owning track from the item when no track is selected, otherwise
        // inspector edits (hook duration, visibility, ...) silently no-op.
        const trackId =
          selectedTrackId ||
          project.tracks.find((t) => t.items.some((i) => i.id === itemId))?.id ||
          null;
        if (trackId) {
          onUpdateTrackItem(trackId, itemId, updates, options);
        }
      }}
      onAddKeyframe={(itemId, prop, val, easing) => {
        if (selectedTrackId) {
          const track = project.tracks.find((t) => t.id === selectedTrackId);
          const item = track?.items.find((i) => i.id === itemId);
          if (item) {
            const kfs = [...(item.keyframes || [])];
            kfs.push({
              id: crypto.randomUUID(),
              property: prop,
              value: val,
              time: currentTime - item.timeline_start,
              easing,
            });
            onUpdateTrackItem(selectedTrackId, itemId, { keyframes: kfs });
          }
        }
      }}
      onDeleteKeyframe={(itemId, kfId) => {
        if (selectedTrackId) {
          const track = project.tracks.find((t) => t.id === selectedTrackId);
          const item = track?.items.find((i) => i.id === itemId);
          if (item) {
            const kfs = (item.keyframes || []).filter((k) => k.id !== kfId);
            onUpdateTrackItem(selectedTrackId, itemId, { keyframes: kfs });
          }
        }
      }}
      onApplyCaptionPreset={handleApplyCaptionPreset}
      hookControls={hookControls}
      allowedCaptionPresetIds={allowedCaptionPresets ?? undefined}
      onToggleCaptions={handleToggleCaptions}
      hasWordTiming={hasWordTiming}
      onAddTextLayer={handleAddTextLayer}
      onUpdateCropMode={(_mode) => {
        onUpdateProject((prev) => ({
          ...prev,
          canvas: { ...prev.canvas },
        }));
      }}
      onActionNotice={setActionNotice}
    />
  );

  // Transcript lives in a persistent right-hand dock, independent of the selected tool, so it
  // never disappears when the user switches to Captions / Audio / B-roll / AI tools.
  const primaryVideoForExtend = project.tracks
    .find((t) => t.type === 'VIDEO')
    ?.items.find((i) => !i.hidden);
  // Reclaimable tail: footage between the current item end and the furthest safe
  // source point. The candidate boundary (clip.end_seconds) is the floor; when the
  // source media runs longer (source_duration_seconds from the project record) the
  // user may extend beyond the candidate - the server re-validates the bound.
  const extendSlackSec = primaryVideoForExtend
    ? Math.max(
        0,
        Number(
          (
            Math.min(
              (project as any).source_duration_seconds ?? clip.end_seconds,
              Number.MAX_SAFE_INTEGER
            ) - primaryVideoForExtend.source_end
          ).toFixed(3)
        )
      )
    : 0;
  const transcriptPanel = (
    <TranscriptEditor
      cues={cues}
      currentTime={currentTime}
      onSeek={seek}
      onUpdateCueText={onUpdateCueText}
      onDeleteCue={onDeleteCue}
      selectedCueId={selectedCueId}
      onSelectCue={selectCue}
      onDeleteTimeRange={onDeleteTimeRange}
      onDeleteTimeRanges={onDeleteTimeRanges}
      extendSlackSec={extendSlackSec}
      onExtendClip={() => {
        // Extend the clip tail toward the source media end (or the candidate boundary
        // when the source duration is unknown): same field updates as timeline
        // trim-right, committed in one step, plus the canvas duration so the pro
        // render covers the extended tail.
        if (!primaryVideoForExtend || extendSlackSec <= 0.05) return;
        const trackId = primaryVideoForExtend.track_id;
        const itemId = primaryVideoForExtend.id;
        const bound = (project as any).source_duration_seconds ?? clip.end_seconds;
        const newSourceEnd = Math.min(
          bound,
          Number((primaryVideoForExtend.source_end + extendSlackSec).toFixed(3))
        );
        const delta = Number((newSourceEnd - primaryVideoForExtend.source_end).toFixed(3));
        if (delta <= 0) return;
        // Single history entry for the whole extend: video item + canvas +
        // coverage marker commit together, so one undo restores all of it.
        void trackId; void itemId;
        onUpdateProject((prev) => ({
          ...prev,
          canvas: {
            ...prev.canvas,
            duration: Number(((prev.canvas.duration || 0) + delta).toFixed(3)),
          },
          tracks: prev.tracks.map((t) => {
            if (t.id === trackId) {
              return {
                ...t,
                items: t.items.map((i) =>
                  i.id !== itemId
                    ? i
                    : {
                        ...i,
                        source_end: newSourceEnd,
                        timeline_end: Number((i.timeline_end + delta).toFixed(3)),
                      }
                ),
              };
            }
            // Record the pre-extend caption coverage BEFORE the extension is
            // saved, so the heal can append the newly exposed span on the very
            // next load - no second-load gap for existing projects.
            if (t.type !== 'CAPTION' || t.hidden) return t;
            return {
              ...t,
              items: t.items.map((i) =>
                i.hidden || !i.caption || !Array.isArray(i.caption.cues) ||
                i.caption.cues.length === 0 || i.caption.cues_covered_end != null
                  ? i
                  : {
                      ...i,
                      caption: {
                        ...i.caption,
                        cues_covered_end: initCoveredEnd(i.caption.cues),
                      },
                    }
              ),
            };
          }),
        }));
        // Persist the new trim, then append cues for the newly exposed span
        // in-session (fresh extraction honors the saved trim). This is its own
        // history entry, so undo reverts caption append first, then the extend;
        // no reload, so existing undo history is preserved.
        void (async () => {
          try {
            // Let React flush the extend state updates (track item + canvas +
            // coverage marker) into the autosave ref before saving; otherwise
            // saveNow persists the pre-extend snapshot and the caption fetch
            // below would read a pre-extend clip.
            await new Promise((r) => setTimeout(r, 0));
            let saved = await onSaveNow();
            if (!saved) {
              // A save was already in flight; wait for it to settle and retry
              // once so the heal is not silently dropped.
              await new Promise((r) => setTimeout(r, 800));
              saved = await onSaveNow();
            }
            if (!saved) {
              console.error('[extend-heal] save did not complete; caption coverage will heal on next editor load.');
              setExtendCaptionNotice(
                'Clip extended, but saving failed. Captions for the added footage will load on next open.'
              );
              return;
            }
            const cap = await clipRenderService.getClipCaptions(clip.id);
            if (!Array.isArray(cap?.cues) || cap.cues.length === 0) {
              setExtendCaptionNotice(
                'Clip extended, but no transcript captions are available for this clip yet.'
              );
              return;
            }
            onUpdateProject((prev) => {
              const { tracks: healed, appended, markersChanged } = healCaptionTracks(
                prev.tracks,
                cap.cues,
                prev.canvas?.duration
              );
              if (!markersChanged) return prev;
              if (appended === 0) {
                // Coverage did not move past the pre-extend boundary: the
                // transcript has no words in the extended span (missing or
                // shorter than the extension), so captions cannot cover it.
                setExtendCaptionNotice(
                  'The transcript has no words in the added footage, so captions cannot cover the full extension.'
                );
              } else {
                setExtendCaptionNotice(null);
              }
              return { ...prev, tracks: healed };
            });
          } catch (e) {
            // The heal re-runs on next editor load; surface for diagnostics.
            console.error('[extend-heal] failed:', e);
            setExtendCaptionNotice(
              'Clip extended, but loading captions for the added footage failed. They will retry on next open.'
            );
          }
        })();
      }}
      onReplaceWordGlobally={onReplaceWordGlobally}
      onUpdateWordTiming={onUpdateWordTiming}
      onPlayRange={(start) => {
        seek(start);
        if (!isPlaying) togglePlay();
      }}
      onPunchInZoom={(wordStart: number) => {
        onUpdateProject((prev) => {
          const videoTrack = prev.tracks.find((t) => t.type === 'VIDEO' && !t.locked);
          if (!videoTrack || videoTrack.items.length === 0) return prev;
          const targetItem = videoTrack.items.find(
            (i) => wordStart >= i.timeline_start && wordStart <= i.timeline_end
          );
          if (!targetItem) return prev;

          const relTime = wordStart - targetItem.timeline_start;
          const keyframes = targetItem.keyframes ? [...targetItem.keyframes] : [];
          keyframes.push(
            {
              id: crypto.randomUUID(),
              time: Math.max(0, Number(relTime.toFixed(3))),
              property: 'scale',
              value: 1.08,
              easing: 'ease-out',
            },
            {
              id: crypto.randomUUID(),
              time: Math.max(0, Number((relTime + 1.5).toFixed(3))),
              property: 'scale',
              value: 1.0,
              easing: 'ease-in-out',
            }
          );

          return {
            ...prev,
            tracks: prev.tracks.map((t) => {
              if (t.id !== videoTrack.id) return t;
              return {
                ...t,
                items: t.items.map((i) => (i.id === targetItem.id ? { ...i, keyframes } : i)),
              };
            }),
          };
        });
      }}
      onUpdateCuePreset={(cueId, presetId) => {
        onUpdateProject((prev) => {
          const captionTrack = prev.tracks.find((t) => t.type === 'CAPTION');
          if (!captionTrack) return prev;
          return {
            ...prev,
            tracks: prev.tracks.map((t) => {
              if (t.id !== captionTrack.id) return t;
              return {
                ...t,
                items: t.items.map((item) => {
                  if (item.type !== 'CAPTION' || !item.caption?.cues) return item;
                  return {
                    ...item,
                    caption: {
                      ...item.caption,
                      cues: item.caption.cues.map((c) =>
                        c.id === cueId ? { ...c, presetOverride: presetId } : c
                      ),
                    },
                  };
                }),
              };
            }),
          };
        });
      }}
      onUpdateWordCustomStyle={(cueId, wordIndex, style) => {
        onUpdateProject((prev) => {
          const captionTrack = prev.tracks.find((t) => t.type === 'CAPTION');
          if (!captionTrack) return prev;
          return {
            ...prev,
            tracks: prev.tracks.map((t) => {
              if (t.id !== captionTrack.id) return t;
              return {
                ...t,
                items: t.items.map((item) => {
                  if (item.type !== 'CAPTION' || !item.caption?.cues) return item;
                  return {
                    ...item,
                    caption: {
                      ...item.caption,
                      cues: item.caption.cues.map((c) => {
                        if (c.id !== cueId || !Array.isArray(c.words)) return c;
                        const updatedWords = [...c.words];
                        if (updatedWords[wordIndex]) {
                          updatedWords[wordIndex] = {
                            ...updatedWords[wordIndex],
                            customStyle: {
                              ...(updatedWords[wordIndex].customStyle || {}),
                              ...style,
                            },
                          };
                        }
                        return {
                          ...c,
                          words: updatedWords,
                          tokens: updatedWords,
                        };
                      }),
                    },
                  };
                }),
              };
            }),
          };
        });
      }}
      onToggleCollapse={toggleTranscriptCollapsed}
    />
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-vc-canvas text-white overflow-hidden font-sans select-none">
      {/* 1. TOP NAVIGATION BAR */}
      <EditorTopBar
        title={project.title || clip.title || 'Untitled Clip'}
        onUpdateTitle={(newTitle) => {
          onUpdateProject((prev) => ({ ...prev, title: newTitle }));
        }}
        onBack={guardedBack}
        saveStatus={saveStatus}
        saveError={saveError}
        onSaveNow={onSaveNow}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
        previewQuality={previewQuality}
        onChangePreviewQuality={setPreviewQuality}
        showSafeGuides={showSafeGuides}
        onToggleSafeGuides={toggleSafeGuides}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenExportDialog={() => setIsExportDialogOpen(true)}
        isRendering={isRendering}
      />

      {/* 2. MAIN WORKSPACE BODY */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative select-none">
        {/* LEFT VERTICAL SIDEBAR */}
        <EditorSidebar
          activeTab={activeSidebarTab}
          onChangeTab={(tab) => {
            if (tab === 'transcript') {
              setTranscriptCollapsed(false);
              setActiveSidebarTab('transcript');
              return;
            }
            if (activeSidebarTab === tab && !selectedItemId) {
              toggleInspectorCollapsed();
              return;
            }
            setActiveSidebarTab(tab);
            // Phone: one bottom sheet at a time - choosing a tool closes the transcript sheet.
            if (typeof window !== 'undefined' && window.innerWidth < 768) setTranscriptCollapsed(true);
            if (tab === 'captions') {
              setInspectorCollapsed(false);
            } else if (
              tab === 'media' ||
              tab === 'broll' ||
              tab === 'audio' ||
              tab === 'brand' ||
              tab === 'text' ||
              tab === 'elements' ||
              tab === 'layout' ||
              tab === 'framing' ||
              tab === 'aspect_ratio' ||
              tab === 'copilot' ||
              tab === 'ai_tools' ||
              tab === 'translate'
            ) {
              clearSelection();
            }
          }}
          activeAiTool={activeAiTool}
          onSelectAiTool={setActiveAiTool}
        />

        {/* DIRECT B-ROLL DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'broll' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <MediaBin
              project={project}
              sourceVideoUrl={cleanSourceUrl || renderedPreviewUrl}
              onAddMediaToTimeline={handleAddMediaLayer}
              onRefreshProject={onReloadData}
              currentTime={currentTime}
              initialTab="broll"
            />
          </div>
        )}

        {/* DIRECT TRANSLATE DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'translate' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <TranslationWorkspace
              project={project}
              sourceTranscriptText={cues.map((c) => c.text).join(' ')}
              sourceSegments={cues.map((c, i) => ({
                id: c.id || `cue-${i}`,
                start: c.start,
                end: c.end,
                text: c.text,
                speaker_id: 'speaker-0',
              }))}
              onApplyCaptions={(_lang, translatedSegs) => {
                const newCues: TimedCaptionCue[] = translatedSegs.map((s, idx) => ({
                  id: s.segment_id || `tc-${idx}`,
                  start: s.start_time,
                  end: s.end_time,
                  text: s.translated_text,
                  words: [],
                }));

                onUpdateProject((prev) => {
                  const captionTrack = prev.tracks.find((t) => t.type === 'CAPTION');
                  if (!captionTrack) return prev;

                  return {
                    ...prev,
                    tracks: prev.tracks.map((t) => {
                      if (t.id !== captionTrack.id) return t;
                      return {
                        ...t,
                        items: t.items.map((i) => ({
                          ...i,
                          caption: {
                            cues: newCues,
                            style: i.caption?.style || 'clean',
                            position: i.caption?.position || 'bottom',
                            ...captionLegacyColorDefaults(i.caption, '#8B5CF6'),
                            ...i.caption,
                          },
                        })),
                      };
                    }),
                  };
                });
              }}
              onRefreshProject={onReloadData}
            />
          </div>
        )}

        {/* MEDIA LIBRARY DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'media' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <MediaBin
              project={project}
              sourceVideoUrl={cleanSourceUrl || renderedPreviewUrl}
              onAddMediaToTimeline={handleAddMediaLayer}
              onRefreshProject={onReloadData}
              currentTime={currentTime}
              initialTab="library"
            />
          </div>
        )}

        {/* AI COPILOT DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'copilot' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <AICopilotPanel
              project={project}
              cues={cues}
              onUpdateProject={onUpdateProject}
              onUpdateCueText={onUpdateCueText}
            />
          </div>
        )}

        {/* AI TOOLS DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'ai_tools' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <AiToolsPanel
              activeToolId={null}
              onSelectToolId={() => {}}
              onActivate={(tool) => {
                if (tool.target?.aiTool) {
                  setActiveAiTool(tool.target.aiTool as AiToolType);
                } else if (tool.target?.tab) {
                  setActiveSidebarTab(tool.target.tab as SidebarTab);
                }
              }}
            />
          </div>
        )}

        {/* AUDIO STUDIO DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'audio' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <AudioWorkspacePanel
              project={project}
              currentTime={currentTime}
              onAddAudioTrack={(title, url, dur) => handleAddMediaLayer('AUDIO', title, url, dur)}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* BRAND KIT DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'brand' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <BrandKitPanel
              project={project}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* TEXT & MOTION TEMPLATES DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'text' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <TextWorkspacePanel
              project={project}
              currentTime={currentTime}
              onAddTextItem={handleAddTrackItem}
              onSelectTrackItem={(itemId, trackId) => selectItem(itemId, trackId)}
            />
          </div>
        )}

        {/* ELEMENTS & STICKERS DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'elements' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <ElementsWorkspacePanel
              project={project}
              currentTime={currentTime}
              onAddElement={handleAddElement}
              onSelectTrackItem={(itemId, trackId) => selectItem(itemId, trackId)}
            />
          </div>
        )}

        {/* MOTION DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'layout' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <MotionWorkspacePanel
              project={project}
              selectedItemId={selectedItemId}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* FRAMING & SMART REFRAME DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'framing' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            {(() => {
              const vids = project.tracks.filter((t) => t.type === 'VIDEO').flatMap((t) => t.items);
              const sceneItem = vids.find((i) => currentTime >= i.timeline_start && currentTime < i.timeline_end) ?? vids[0];
              if (!sceneItem) return null;
              return (
                <div className="shrink-0 px-4 pt-3 pb-2 border-b border-white/[0.08]" data-testid="framing-scene-layouts">
                  <div className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1.5">Scene layout (scene at playhead)</div>
                  <SceneLayoutGrid
                    current={readItemLayout(resolveSceneLayoutItem(sceneItem,sceneItem.source_start+(currentTime-sceneItem.timeline_start)*(sceneItem.speed?.speed||1)))}
                    onPick={(layout) => {
                      onCommitProject?.(project);
                      onUpdateProject(prev=>{const offset=compositionSourceStart,time=sceneItem.source_start+(currentTime-sceneItem.timeline_start)*(sceneItem.speed?.speed||1);const shot=speakerSplit?.shotComposition?.find(s=>time>=s.start+offset&&time<s.end+offset);return applyLayoutAtSourceTime(prev,sceneItem.id,time,layout,shot?{start:shot.start+offset,end:shot.end+offset}:undefined,layoutSubjectKeyframes,layoutSubjectSourceSize,measuredPanelChoices,currentSourceVersionRef.current)});
                    }}
                  />
                </div>
              );
            })()}
            <FramingWorkspacePanel
              measuredCapabilities={speakerSplit?.measuredCapabilities??null}
              scenePlan={(() => {
                const sp = speakerSplit;
                if (!sp?.shotComposition?.length || !sp.sourceWidth || !sp.sourceHeight) return null;
                const trim = Number(clip?.trim_start_offset) || 0;
                const ctx = {
                  clipStartSec: compositionSourceStart, analyzedTrimStart: sp.analyzedTrimStart || 0, currentTrimStart: trim,
                  sourcePath: sp.analyzedSourcePath,
                  planVersion: `shot-composition-v1:a${sp.analysisVersion ?? 0}`, sourceWidth: sp.sourceWidth, sourceHeight: sp.sourceHeight,
                };
                const shots = sp.shotComposition as unknown as PlanShot[];
                return {
                  shots, ctx, previewReady: FRAMING_WINDOW_PREVIEW_PARITY,
                  // ONE explicit scene, ONE project update: a single undo step. Never on load, never bulk.
                  onApply: (index: number, replaceConflicts: boolean) => {
                    if (!FRAMING_WINDOW_PREVIEW_PARITY) return { ok: false, reasons: ['Preview cannot show this window yet.'] };
                    const r = applyPlanSceneToProject(project, shots[index], { ...ctx, replaceConflicts, nowIso: new Date().toISOString() });
                    if (!r.ok) return { ok: false, reasons: r.reasons };
                    onUpdateProject(() => r.project as typeof project); // updateProject records exactly one undo snapshot
                    return { ok: true };
                  },
                };
              })()}
              contentFramingDecision={speakerSplit?.contentFramingDecision ?? null}
              project={project}
              showSafeGuides={showSafeGuides}
              onToggleSafeGuides={toggleSafeGuides}
              onUpdateCropMode={(mode) => {
                splitSeedSequence.current++;hookSeedSequence.current++;
                onUpdateProject(prev => applyFramingStrategy(prev, mode));
              }}
              onUpdateLayoutMode={(layout) => {
                splitSeedSequence.current++;hookSeedSequence.current++;
                onUpdateProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => {
                    if (t.type === 'VIDEO'&&!t.locked) {
                      return {
                        ...t,
                        items: t.items.map((i:any) => i.locked?i:({ ...i, framing_window: undefined, layout_mode: layout, crop_config:{...i.crop_config,layout_mode:layout,layout_mode_source:'user'} })),
                      };
                    }
                    return t;
                  }),
                }));
                // Split pick: seed the speaker windows from measured analysis
                // anchors so both the preview and the export center the actual
                // speakers (see seedSplitAnchorsFromAnalysis).
                if (layout === 'split') seedSplitAnchorsFromAnalysis();
              }}
              onApplyOutputTemplate={handleApplyOutputTemplate}
              onUpdateSplitAnchors={(anchors) => {
                const clamp = (v: number) => Math.min(0.9, Math.max(0.1, Number(v)));
                const s1 = clamp(anchors.speaker1X);
                const s2 = clamp(anchors.speaker2X);
                onUpdateProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => {
                    if (t.type !== 'VIDEO'||t.locked) return t;
                    return {
                      ...t,
                      items: t.items.map((i: any) => i.locked?i:({
                        ...i,
                        crop_config: {
                          ...(i.crop_config || {}),
                          split: { ...(i.crop_config?.split || {}), speaker1X: s1, speaker2X: s2 },
                        },
                      })),
                    };
                  }),
                }));
              }}
              onUpdateScreencast={(patch) => {
                onUpdateProject((prev) => ({
                  ...prev,
                  tracks: prev.tracks.map((t) => {
                    if (t.type === 'VIDEO'&&!t.locked) {
                      return {
                        ...t,
                        items: t.items.map((i) => {
                          if(i.locked)return i;
                          const prevScreencast = (i as any).crop_config?.screencast || {};
                          // null is an explicit opt-out and MUST persist -
                          // deleting the key would fall back to (and resurrect)
                          // the analysis suggestion at render time.
                          const nextScreencast = { ...prevScreencast, ...patch };
                          return {
                            ...i,
                            crop_config: { ...(i as any).crop_config, screencast: nextScreencast },
                          } as any;
                        }),
                      };
                    }
                    return t;
                  }),
                }));
              }}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* ASPECT RATIO DRAWER */}
        {showLeftDrawer && activeSidebarTab === 'aspect_ratio' && (
          <div className="w-[350px] shrink-0 flex flex-col min-h-0 overflow-hidden border-r border-vc-border bg-vc-surface1 animate-panelSlideIn max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-r-0 short:border-r-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl max-md:shadow-2xl short:shadow-2xl">
            <AspectRatioWorkspacePanel
              project={project}
              onUpdateProject={onUpdateProject}
            />
          </div>
        )}

        {/* CONTEXTUAL INSPECTOR PANEL — smoothly docks beside the rail */}
        {showRightInspector && !inspectorCollapsed && (
          <div className="relative shrink-0 flex z-20 max-md:contents short:contents">
            {inspectorPanel}
          </div>
        )}

        {/* CENTER VIEWPORT (VIDEO PREVIEW + TRANSPORT) */}
        <div data-testid="editor-preview-workspace" className={`flex-1 flex flex-col min-w-0 min-h-0 bg-vc-surface1 overflow-hidden relative ${(!transcriptCollapsed || showLeftDrawer || (showRightInspector && !inspectorCollapsed)) ? 'max-md:h-[66%] short:h-[66%]' : ''}`}>
          {automaticPlanReviewRequired&&viewMode==='edit'&&<div role="status" className="shrink-0 border-b border-amber-700/50 bg-amber-950/70 px-3 py-2 text-xs text-amber-100">Automatic framing needs review for this scene. Showing the full source, not an export-qualified layout. Your manual settings are unchanged.</div>}
          {/* Warnings stay in normal flow above the canvas so they are reachable with the transcript collapsed or auto-scrolling */}
              {viewMode==='edit' && journalIssue && saveStatus !== 'saved' && (
                <div role="status" data-testid="journal-warning" className="shrink-0 flex items-start gap-2 pl-3 pr-3 max-md:pr-14 py-1.5 max-md:py-3 border-b border-amber-800/50 bg-vc-surface1">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-200/90 leading-snug">{journalIssue}</p>
                </div>
              )}
              {viewMode==='edit' && lockNotice && (
                <div role="status" data-testid="lock-notice" className="shrink-0 flex items-start gap-2 pl-3 pr-3 max-md:pr-14 py-1.5 max-md:py-3 border-b border-amber-800/50 bg-vc-surface1">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-200/90 leading-snug">{lockNotice}</p>
                  <button type="button" onClick={() => setLockNotice(null)} aria-label="Dismiss" className="ml-auto shrink-0 text-amber-300/70 hover:text-amber-200 text-xs px-2 py-1">×</button>
                </div>
              )}
              {viewMode==='edit' && hookPositionReview.status === 'anchor-outside-canvas' && (
                <div role="status" className="shrink-0 flex items-start gap-2 pl-3 pr-3 max-md:pr-14 py-1.5 max-md:py-3 border-b border-amber-800/50 bg-vc-surface1">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-200/90 leading-snug"><span className="md:hidden">The title is outside this canvas.{' '}<button type="button" aria-expanded={warnDetailsOpen} onClick={() => setWarnDetailsOpen(v => !v)} className="underline underline-offset-2 relative after:content-[''] after:absolute after:-inset-y-[15px] after:-inset-x-3">{warnDetailsOpen ? 'Less' : 'Details'}</button>{warnDetailsOpen && <span className="block mt-1">The title is positioned outside this canvas. Center hook moves it to the middle; check the preview afterward, since the text may cover part of the frame.</span>}</span><span className="max-md:hidden">The title is positioned outside this canvas. Center hook moves it to the middle; check the preview afterward, since the text may cover part of the frame.</span></p>
                  <button
                    onClick={() => {
                      // Validate on the current project first (centerProjectHook throws on locked/animated hooks), then keep the
                      // deferred updater non-throwing: a project that became locked meanwhile is returned unchanged.
                      try { centerProjectHook(project as any); }
                      catch (e) { setLockNotice(e instanceof Error ? e.message : 'The hook could not be centered.'); return; }
                      setLockNotice(null);
                      onUpdateProject((prev) => { try { return centerProjectHook(prev as any) as unknown as EditorProject; } catch { return prev; } });
                    }}
                    className="ml-auto shrink-0 text-[11px] font-medium text-amber-100 border border-amber-700/60 rounded px-2 py-0.5 hover:bg-white/5"
                  >
                    Center hook
                  </button>
                </div>
              )}
              {viewMode==='edit' && sourceReviewNotice && (
                <SourceTextReviewBanner notice={sourceReviewNotice}/>
              )}
              {viewMode==='edit' && manualGamingSideReview && <div role="status" className="shrink-0 px-3 py-2 text-[11px] text-amber-200 border-b border-white/10">Review side context. Gameplay views may omit HUD, alerts or action outside the selected source regions. Manual framing does not certify their visibility.</div>}
          {/* Mobile discoverability: collapsed inspector gets an explicit opener in normal flow above the canvas,
              so it never overlaps the rendered video or the caption safe area (an earlier overlay pill obscured cues). */}
          {showRightInspector && inspectorCollapsed && (
            <div className="hidden max-md:flex short:flex shrink-0 justify-center border-b border-white/[0.08] bg-vc-surface1 py-1.5">
              <button
                type="button"
                onClick={() => setInspectorCollapsed(false)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-vc-surface2/95 border border-white/[0.14] text-xs font-semibold text-zinc-100 active:scale-[0.97] transition-transform"
              >
                <span>Open {PRIMARY_TABS.find((t) => t.id === activeSidebarTab)?.label ?? 'panel'}</span>
              </button>
            </div>
          )}
          <PreviewCanvas
            geometryOutputSize={geometryOutputSize}
            automaticPlanReviewRequired={automaticPlanReviewRequired}
            project={project}
            playhead={currentTime}
            isPlaying={isMediaAdvancing}
            sourceOffset={sourceOffset}
            cleanSourceUrl={cleanSourceUrl}
            renderedPreviewUrl={renderedPreviewUrl}
            viewMode={viewMode}
            speakerSplit={speakerSplit}
            groupReframe={speakerSplit?.groupFrame ?? null}
            contentFramingDecision={speakerSplit?.contentFramingDecision ?? null}
            shotComposition={speakerSplit?.shotComposition ?? null}
            bareSmartSplitReview={speakerSplit?.bareSmartSplitReview ?? null}
            autoCandidateEnabled={autoCandidateEnabled}
            autoCandidateMixed={projectAutoCandidateState(project)==='mixed'}
            onSetAutoCandidate={enabled=>{onCommitProject?.(project);onUpdateProject(prev=>setProjectAutoCandidate(prev,enabled));}}
            onSetAutomaticFraming={(itemId,enabled,sourceTime)=>onUpdateProject(prev=>({...prev,tracks:prev.tracks.map(t=>t.type!=='VIDEO'?t:{...t,items:t.items.map(i=>itemId&&i.id!==itemId?i:{...i,automatic_framing:{enabled,...(!enabled?{freeze_source_time:sourceTime}:{})}})})}))}
            compositionClipStart={compositionSourceStart}
            lowConfidenceTrack={Boolean(speakerSplit?.lowConfidenceTrack)}
            watermarkRequired={watermarkRequired}
            onPlayheadChange={seek}
            onTogglePlay={togglePlay}
            selectedItemId={selectedItemId}
            onSelectItem={(id) => selectItem(id, id ? (project.tracks.find((t) => t.items.some((i) => i.id === id))?.id ?? null) : null)}
            onTurnOffHook={(itemId) => {
              const lockedHook = (prj: EditorProject) => { const t = prj.tracks.find((x) => x.items.some((i) => i.id === itemId)); return !t || t.locked || Boolean(t.items.find((i) => i.id === itemId)?.locked); };
              if (lockedHook(project)) { setLockNotice('Unlock the hook layer before turning it off. Nothing was changed.'); return; }
              clearSelection();
              setExportStale(true);
              onUpdateProject((prev) => lockedHook(prev) ? prev : ({
                ...prev,
                tracks: prev.tracks.map((t) => t.items.some((i) => i.id === itemId)
                  ? { ...t, items: t.items.map((i) => i.id === itemId ? { ...i, hidden: true } : i) }
                  : t),
              }));
            }}
            onTurnOffCaptions={() => {
              const lockedCaps = (prj: EditorProject) => prj.tracks.some((t) => t.type === 'CAPTION' && (t.locked || t.items.some((i) => i.locked)));
              if (lockedCaps(project)) { setLockNotice('Unlock the caption layer before turning captions off. Nothing was changed.'); return; }
              clearSelection();
              setExportStale(true);
              onUpdateProject((prev) => lockedCaps(prev) ? prev : ({ ...prev, tracks: prev.tracks.map((t) => t.type === 'CAPTION' ? { ...t, hidden: true } : t) }));
            }}
            onDeleteItem={(itemId) => {
              const track = project.tracks.find((t) => t.items.some((i) => i.id === itemId));
              if (track) {
                if (onDeleteTrackItem) {
                  onDeleteTrackItem(track.id, itemId);
                } else {
                  onUpdateProject((prev) => ({
                    ...prev,
                    tracks: prev.tracks.map((t) =>
                      t.id === track.id ? { ...t, items: t.items.filter((i) => i.id !== itemId) } : t
                    ),
                  }));
                }
              }
              clearSelection();
            }}
            onCommitProject={onCommitProject}
            onUpdateItemPlacement={(itemId,manual_placement,options,manual_source_crop)=>{
              const track=project.tracks.find(t=>t.items.some(i=>i.id===itemId));const item=track?.items.find(i=>i.id===itemId);
              if(!track||!item||track.locked||item.locked)return;
              const time=item.source_start+(currentTime-item.timeline_start)*(item.speed?.speed||1);
              onUpdateTrackItem(track.id,itemId,placementUpdate(item,time,manual_placement,manual_source_crop),options);
            }}
            onUpdateItemTransform={(itemId, transform, options) => {
              if (selectedTrackId) {
                onUpdateTrackItem(selectedTrackId, itemId, { transform }, options);
              }
            }}
            onBeginCrop={() => {
              const pausedAt=pauseForEdit();
              if (typeof window !== 'undefined' && window.innerWidth < 768) {
                clearSelection(); setActiveSidebarTab('captions'); setInspectorCollapsed(true); setTranscriptCollapsed(true);
              }
              return pausedAt;
            }}
            onUpdateItemCrop={(itemId, crop, options) => {
              const track = project.tracks.find((t) => t.items.some((i) => i.id === itemId));
              if (track && !track.locked && !track.items.find(i => i.id===itemId)?.locked) {
                const item=track.items.find(i=>i.id===itemId)!;const time=item.source_start+(currentTime-item.timeline_start)*(item.speed?.speed||1);
                onUpdateTrackItem(track.id,itemId,sceneCropPanelUpdate(item,time,{crop}),options); // a manual crop replaces an accepted context window
              }
            }}
            onUpdateItemPanels={(itemId, panels, options, sourceRange?: {start:number;end:number}) => {
              const track = project.tracks.find((t) => t.items.some((i) => i.id === itemId));
              if (track && !track.locked && !track.items.find(i => i.id === itemId)?.locked) {
                const item=track.items.find(i=>i.id===itemId)!;const time=item.source_start+(currentTime-item.timeline_start)*(item.speed?.speed||1);
                if(sourceRange){onUpdateProject(prev=>applyDisplayedPanelCrop(prev,itemId,time,panels,sourceRange),options);return;}
                onUpdateTrackItem(track.id,itemId,sceneCropPanelUpdate(item,time,{panels}),options);
              }
            }}
            smartReframe={automaticPlanReviewRequired?null:smartReframe}
            showSafeGuides={showSafeGuides}
            onToggleSafeGuides={toggleSafeGuides}
            onChangeAspectRatio={(aspectRatio) => {
              onUpdateProject((prev) => ({
                ...prev,
                canvas: normalizeEditorCanvasAspect({
                  ...prev.canvas,
                  aspect_ratio: aspectRatio,
                }),
              }));
            }}
            clipId={clip.id}
            onSetTracker={({ itemId,isCurrent }, tracker) => {
              onUpdateProject((prev) => isCurrent&&!isCurrent()?prev:({
                ...prev,
                tracks: prev.tracks.map((t) => t.type !== 'VIDEO'||t.locked ? t : {
                  ...t,
                  items: t.items.map((i) => {
                    if (i.locked || itemId && i.id !== itemId) return i;
                    const next: any = { ...i };
                    if (tracker) { next.tracker = tracker; delete next.framing_window; } else delete next.tracker;
                    return next;
                  }),
                }),
              }));
            }}
            onUpdateCanvas={(patch) => {
              onUpdateProject((prev) => ({ ...prev, canvas: { ...prev.canvas, ...patch } }));
            }}
            onPickWholeClipLayout={layout=>{onCommitProject?.(project);onUpdateProject(prev=>applyWholeClipLayout(prev,layout,layoutSubjectKeyframes,layoutSubjectSourceSize,measuredPanelChoices,currentSourceVersionRef.current));}}
            onPickSceneLayout={(itemId, layout) => {
              onCommitProject?.(project);
              onUpdateProject((prev) => {
                const item=prev.tracks.flatMap(t=>t.type==='VIDEO'?t.items:[]).find(i=>i.id===itemId);if(!item)return prev;
                const offset=compositionSourceStart,sourceTime=item.source_start+(currentTime-item.timeline_start)*(item.speed?.speed||1);
                const shot=speakerSplit?.shotComposition?.find(s=>sourceTime>=s.start+offset&&sourceTime<s.end+offset);
                return applyLayoutAtSourceTime(prev,itemId,sourceTime,layout,shot?{start:shot.start+offset,end:shot.end+offset}:undefined,layoutSubjectKeyframes,layoutSubjectSourceSize,measuredPanelChoices,currentSourceVersionRef.current);
              });
            }}
            onUpdateCropMode={(mode) => {
              splitSeedSequence.current++;hookSeedSequence.current++;
              onUpdateProject(prev => applyFramingStrategy(prev, mode));
            }}
            videoRef={videoRef}
            cues={cues}
            onUpdateCaptionPosition={(pos, options) => {
              const captionTrack = project.tracks.find((t) => t.type === 'CAPTION');
              const item = captionTrack?.items[0];
              if (item && captionTrack) {
                const isObj = typeof pos === 'object';
                const cueId = isObj ? (pos as any).cueId : undefined;
                const newFontSize = isObj ? (pos as any).fontSize : undefined;

                if (cueId) {
                  // Per-cue position leaves global layout anchoring and other cues alone.
                  const updatedCaption: EditorCaptionItem = {
                    ...(isObj && pos.resetCuePosition ? (resetCuePosition(item.caption,cueId) ?? applyCuePosition(undefined,cueId,{})) : applyCuePosition(item.caption,cueId,isObj?pos:{})),
                    ...(newFontSize !== undefined ? {font_size:newFontSize}:{}),
                  };

                  onUpdateTrackItem(captionTrack.id, item.id, {
                    caption: updatedCaption,
                  }, options);
                } else {
                  // Global position / font size update
                  const posX = isObj && pos.x !== undefined ? pos.x : (item.caption?.position_x ?? 0.5);
                  const posY = isObj ? (pos.y ?? item.caption?.position_y ?? 0.667) : pos;
                  const updatedCaption: EditorCaptionItem = {
                    position_explicit: true,
                    cues: item.caption?.cues || [],
                    style: item.caption?.style || 'clean',
                    position: item.caption?.position || 'bottom',
                    ...captionLegacyColorDefaults(item.caption, '#FF6B35'),
                    ...item.caption,
                    position_x: Number(posX.toFixed(3)),
                    position_y: Number(posY.toFixed(3)),
                    ...(newFontSize !== undefined ? { font_size: newFontSize } : {}),
                  };
                  onUpdateTrackItem(captionTrack.id, item.id, {
                    caption: updatedCaption,
                    transform: {
                      ...item.transform,
                      position_x: Number(((posX - 0.5) * 1920).toFixed(1)),
                      position_y: Number((posY * 1080).toFixed(1)),
                    },
                  }, options);
                }
              }
            }}
          />
        </div>

        {/* TRANSCRIPT DOCK — persistent on the far right, independent of the selected tool */}
        {transcriptCollapsed ? (
          <div className="w-10 shrink-0 max-md:absolute short:absolute max-md:right-0 short:right-0 max-md:top-0 short:top-0 max-md:h-auto short:h-auto max-md:rounded-bl-xl short:rounded-bl-xl max-md:z-40 short:z-40 glass-rail flex flex-col items-center py-3 z-20 border-l border-white/[0.08]">
            <button
              onClick={toggleTranscriptCollapsed}
              title="Show transcript"
              aria-label="Show transcript"
              className="w-7 h-7 max-md:w-10 short:w-10 max-md:h-10 short:h-10 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white flex items-center justify-center transition-colors"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
            <span className="mt-3 text-[9px] font-medium uppercase tracking-[0.12em] text-neutral-500 [writing-mode:vertical-rl] rotate-180">
              Transcript
            </span>
          </div>
        ) : (
          <div className="w-[320px] md:w-[340px] xl:w-[360px] max-md:absolute short:absolute max-md:left-[52px] short:left-[52px] max-md:right-0 short:right-0 max-md:bottom-0 short:bottom-0 max-md:w-auto short:w-auto max-md:h-[34%] short:h-[34%] max-md:z-30 short:z-30 max-md:border-l-0 short:border-l-0 max-md:border-t short:border-t max-md:rounded-t-2xl short:rounded-t-2xl shrink-0 glass-dock flex flex-col min-h-0 z-20 border-white/[0.08] md:border-l">
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {actionNotice && (
                <div className="mx-3 mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-800/50">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-200/90 leading-snug">{actionNotice}</p>
                  <button
                    onClick={() => setActionNotice(null)}
                    className="ml-auto text-amber-300/70 hover:text-amber-200 text-xs px-1"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              )}
              {extendCaptionNotice && (
                <div className="mx-3 mt-2 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-950/40 border border-amber-800/50">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[11px] text-amber-200/90 leading-snug">{extendCaptionNotice}</p>
                  <button
                    onClick={() => setExtendCaptionNotice(null)}
                    className="ml-auto text-amber-300/70 hover:text-amber-200 text-xs px-1"
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </div>
              )}
              {transcriptPanel}
            </div>
          </div>
        )}

        {/* FULLSCREEN / EXPANDED AI WORKSPACE MODAL OVERLAY */}
        {activeSidebarTab === 'ai_tools' && activeAiTool !== 'copilot' && (
          <div className="absolute inset-0 z-40 bg-vc-canvas/95 flex flex-col overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="h-12 px-6 border-b border-white/[0.08] flex items-center justify-between bg-vc-surface1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="font-semibold text-white capitalize text-sm">
                  {activeAiTool.replace('_', ' ')} Studio
                </span>
              </div>
              <button
                onClick={() => setActiveSidebarTab('captions')}
                className="px-3 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-medium text-neutral-300 flex items-center gap-1.5 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Canvas</span>
              </button>
            </div>

            {/* AI Workspace Body */}
            <div className="flex-1 overflow-auto p-4">
              {activeAiTool === 'producer' && (
                <ProducerPanel
                  clipId={clip.id}
                  clip={clip}
                  onPlanApplied={() => onReloadData()}
                />
              )}

              {activeAiTool === 'translate' && (
                <TranslationWorkspace
                  project={project}
                  sourceTranscriptText={cues.map((c) => c.text).join(' ')}
                  sourceSegments={cues.map((c, i) => ({
                    id: c.id || `cue-${i}`,
                    start: c.start,
                    end: c.end,
                    text: c.text,
                    speaker_id: 'speaker-0',
                  }))}
                  onApplyCaptions={(_lang, translatedSegs) => {
                    const newCues: TimedCaptionCue[] = translatedSegs.map((s, idx) => ({
                      id: s.segment_id || `cue-${idx}`,
                      start: s.start_time,
                      end: s.end_time,
                      text: s.translated_text,
                    }));
                    newCues.forEach((nc) => onUpdateCueText(nc.id, nc.text));
                  }}
                  onRefreshProject={onReloadData}
                />
              )}

              {activeAiTool === 'content_pack' && (
                <ContentPackWorkspace
                  projectId={clip.project_id}
                  clipId={clip.id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                  onOpenHookLab={() => setActiveAiTool('hook_lab')}
                  onOpenThumbnailLab={() => setActiveAiTool('thumbnail_lab')}
                />
              )}

              {activeAiTool === 'hook_lab' && (
                <HookLabWorkspace
                  clipId={clip.id}
                  projectId={clip.project_id}
                  editorProjectId={project.id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                  onEditorProjectUpdated={onReloadData}
                />
              )}

              {activeAiTool === 'thumbnail_lab' && (
                <ThumbnailLabWorkspace
                  clipId={clip.id}
                  projectId={clip.project_id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                />
              )}

              {activeAiTool === 'autopilot' && (
                <AutopilotWorkspace
                  clipId={clip.id}
                  projectId={clip.project_id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                />
              )}

              {activeAiTool === 'ab_studio' && (
                <ABStudioWorkspace
                  clipId={clip.id}
                  projectId={clip.project_id}
                  clipTitle={clip.title || 'Clip'}
                  clipDurationSeconds={clip.duration_seconds}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* HORIZONTAL DIVIDER 3: Top of Timeline */}
      {!isTimelineCollapsed && (
        <div
          onPointerDown={handleStartResizeTimeline}
          className="h-2.5 -my-1 cursor-row-resize relative z-30 group flex items-center justify-center transition-all select-none shrink-0"
          title="Drag to adjust timeline height"
        >
          <div className="h-[1px] w-full bg-white/[0.08] group-hover:bg-violet-400 group-active:bg-violet-400 transition-colors" />
          <div className="absolute left-1/2 -translate-x-1/2 w-12 h-2 rounded-full bg-vc-surface2 border border-white/20 group-hover:border-violet-400 transition-all shadow-md flex items-center justify-center gap-0.5">
            <div className="w-0.5 h-1 bg-white/60 rounded-full" />
            <div className="w-0.5 h-1 bg-white/60 rounded-full" />
            <div className="w-0.5 h-1 bg-white/60 rounded-full" />
          </div>
        </div>
      )}

      {/* 3. MULTI-TRACK UNIFIED TIMELINE */}
      <UnifiedTimeline
        measuredPanelChoices={measuredPanelChoices}
        getCurrentSourceVersion={()=>currentSourceVersionRef.current}
        subjectSourceSize={layoutSubjectSourceSize}
        automaticSceneRanges={(speakerSplit?.shotComposition || []).map(s=>({start:s.start+compositionSourceStart,end:s.end+compositionSourceStart,label:s.split?'Auto Split':Math.abs(s.windowW*(speakerSplit?.sourceWidth||1)/(s.windowH*(speakerSplit?.sourceHeight||1))-9/16)<.01?'Auto Fill':'Auto Fit',review:Boolean((s as any).contextStatus?.startsWith('unresolved')),reason:(s as any).uncertainty}))}
        contentFramingDecision={speakerSplit?.contentFramingDecision ?? null}
        subjectKeyframes={layoutSubjectKeyframes}
        height={timelineHeight}
        project={project}
        clip={clip}
        sourceVideoUrl={cleanSourceUrl}
        playhead={currentTime}
        isPlaying={isPlaying}
        transportSlot={
          <PlaybackController
            currentTime={currentTime}
            duration={duration}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onSeek={seek}
            onStepFrames={stepFrames}
            playbackRate={playbackRate}
            onChangePlaybackRate={setPlaybackRate}
            volume={volume}
            isMuted={isMuted}
            onChangeVolume={setVolume}
            onToggleMute={toggleMute}
            isLooping={isLooping}
            onToggleLoop={toggleLoop}
            showSafeGuides={showSafeGuides}
            onToggleSafeGuides={toggleSafeGuides}
            formatTime={formatTime}
          />
        }
        onPlayheadChange={seek}
        onTogglePlay={togglePlay}
        onUpdateProject={(up, options) => onUpdateProject(() => up, options)}
        onCommitProject={onCommitProject}
        onAddIntroOutro={handleAddIntroOutro}
        selectedItemId={selectedItemId}
        selectedTrackId={selectedTrackId}
        onSelectItem={(itemId, trackId) => selectItem(itemId, trackId)}
        onSplit={() => {
          if (selectedItemId && selectedTrackId) {
            onSplitTrackItem(selectedTrackId, selectedItemId, currentTime);
          }
        }}
        onFreezeFrame={handleFreezeFrame}
        onRippleDelete={() => {
          if (selectedItemId && selectedTrackId) {
            onRippleDeleteTrackItem(selectedTrackId, selectedItemId);
            clearSelection();
          }
        }}
        onDuplicate={() => {
          if (selectedItemId && selectedTrackId) {
            onDuplicateTrackItem(selectedTrackId, selectedItemId);
          }
        }}
        isCollapsed={isTimelineCollapsed}
        onToggleCollapse={handleToggleTimelineCollapse}
        onAddText={() => {
          handleAddTextLayer('New Text Overlay');
          setActiveSidebarTab('text');
        }}
      />

      {/* 4. EXPORT DIALOG */}
      {templateConsent&&(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onKeyDown={event=>{
          event.stopPropagation(); // Editor shortcuts must not mutate the project behind this dialog.
          if(event.key==='Escape'){event.preventDefault();setTemplateConsent(null);}
          if(event.key==='Tab'){const buttons=event.currentTarget.querySelectorAll<HTMLButtonElement>('button');const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="template-consent-title" aria-describedby="template-consent-description" className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral-900 p-5 shadow-2xl text-white">
            <h2 id="template-consent-title" className="text-base font-semibold">Change canvas with locked content?</h2>
            <p id="template-consent-description" className="mt-3 text-sm text-neutral-300 leading-relaxed">Apply {templateConsent.name} at {templateConsent.aspect}? Locked content keeps its coordinates and may be cropped by the new canvas. Nothing will be repositioned. Undo restores the previous project.</p>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" autoFocus className="rounded-lg border border-white/20 px-4 py-2 text-sm" onClick={()=>setTemplateConsent(null)}>Cancel</button>
              <button type="button" className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold" onClick={()=>handleApplyOutputTemplate(templateConsent.templateId,templateConsent)}>Apply template</button>
            </div>
          </section>
        </div>
      )}
      <ExportDialog
        resolution={geometryResolution}
        onResolutionChange={setGeometryResolution}
        isOpen={isExportDialogOpen}
        onClose={() => {
          setIsExportDialogOpen(false);
          // Success/error feedback is transient: once dismissed, reopening shows
          // the settings view again (with the download row while the render is
          // current, or the stale notice when edits happened since).
          clearRenderStatus();
        }}
        clip={clip}
        project={project}
        duration={duration}
        isRendering={isRendering}
        renderProgress={renderProgress}
        renderStage={renderStage}
        renderError={renderError}
        onResolveSavedRequest={resolveSavedRequest}
        renderSuccessMsg={renderSuccessMsg}
        onTriggerRender={async (resolution) => {
          // Flush pending edits first so export renders the caption preset the preview shows
          const saved = await onSaveNow();
          if (saved !== false) triggerRender(resolution);
        }}
        downloadUrl={renderedPreviewUrl}
        watermarkRequired={watermarkRequired}
        captionsEnabled={!project.tracks.find((t) => t.type === 'CAPTION')?.hidden}
        onToggleCaptions={handleToggleCaptions}
        downloadStale={exportStale || editorProjectStale}
        hookControls={hookControls}
      />

      {/* 5. COMMAND PALETTE (Cmd+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onSplit={() => {
          if (selectedItemId && selectedTrackId) {
            onSplitTrackItem(selectedTrackId, selectedItemId, currentTime);
          }
        }}
        onAddText={() => handleAddTextLayer('New Text Overlay')}
        onAddCaption={() => handleApplyCaptionPreset(NEW_CAPTION_PRESET_ID)}
        onReframe={() => {}}
        onNormalizeAudio={() => {}}
        onOpenProducer={() => setActiveAiTool('producer')}
        onRender={() => setIsExportDialogOpen(true)}
        onUndo={onUndo}
        onRedo={onRedo}
      />

      {/* INTRO / OUTRO CHOICE POPOVER */}
      {introOutroMenu && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center glass-scrim"
          onClick={() => setIntroOutroMenu(null)}
        >
          <div
            className="glass-float rounded-3xl p-5 w-[320px]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={`Add ${introOutroMenu}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white capitalize">Add {introOutroMenu}</h3>
              <button
                type="button"
                onClick={() => setIntroOutroMenu(null)}
                className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/[0.06]"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleInsertTitleCard(introOutroMenu)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-vc-canvas border border-white/[0.08] hover:border-white/30 hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <TypeIcon className="w-5 h-5 text-neutral-300" />
                <span className="text-xs font-medium text-white">Title card</span>
                <span className="text-[10px] text-neutral-500 text-center leading-snug">Editable text on a solid background</span>
              </button>
              <button
                type="button"
                onClick={() => handlePickMediaForIntroOutro(introOutroMenu)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-vc-canvas border border-white/[0.08] hover:border-white/30 hover:bg-white/[0.06] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <Film className="w-5 h-5 text-zinc-300" />
                <span className="text-xs font-medium text-white">From media</span>
                <span className="text-[10px] text-neutral-500 text-center leading-snug">Pick a clip or image from your library</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
