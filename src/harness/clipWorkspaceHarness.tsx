// TEST-ONLY harness: mounts the real ClipWorkspace with mocked clip services
// (no auth, no network) so the caption preset / word-mode editor controls can
// be pixel-verified locally. Does not touch auth or production code.
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ClipWorkspace } from '../components/clips/ClipWorkspace';
import { clipService } from '../services/clipService';
import { clipRenderService } from '../services/clipRenderService';
import '../index.css';

const mockCandidate: any = {
  id: 'cand-1',
  project_id: 'harness-project',
  user_id: 'harness-user',
  start_segment_index: 0,
  end_segment_index: 3,
  start_seconds: 351.14,
  end_seconds: 402.45,
  duration_seconds: 51.31,
  title: 'The Crewed Lunar Vehicle: A New Frontier',
  hook: 'NASA is building a new crewed lunar vehicle.',
  reason: 'Strong opening hook and sustained visual interest.',
  category: 'hook',
  engagement_score: 87,
  status: 'suggested',
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockTranscript: any = {
  id: 't-1',
  project_id: 'harness-project',
  segments: [
    { start: 351.14, end: 353.0, text: 'Remotely operated vehicles', words: [
      { text: 'Remotely', word: 'Remotely', start: 351.14, end: 351.7 },
      { text: 'operated', word: 'operated', start: 351.7, end: 352.3 },
      { text: 'vehicles', word: 'vehicles', start: 352.3, end: 353.0 },
    ]},
  ],
  words: [
    { text: 'Remotely', word: 'Remotely', start: 351.14, end: 351.7 },
    { text: 'operated', word: 'operated', start: 351.7, end: 352.3 },
    { text: 'vehicles', word: 'vehicles', start: 352.3, end: 353.0 },
  ],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

(clipService as any).getClipCandidates = async () => [mockCandidate];
(clipService as any).findMoments = async () => [];
(clipService as any).analyzeClips = async () => ({ candidates: [mockCandidate] });
(clipService as any).updateClipCandidateStatus = async () => mockCandidate;
(clipRenderService as any).getProjectClips = async () => [];

function Harness() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('preset') === 'karaoke' || q.get('mode') === 'single') {
      // Wait for candidate to load + panel render, then flip preset select to karaoke
      const tryFlip = (attempts: number) => {
        const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
        const presetSelect = selects.find((s) => Array.from(s.options).some((o) => o.value === 'karaoke'));
        if (presetSelect) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
          setter.call(presetSelect, 'karaoke');
          if (q.get('mode') === 'single') {
            setTimeout(() => {
              const s2 = (Array.from(document.querySelectorAll('select')) as HTMLSelectElement[]).find((s) => Array.from(s.options).some((o) => o.value === 'single'));
              if (s2) { setter.call(s2, 'single'); s2.dispatchEvent(new Event('change', { bubbles: true })); document.title = 'flipped-single'; }
            }, 600);
          }
          presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
          document.title = 'flipped';
        } else if (attempts > 0) {
          setTimeout(() => tryFlip(attempts - 1), 300);
        }
      };
      setTimeout(() => tryFlip(20), 800);
    }
  }, []);
  return (
    <MemoryRouter>
      <div style={{ background: '#0a0a0b', minHeight: '100vh', padding: 16 }}>
        <ClipWorkspace projectId="harness-project" transcript={mockTranscript} videoPreviewUrl="/harness/clip.mp4" />
      </div>
    </MemoryRouter>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
