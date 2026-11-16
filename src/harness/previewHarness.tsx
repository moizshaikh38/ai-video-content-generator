// TEST-ONLY harness: mounts the real PreviewCanvas with a synthetic one-item
// project so the crop-pan drag can be exercised and pixel-verified locally.
// This is not auth and not an E2E of the app shell - it drives the same
// component + callback contract EditorShell uses.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { PreviewCanvas } from '../components/editor/PreviewCanvas';
import { FramingWorkspacePanel } from '../components/editor/FramingWorkspacePanel';
import { EditorShell } from '../components/editor/EditorShell';
import { applyOutputTemplateToProject, getOutputTemplate, OutputTemplateId } from '../../server/src/shared/outputTemplates';
import { buildClipEditorUpdatePayload } from '../lib/editorSavePayload';
import { proEditorService } from '../services/proEditorService';
import { clipRenderService } from '../services/clipRenderService';
import { supabase } from '../lib/supabase';
import { EditorProject, EditorTrackItem } from '../types';
import '../index.css';

declare global {
  interface Window {
    __cropCalls: Array<{ itemId: string; crop: { mode: string; focusX: number; focusY: number } }>;
    __commits: number;
    __playToggles: number;
  }
}

window.__cropCalls = [];
window.__commits = 0;
window.__playToggles = 0;

const baseItem: EditorTrackItem = {
  id: 'item-1',
  track_id: 'track-video-1',
  type: 'VIDEO',
  name: 'harness-clip',
  timeline_start: 0,
  timeline_end: 4,
  source_start: 0,
  source_end: 4,
  transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
  speed: { speed: 1, pitch_preserved: true },
  keyframes: [],
} as unknown as EditorTrackItem;

const params = new URLSearchParams(window.location.search);
const AR = (params.get('ar') || '9:16') as '9:16' | '1:1' | '16:9';
const vp = params.get('video');
const VIDEO_URL = vp === 'portrait' ? '/harness/clip-portrait.mp4' : vp === 'twoshot' ? '/harness/clip-twoshot.mp4' : '/harness/clip.mp4';
// TEST-ONLY: ?framing=split exercises the split-layout preview (top/bottom speaker stack).
if (params.get('framing') === 'split') {
  (baseItem as any).layout_mode = 'split';
  (baseItem as any).crop_config = { split: { speaker1X: Number(params.get('spk1')) || 0.25, speaker2X: Number(params.get('spk2')) || 0.75 } };
}
// TEST-ONLY: ?captions=split exercises split-zone caption attribution in the
// preview (cue near speaker1's keyframe -> top-half band at y 0.4; cue near
// speaker2 -> default bottom band; an explicitly positioned cue never moves).
const SPLIT_CAPTIONS = params.get('captions') === 'split';
const SPK1 = Number(params.get('spk1')) || 0.33;
const SPK2 = Number(params.get('spk2')) || 0.56;
const HARNESS_CUES = SPLIT_CAPTIONS
  ? [
      { id: 'c1', start: 0.5, end: 2.0, text: 'TOP SPEAKER LINE' },
      { id: 'c2', start: 2.5, end: 4.5, text: 'BOTTOM SPEAKER LINE' },
      { id: 'c3', start: 6.0, end: 8.0, text: 'PINNED LINE', position_y: 0.6 },
    ]
  : [];
const HARNESS_SPEAKER_SPLIT = SPLIT_CAPTIONS
  ? {
      keyframes: [
        { time: 1, centerX: SPK1 },
        { time: 3, centerX: SPK2 },
        { time: 7, centerX: SPK1 },
      ],
      speaker1X: SPK1,
      speaker2X: SPK2,
    }
  : null;
const PLAYHEAD = Number(params.get('t')) || 1;
const CANVAS_DIMS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 360, height: 640 },
  '1:1': { width: 480, height: 480 },
  '16:9': { width: 640, height: 360 },
};

