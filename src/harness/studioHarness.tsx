// TEST-ONLY harness: mounts the real EditorShell (the My Clips -> Edit /
// Media Library -> Studio editor) with a mock caption-enabled project and
// no-op service callbacks, so the studio caption controls can be
// pixel-verified locally. No auth or production code changes.
import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { EditorShell } from '../components/editor/EditorShell';
import { buildClipEditorUpdatePayload } from '../lib/editorSavePayload';
import { nasaCues } from './nasaCues';
import '../index.css';

const words = [
  { text: 'Remotely', start: 0.0, end: 0.6 },
  { text: 'operated', start: 0.6, end: 1.2 },
  { text: 'vehicles', start: 1.2, end: 1.8 },
  { text: 'will', start: 1.8, end: 2.1 },
  { text: 'scout', start: 2.1, end: 2.5 },
  { text: 'the', start: 2.5, end: 2.7 },
  { text: 'lunar', start: 2.7, end: 3.1 },
  { text: 'surface', start: 3.1, end: 3.6 },
];

const cues = [
  { id: 'cue-1', start: 0, end: 1.8, text: 'Remotely operated vehicles', words: words.slice(0, 3) },
  { id: 'cue-2', start: 1.8, end: 3.6, text: 'will scout the lunar surface', words: words.slice(3) },
];

const captionItem: any = {
  id: 'cap-item-1',
  track_id: 'track-caption',
  type: 'CAPTION',
  name: 'captions',
  timeline_start: 0,
  timeline_end: 3.6,
  source_start: 0,
  source_end: 3.6,
  // Matches proEditorService's fresh caption item: pixel-offset transform (0 = canvas center).
  transform: { position_x: 0, position_y: 500, scale: 1, rotation: 0, opacity: 1 },
  speed: { speed: 1, pitch_preserved: true },
  keyframes: [],
  caption: {
    cues,
    position: 'bottom',
    style: 'karaoke',
    primary_color: '#FFFFFF',
    highlight_color: '#FFE500',
    animation: 'karaoke',
  },
};

const videoItem: any = {
  id: 'vid-item-1',
  track_id: 'track-video',
  type: 'VIDEO',
  name: 'source',
  timeline_start: 0,
  timeline_end: 2.5,
  source_start: 0,
  source_end: 2.5,
  transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
  speed: { speed: 1, pitch_preserved: true },
  keyframes: [],
};

