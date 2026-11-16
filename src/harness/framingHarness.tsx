// TEST-ONLY harness: mounts the real FramingWorkspacePanel with a synthetic
// project in screencast layout + an analysis facecam suggestion, so the new
// correction controls can be pixel-verified and click-exercised locally.
// Not auth, not an app-shell E2E - same component + callback contract
// EditorShell uses.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FramingWorkspacePanel } from '../components/editor/FramingWorkspacePanel';
import { EditorProject } from '../types';
import '../index.css';

declare global {
  interface Window {
    __screencastCalls: Array<Record<string, unknown>>;
  }
}
window.__screencastCalls = [];

const project = {
  id: 'harness',
  name: 'harness',
  tracks: [
    {
      id: 'track-video-1',
      type: 'VIDEO',
      items: [
        {
          id: 'item-1',
          track_id: 'track-video-1',
          type: 'VIDEO',
          name: 'harness-clip',
          timeline_start: 0,
          timeline_end: 4,
          source_start: 0,
          source_end: 4,
          layout_mode: 'screencast',
          crop_config: { screencast: { mode: 'rounded_card_inset', insetPosition: 'top_right', background: 'blur' } },
          reframe_metadata: { facecam_box: { x: 0.8594, y: 0.1167, w: 0.0641, h: 0.1139 } },
        },
      ],
    },
  ],
} as unknown as EditorProject;

// ?plan=1 mounts the real ScenePlanReview with a MOCK stored plan (test-only; previewReady forced on for the screenshot).
const mockPlan = new URLSearchParams(location.search).get('plan')
  ? {
      shots: [
        { start: 0, end: 4, kind: 'solo' as const, windowW: 0.5, windowH: 0.6, keyframes: [{ time: 0, centerX: 0.5, centerY: 0.5 }] },
        { start: 4, end: 8, kind: 'group' as const, windowW: 0.5, windowH: 0.6, keyframes: [{ time: 4, centerX: 0.5, centerY: 0.5 }], contextStatus: 'crowd-preserved', uncertainty: 'Important scene regions are unresolved.' },
      ],
      ctx: { clipStartSec: 0, analyzedTrimStart: 0, currentTrimStart: 0, planVersion: 'mock', sourceWidth: 1920, sourceHeight: 1080 },
      previewReady: true,
      onApply: () => ({ ok: true }),
    }
  : null;

function App() {
  const [guides, setGuides] = useState(false);
  return (
    <div style={{ width: 350, height: '100vh' }}>
      <FramingWorkspacePanel
        project={project}
        scenePlan={mockPlan}
        showSafeGuides={guides}
        onToggleSafeGuides={() => setGuides((g) => !g)}
        onUpdateCropMode={() => {}}
        onUpdateLayoutMode={() => {}}
        onUpdateScreencast={(patch) => window.__screencastCalls.push(patch as Record<string, unknown>)}
        onUpdateProject={() => {}}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