const makeProject = (item: EditorTrackItem): EditorProject =>
  ({
    id: 'harness-project',
    user_id: 'harness-user',
    project_id: 'harness-project',
    clip_id: 'harness-clip',
    version: 1,
    status: 'draft',
    title: 'Crop drag harness',
    canvas: {
      width: CANVAS_DIMS[AR].width,
      height: CANVAS_DIMS[AR].height,
      aspect_ratio: AR,
      fps: 30,
      duration: 4,
      background_color: '#000000',
      background_mode: 'color',
    },
    tracks: [
      {
        id: 'track-video-1',
        type: 'VIDEO',
        name: 'Video 1',
        locked: false,
        muted: true,
        hidden: false,
        items: [item],
      },
      ...(SPLIT_CAPTIONS
        ? [
            {
              id: 'track-caption-1',
              type: 'CAPTION',
              name: 'Captions',
              locked: false,
              muted: false,
              hidden: false,
              items: [
                {
                  id: 'cap-1',
                  track_id: 'track-caption-1',
                  type: 'CAPTION',
                  timeline_start: 0,
                  timeline_end: 9,
                  keyframes: [],
                  caption: { style: 'clean', position: 'bottom' },
                },
              ],
            },
          ]
        : []),
    ],
    playhead: 0,
    settings: { snapping: true, safe_guides: false, snap_tolerance_sec: 0.1, show_safe_zones: false },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as EditorProject);

// TEST-ONLY: ?panel=templates mounts the real FramingWorkspacePanel so a
// template card click can be driven end-to-end into the preview: the handler
// mirrors EditorShell.handleApplyOutputTemplate (shared mapper + split-anchor
// seeding; the GET /reframe fetch is stood in by the spk1/spk2 params).
const SHOW_PANEL = params.get('panel') === 'templates';

// TEST-ONLY: ?shell=templates mounts the REAL EditorShell against the local
// fixture backend (harness-backend.mts; real routes, only the Supabase
// verifier stubbed). The session stub below is the client half of that
// labeled pattern. clip + token come from the fixture's BACKEND_READY line.
const SHOW_SHELL = params.get('shell') === 'templates';
const SHELL_CLIP_ID = params.get('clip') || '';
const SHELL_TOKEN = params.get('token') || 'editorshell-proof-token';
if (SHOW_SHELL) {
  (supabase.auth as any).getSession = async () => ({
    data: { session: { access_token: SHELL_TOKEN, expires_at: Math.floor(Date.now() / 1000) + 3600 } },
    error: null,
  });
  (supabase.auth as any).refreshSession = async () => ({
    data: { session: { access_token: SHELL_TOKEN, expires_at: Math.floor(Date.now() / 1000) + 3600 } },
    error: null,
  });
}

function ShellTemplateApp() {
  const [project, setProject] = useState<EditorProject>(() => ({
    id: 'shell-proof-project',
    clip_id: SHELL_CLIP_ID,
    canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: 9, background_color: '#000000' },
    tracks: [
      {
        id: 'track-video-1', type: 'VIDEO', name: 'Video 1', locked: false, muted: false, hidden: false,
        items: [
          {
            id: 'item-1', track_id: 'track-video-1', type: 'VIDEO',
            timeline_start: 0, timeline_end: 4.5, source_start: 0, source_end: 4.5,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1, pitch_preserved: true },
            keyframes: [], effects: [], hidden: false, locked: false, muted: false,
          },
          // Second scene so template transitions have a join to land on.
          {
            id: 'item-2', track_id: 'track-video-1', type: 'VIDEO',
            timeline_start: 4.5, timeline_end: 9, source_start: 4.5, source_end: 9,
            transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
            speed: { speed: 1, pitch_preserved: true },
            keyframes: [], effects: [], hidden: false, locked: false, muted: false,
          },
        ],
      },
      // Marked design_center overlay so overlay preview/export parity is
      // provable in this harness: loopback URL resolves in the browser and
      // passes the dev-loopback asset validator; the render proof pre-writes
      // the overlay_<id> tmp cache exactly like the real pipeline's download.
      {
        id: 'track-overlay-1', type: 'OVERLAY', name: 'Elements & Stickers', locked: false, muted: false, hidden: false,
        items: [
          {
            id: 'ovl-proof-1', track_id: 'track-overlay-1', type: 'OVERLAY', name: 'Logo mark',
            timeline_start: 0, timeline_end: 9, source_start: 0, source_end: 9,
            source_path: 'vireo-mark.png',
            transform: { position_x: 60, position_y: -200, scale: 0.5, rotation: 0, opacity: 1, position_space: 'design_center' },
            // ?noovl=1 hides this overlay-parity fixture logo for clean
            // preview/export framing comparisons.
            keyframes: [], effects: [], hidden: params.get('noovl') === '1', locked: false, muted: false, z_index: 25,
          },
        ],
      },
      // Real captions track so template caption legs apply to actual cues.
      {
        id: 'track-caption-1', type: 'CAPTION', name: 'Captions', locked: false, muted: false, hidden: false,
        items: [
          {
            id: 'cap-1', track_id: 'track-caption-1', type: 'CAPTION',
            timeline_start: 0, timeline_end: 9,
            caption: {
              cues: [
                { start: 0.5, end: 2.0, text: 'hello world this is' },
                { start: 2.5, end: 4.5, text: 'a real caption cue' },
              ],
            },
            keyframes: [], effects: [], hidden: false, locked: false, muted: false,
          },
        ],
      },
    ],
    playhead: 0,
    settings: { snapping: true, safe_guides: false, snap_tolerance_sec: 0.1, show_safe_zones: false },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as EditorProject));

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty' | 'error'>('saved');

  // REAL save path: mirrors useEditorAutosave exactly - the real client
  // services (proEditorService + clipRenderService) against the fixture
  // backend: full project first (tracks carry hook/transitions/captions),
  // then the synced clip fields via the client's own payload builder.
  const saveNow = async () => {
    setSaveStatus('saving');
    try {
      const editorProject = await proEditorService.getOrCreateEditorProject(SHELL_CLIP_ID);
      const savedProject = await proEditorService.updateEditorProject(editorProject.id, {
        title: (project as any).title || 'Two shot template clip',
        canvas: project.canvas,
        tracks: project.tracks,
        playhead: project.playhead,
        settings: project.settings,
        version: (project as any).version,
      } as any);
      const clipRow = await clipRenderService.getClip(SHELL_CLIP_ID);
      const payload = buildClipEditorUpdatePayload(project as any, clipRow);
      await clipRenderService.updateClipEditor(SHELL_CLIP_ID, payload);
      const afterClip: any = await clipRenderService.getClip(SHELL_CLIP_ID);
      const afterProject: any = await proEditorService.getEditorProject(editorProject.id);
      const textItems = (afterProject.tracks || []).find((t: any) => t.type === 'TEXT')?.items || [];
      const videoItems = (afterProject.tracks || []).find((t: any) => t.type === 'VIDEO')?.items || [];
      const captionItems = (afterProject.tracks || []).find((t: any) => t.type === 'CAPTION')?.items || [];
      (window as any).__saveResult = {
        savedCropConfig: afterClip?.crop_config,
        clipCaptionStyle: afterClip?.caption_style,
        clipCaptionPosition: afterClip?.caption_position,
        projectVersion: savedProject?.version,
        hookItems: textItems.map((i: any) => ({ start: i.timeline_start, end: i.timeline_end, text: i.text?.text, template: i.text?.template_id })),
        videoTransitions: videoItems.map((i: any) => (i as any).transition_in || null),
        captionLegs: captionItems.map((i: any) => ({ style: i.caption?.style, position: i.caption?.position, cues: i.caption?.cues?.length })),
      };
      setSaveStatus('saved');
      return true;
    } catch (e: any) {
      (window as any).__saveResult = { error: String(e?.message || e) };
      setSaveStatus('error');
      return false;
    }
  };
  // TEST-ONLY: lets proof scripts trigger the real save path headlessly.
  (window as any).__saveNow = saveNow;

  return (
    <MemoryRouter>
      <EditorShell
        {...({
          clip: {
            id: SHELL_CLIP_ID, title: 'Two shot template clip', aspect_ratio: '9:16',
            caption_enabled: true, render_status: 'ready', duration_seconds: 9,
            // Mirrors the mongo fixture clip: smart reframe mode so the shell
            // fetches the real reframe track for the base-video preview pan.
            crop_config: { mode: 'smart' }, start_seconds: 0,
          },
          project,
          cleanSourceUrl: '/harness/clip-twoshot.mp4',
          renderedPreviewUrl: null,
          // ?wm=1 exercises the free-plan watermark badge overlay in preview.
          watermarkRequired: params.get('wm') === '1',
          // EditorShell forwards this prop to PreviewCanvas verbatim (the real
          // ClipEditorPage supplies transcript cues); mirror the caption track.
          cues: [
            { id: 'cue-1', start: 0.5, end: 2.0, text: 'hello world this is' },
            { id: 'cue-2', start: 2.5, end: 4.5, text: 'a real caption cue' },
          ],
          canUndo: false, canRedo: false, saveStatus, saveError: null,
          onSaveNow: saveNow,
          onUndo: () => {}, onRedo: () => {},
          onUpdateProject: (updater: any) => { setProject((prev) => updater(prev)); setSaveStatus('dirty'); },
          onCommitProject: () => {},
          // Real item update so crop-drag/manual-override paths are exercisable
          // in this harness (the real ClipEditorPage updates state + persists).
          onUpdateTrackItem: (trackId: string, itemId: string, updates: any) => {
            setProject((prev: any) => ({
              ...prev,
              tracks: prev.tracks.map((t: any) =>
                t.id === trackId
                  ? { ...t, items: t.items.map((i: any) => (i.id === itemId ? { ...i, ...updates } : i)) }
                  : t
              ),
            }));
            setSaveStatus('dirty');
          },
          onUpdateCueText: () => {}, onDeleteCue: () => {},
          onSplitTrackItem: () => {}, onRippleDeleteTrackItem: () => {},
          onDuplicateTrackItem: () => {}, onReloadData: async () => {},
        } as any)}
      />
    </MemoryRouter>
  );
}

