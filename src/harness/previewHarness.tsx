// TEST-ONLY harness: mounts the real PreviewCanvas with a synthetic one-item
// project so the crop-pan drag can be exercised and pixel-verified locally.
// This is not auth and not an E2E of the app shell - it drives the same
// component + callback contract EditorShell uses.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PreviewCanvas } from '../components/editor/PreviewCanvas';
import { FramingWorkspacePanel } from '../components/editor/FramingWorkspacePanel';
import { applyOutputTemplateToProject, getOutputTemplate, OutputTemplateId } from '../../server/src/shared/outputTemplates';
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

createRoot(document.getElementById('root')!).render(<HarnessApp />);