const initialProject: any = {
  id: 'editor-1',
  user_id: 'harness-user',
  project_id: 'harness-project',
  clip_id: 'clip-1',
  version: 1,
  status: 'draft',
  title: 'Studio harness',
  canvas: { aspect_ratio: '9:16', width: 1080, height: 1920, background_color: '#000000' },
  tracks: [
    { id: 'track-video', type: 'VIDEO', name: 'Video', items: [videoItem], hidden: false, locked: false },
    { id: 'track-caption', type: 'CAPTION', name: 'Captions', items: [captionItem], hidden: false, locked: false },
  ],
  playhead: 0.5,
  settings: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const clip: any = {
  id: 'clip-1',
  project_id: 'harness-project',
  user_id: 'harness-user',
  candidate_id: 'cand-1',
  start_seconds: 0,
  end_seconds: 4,
  duration_seconds: 4,
  aspect_ratio: '9:16',
  crop_mode: 'smart',
  render_status: 'ready',
  caption_enabled: true,
  caption_style: 'karaoke',
  caption_config: { presetId: 'karaoke' },
  caption_position: 'bottom',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Deterministic initial UI state for pixel captures: pre-seed the persisted
// panel pref (typography tab) and, for mode=single, the word-mode fields,
// so screenshots do not depend on post-mount click timing. The click path
// below still exercises the real controls for DOM verification.
const harnessQuery = new URLSearchParams(window.location.search);
try {
  localStorage.setItem('vireo_panel_ui_v1', JSON.stringify({ 'captions.tab': 'typography' }));
} catch {}
const seedProject: any = (() => {
  let p: any = initialProject;
  if (harnessQuery.get('cropmode')) {
    const cm = harnessQuery.get('cropmode');
    p = {
      ...p,
      tracks: p.tracks.map((t: any) =>
        t.id === 'track-video' ? { ...t, items: t.items.map((i: any) => ({ ...i, crop_mode: cm })) } : t
      ),
    };
  }
  if (harnessQuery.get('mode') === 'single') {
    p = {
      ...p,
      tracks: p.tracks.map((t: any) =>
        t.id === 'track-caption'
          ? {
              ...t,
              items: t.items.map((i: any) => ({
                ...i,
                caption: { ...i.caption, max_words_per_cue: 1, max_lines: 1 },
              })),
            }
          : t
      ),
    };
  }
  // ?nasa=1: real clip 0dbae5cd data - NASA source at the clip's source range, real
  // transcript words as single-word karaoke cues, playhead at ?t= for paired export comparison.
  if (harnessQuery.get('nasa') === '1') {
    const t0 = Number(harnessQuery.get('t') || '0');
    p = {
      ...p,
      playhead: t0,
      canvas: { ...p.canvas, duration: 51.31 },
      tracks: p.tracks.map((t: any) => {
        if (t.id === 'track-video') {
          return {
            ...t,
            items: t.items.map((i: any) => ({ ...i, timeline_start: 0, timeline_end: 51.31, source_start: 0, source_end: 3 })),
          };
        }
        if (t.id === 'track-caption') {
          return {
            ...t,
            items: t.items.map((i: any) => ({
              ...i,
              timeline_start: 0,
              timeline_end: 51.31,
              source_end: 51.31,
              caption: { ...i.caption, cues: nasaCues, max_words_per_cue: 1, max_lines: 1 },
            })),
          };
        }
        return t;
      }),
    };
    // ?headline=auto|edited: inject the TEXT track item exactly as proEditorService
    // buildInitialProject mirrors the legacy auto-headline (2-line capped title, first
    // line top at legacy y=150 => block center -249.5 preview px, size tier/3 = 19 at
    // preview scale). 'edited' simulates the user having changed the text to a single line.
    const headlineMode = harnessQuery.get('headline');
    if (headlineMode) {
      const edited = headlineMode === 'edited';
      p = {
        ...p,
        tracks: [
          ...p.tracks,
          {
            id: 'track-text',
            type: 'TEXT',
            name: 'Text & Titles',
            hidden: false,
            locked: false,
            items: [
              {
                id: 'txt-headline',
                track_id: 'track-text',
                type: 'TEXT',
                timeline_start: 0,
                timeline_end: 5,
                source_start: 0,
                source_end: 5,
                transform: { position_x: 0, position_y: -249.5, scale: 1.0, rotation: 0, opacity: 1.0 },
                speed: { speed: 1.0, pitch_preserved: true },
                text: {
                  text: edited ? 'A Better Title' : 'The Crewed Lunar\nVehicle: A New Frontier',
                  font_family: 'Arial',
                  font_size: 19,
                  font_weight: 'regular',
                  italic: false,
                  alignment: 'center',
                  color: '#FFFFFF',
                  preset: 'bold',
                  animation: 'none',
                  auto_headline: true,
                },
                effects: [],
                keyframes: [],
                locked: false,
                muted: true,
                hidden: false,
                z_index: 10,
              },
            ],
          },
        ],
      };
    }
  }
  return p;
})();

function Harness() {
  const [project, setProject] = useState<any>(seedProject);
  const projectRef = useRef<any>(seedProject);
  projectRef.current = project;

  // Switch to the typography tab and (optionally) flip Word Mode, after mount.
  // With ?dump=save, also render the exact clip-editor save payload (built by
  // the same buildClipEditorUpdatePayload the autosave uses) into an overlay
  // so the serialization can be inspected without auth/transport.
  useState(() => {
    const q = new URLSearchParams(window.location.search);
    const dumpPayload = () => {
      if (q.get('dump') !== 'save') return;
      setTimeout(() => {
        const payload = buildClipEditorUpdatePayload(projectRef.current, clip);
        let el = document.getElementById('save-payload');
        if (!el) {
          el = document.createElement('pre');
          el.id = 'save-payload';
          el.style.cssText =
            'position:fixed;left:360px;bottom:8px;z-index:9999;max-width:520px;max-height:260px;overflow:auto;background:#0a0a0a;color:#7ee787;font:10px/1.4 monospace;padding:8px;border:1px solid #333;border-radius:6px;margin:0;white-space:pre-wrap;';
          document.body.appendChild(el);
        }
        el.textContent = 'SAVE PAYLOAD (PATCH /clips/:id/editor body, transport not exercised):\n' + JSON.stringify(payload, null, 2);
        document.title = 'payload-ready';
      }, 400);
    };
    const tryClick = (attempts: number) => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]')) as HTMLElement[];
      const typo = tabs.find((t) => t.id === 'caption-tab-typography');
      if (!typo) {
        if (attempts > 0) setTimeout(() => tryClick(attempts - 1), 400);
        return;
      }
      typo.click();
      if (q.get('extend') === '1') {
        setTimeout(() => {
          const ext = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes('Restore trimmed end'));
          if (ext) (ext as HTMLElement).click();
          document.title = 'extended';
          dumpPayload();
        }, 500);
        return;
      }
      if (q.get('mode') === 'single') {
        setTimeout(() => {
          const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Single word');
          if (btn) (btn as HTMLElement).click();
          document.title = 'flipped-single';
          dumpPayload();
        }, 500);
      } else {
        document.title = 'typography-tab';
        dumpPayload();
      }
    };
    setTimeout(() => tryClick(30), 1200);
    return undefined;
  });

  return (
    <MemoryRouter>
      <EditorShell
        clip={clip}
        project={project}
        cleanSourceUrl={harnessQuery.get('nasa') === '1' ? '/harness/clip-nasa-seg.mp4' : '/harness/clip.mp4'}
        renderedPreviewUrl={null}
        watermarkRequired={false}
        cues={(harnessQuery.get('nasa') === '1' ? nasaCues : cues) as any}
        canUndo={false}
        canRedo={false}
        saveStatus={'saved'}
        saveError={null}
        onSaveNow={() => {}}
        onUndo={() => {}}
        onRedo={() => {}}
        onUpdateProject={(updater: any) => setProject((p: any) => updater(p))}
        onCommitProject={() => {}}
        onUpdateTrackItem={(trackId: string, itemId: string, updates: any) =>
          setProject((p: any) => ({
            ...p,
            tracks: p.tracks.map((t: any) =>
              t.id === trackId
                ? { ...t, items: t.items.map((i: any) => (i.id === itemId ? { ...i, ...updates, caption: updates.caption ? { ...i.caption, ...updates.caption } : i.caption } : i)) }
                : t
            ),
          }))
        }
        onUpdateCueText={() => {}}
        onDeleteCue={() => {}}
        onSplitTrackItem={() => {}}
        onRippleDeleteTrackItem={() => {}}
        onDuplicateTrackItem={() => {}}
        onReloadData={async () => {}}
      />
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