function HarnessApp() {
  const [item, setItem] = useState<EditorTrackItem>(baseItem);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const project = makeProject(item);

  const handleApplyOutputTemplate = (templateId: OutputTemplateId) => {
    const tpl = getOutputTemplate(templateId);
    if (!tpl) return;
    const next = applyOutputTemplateToProject(project as any, tpl);
    const videoItems = next.tracks.find((t) => t.type === 'VIDEO')!.items;
    let nextItem = videoItems[0] as any;
    // EditorShell.seedSplitAnchorsFromAnalysis equivalent: the analysis fetch
    // is stubbed by the spk params (measured anchors for this fixture).
    if (tpl.framing.layoutMode === 'split') {
      nextItem = {
        ...nextItem,
        crop_config: {
          ...(nextItem.crop_config || {}),
          split: { speaker1X: Number(params.get('spk1')) || 0.33, speaker2X: Number(params.get('spk2')) || 0.56 },
        },
      };
    }
    (window as any).__template = {
      id: tpl.id,
      layout_mode: nextItem.layout_mode,
      split: nextItem.crop_config?.split || null,
      aspect: next.canvas.aspect_ratio,
    };
    setItem(nextItem);
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      {SHOW_PANEL && (
        <div style={{ width: 300, flexShrink: 0, height: '100%' }}>
          <FramingWorkspacePanel
            project={project}
            showSafeGuides={false}
            onToggleSafeGuides={() => {}}
            onUpdateCropMode={() => {}}
            onApplyOutputTemplate={handleApplyOutputTemplate}
            onUpdateProject={() => {}}
          />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
    <PreviewCanvas
      {...({
        project,
        playhead: PLAYHEAD,
        isPlaying: false,
        cleanSourceUrl: VIDEO_URL,
        renderedPreviewUrl: null,
        viewMode: 'edit',
        onPlayheadChange: () => {},
        onTogglePlay: () => {
          window.__playToggles += 1;
        },
        selectedItemId,
        onSelectItem: (id: string | null) => setSelectedItemId(id),
        onDeleteItem: () => {},
        onUpdateItemTransform: () => {},
        onUpdateItemCrop: (itemId: string, crop: { mode: 'fit' | 'fill' | 'custom'; focusX: number; focusY: number; scale?: number }) => {
          window.__cropCalls.push({ itemId, crop });
          setItem((prev) => ({ ...prev, crop: { ...crop } }));
        },
        onCommitProject: () => {
          window.__commits += 1;
        },
        showSafeGuides: false,
        onToggleSafeGuides: () => {},
        onChangeAspectRatio: () => {},
        onUpdateCropMode: () => {},
        videoRef,
        cues: HARNESS_CUES,
        speakerSplit: HARNESS_SPEAKER_SPLIT,
        onUpdateCaptionPosition: () => {},
      } as any)}
    />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(SHOW_SHELL ? <ShellTemplateApp /> : <HarnessApp />);
