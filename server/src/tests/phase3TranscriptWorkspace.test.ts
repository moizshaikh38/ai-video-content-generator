import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  formatTranscriptTime,
  flattenTranscriptWords,
  getWordRangeSelection,
  findActiveWord,
  validateClipSelection,
} from '../../../src/utils/transcriptUtils.js';
import {
  sliceAndShiftCues,
  applyRippleCutToProject,
} from '../utils/editorRippleCut.js';
import { CaptionService } from '../services/captionService.js';
import type { EditorProject, TimedCaptionCue } from '../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../');

describe('Phase 3 — Transcript Workspace: Timestamp Formatting & Resilience', () => {
  it('formats valid timestamps into MM:SS.s with zero padding', () => {
    assert.equal(formatTranscriptTime(0), '00:00.0');
    assert.equal(formatTranscriptTime(4.2), '00:04.2');
    assert.equal(formatTranscriptTime(59.9), '00:59.9');
    assert.equal(formatTranscriptTime(65.4), '01:05.4');
    assert.equal(formatTranscriptTime(360.05), '06:00.1');
  });

  it('safely handles missing, null, undefined, negative, or NaN timestamps without throwing', () => {
    assert.equal(formatTranscriptTime(undefined), '00:00.0');
    assert.equal(formatTranscriptTime(null), '00:00.0');
    assert.equal(formatTranscriptTime(NaN), '00:00.0');
    assert.equal(formatTranscriptTime(-10.5), '00:00.0');
    assert.equal(formatTranscriptTime(Infinity as any), '00:00.0');
  });
});

describe('Phase 3 — Transcript Workspace: Word Flattening & Seeking', () => {
  const sampleCues: TimedCaptionCue[] = [
    {
      id: 'cue-1',
      start: 1.0,
      end: 3.5,
      text: 'Welcome to VireoClip studio',
      words: [
        { text: 'Welcome', start: 1.0, end: 1.5, confidence: 0.98 },
        { text: 'to', start: 1.5, end: 1.8, confidence: 0.99 },
        { text: 'VireoClip', start: 1.8, end: 2.7, confidence: 0.95 },
        { text: 'studio', start: 2.7, end: 3.5, confidence: 0.97 },
      ],
    },
    {
      id: 'cue-2',
      start: 4.2,
      end: 6.0,
      text: 'Create short clips effortlessly',
      words: [
        { text: 'Create', start: 4.2, end: 4.6 },
        { text: 'short', start: 4.6, end: 5.0 },
        { text: 'clips', start: 5.0, end: 5.4 },
        { text: 'effortlessly', start: 5.4, end: 6.0 },
      ],
    },
  ];

  it('flattens words across cues with contiguous global indices and unique keys', () => {
    const flattened = flattenTranscriptWords(sampleCues);
    assert.equal(flattened.length, 8);

    assert.deepEqual(
      flattened.map((w) => w.globalIndex),
      [0, 1, 2, 3, 4, 5, 6, 7],
      'Words must have 0-indexed contiguous ordering'
    );

    assert.equal(flattened[0].key, 'cue-1:0');
    assert.equal(flattened[0].text, 'Welcome');
    assert.equal(flattened[0].start, 1.0);
    assert.equal(flattened[0].end, 1.5);

    assert.equal(flattened[4].key, 'cue-2:0');
    assert.equal(flattened[4].text, 'Create');
    assert.equal(flattened[4].start, 4.2);
    assert.equal(flattened[4].end, 4.6);
  });

  it('synthesizes word tokens gracefully when cue only has segment timing', () => {
    const segmentOnlyCues: TimedCaptionCue[] = [
      {
        id: 'seg-1',
        start: 10.0,
        end: 14.0,
        text: 'Four seconds sentence here',
      },
    ];

    const flattened = flattenTranscriptWords(segmentOnlyCues);
    assert.equal(flattened.length, 4);
    assert.equal(flattened[0].text, 'Four');
    assert.equal(flattened[0].start, 10.0);
    assert.equal(flattened[3].text, 'here');
    assert.equal(flattened[3].end, 14.0);
  });

  it('accurately seeks to word timestamp on click', () => {
    const flattened = flattenTranscriptWords(sampleCues);
    const targetWord = flattened[2]; // 'VireoClip'
    assert.equal(targetWord.text, 'VireoClip');

    // Simulate word click seeking
    let currentPlayhead = 0;
    const seek = (time: number) => {
      currentPlayhead = time;
    };

    seek(targetWord.start);
    assert.equal(currentPlayhead, 1.8, 'Playhead seeks directly to word start (1.8s)');
  });

  it('synchronizes active word with playback time across boundaries', () => {
    const flattened = flattenTranscriptWords(sampleCues);

    // Before any word
    assert.equal(findActiveWord(flattened, 0.5), null);

    // At t = 1.2s -> 'Welcome' (1.0 to 1.5s)
    const active1 = findActiveWord(flattened, 1.2);
    assert.ok(active1);
    assert.equal(active1?.text, 'Welcome');

    // At t = 2.0s -> 'VireoClip' (1.8 to 2.7s)
    const active2 = findActiveWord(flattened, 2.0);
    assert.ok(active2);
    assert.equal(active2?.text, 'VireoClip');

    // In inter-cue silence (3.8s) -> null
    assert.equal(findActiveWord(flattened, 3.8), null);

    // At t = 5.2s -> 'clips' (5.0 to 5.4s)
    const active3 = findActiveWord(flattened, 5.2);
    assert.ok(active3);
    assert.equal(active3?.text, 'clips');
  });
});

describe('Phase 3 — Transcript Workspace: Selection, Range Actions & Clip Validation', () => {
  const sampleCues: TimedCaptionCue[] = [
    {
      id: 'cue-1',
      start: 0.0,
      end: 3.0,
      text: 'One two three four',
      words: [
        { text: 'One', start: 0.0, end: 0.7 },
        { text: 'two', start: 0.7, end: 1.4 },
        { text: 'three', start: 1.4, end: 2.1 },
        { text: 'four', start: 2.1, end: 3.0 },
      ],
    },
    {
      id: 'cue-2',
      start: 3.5,
      end: 6.0,
      text: 'Five six seven eight',
      words: [
        { text: 'Five', start: 3.5, end: 4.1 },
        { text: 'six', start: 4.1, end: 4.8 },
        { text: 'seven', start: 4.8, end: 5.4 },
        { text: 'eight', start: 5.4, end: 6.0 },
      ],
    },
  ];

  it('resolves contiguous multi-word range selection via drag or Shift-click', () => {
    const words = flattenTranscriptWords(sampleCues);

    // Select from index 1 ('two') to index 5 ('six')
    const { keys, startIndex, endIndex } = getWordRangeSelection(words, 1, 5);
    assert.equal(startIndex, 1);
    assert.equal(endIndex, 5);
    assert.equal(keys.size, 5);

    assert.ok(keys.has('cue-1:1')); // 'two'
    assert.ok(keys.has('cue-1:2')); // 'three'
    assert.ok(keys.has('cue-1:3')); // 'four'
    assert.ok(keys.has('cue-2:0')); // 'Five'
    assert.ok(keys.has('cue-2:1')); // 'six'
    assert.ok(!keys.has('cue-1:0')); // 'One' (not selected)
    assert.ok(!keys.has('cue-2:2')); // 'seven' (not selected)

    // Reverse drag: anchor at 5, target at 1
    const reverse = getWordRangeSelection(words, 5, 1);
    assert.deepEqual(reverse.keys, keys, 'Reverse drag produces identical range');
  });

  it('concatenates selected text cleanly for clipboard copying', () => {
    const words = flattenTranscriptWords(sampleCues);
    const { keys } = getWordRangeSelection(words, 2, 6);
    const selected = words.filter((w) => keys.has(w.key));
    const copiedText = selected.map((w) => w.text).join(' ');

    assert.equal(copiedText, 'three four Five six seven');
  });

  it('validates minimum and maximum duration constraints for transcript clip selection', () => {
    // 1. Duration < 0.5s -> Invalid
    const shortValidation = validateClipSelection(1.0, 1.3, 0.5);
    assert.equal(shortValidation.isValid, false);
    assert.equal(shortValidation.duration, 0.3);
    assert.ok(shortValidation.message?.includes('too short'));

    // 2. Normal valid clip duration (2.5s)
    const validValidation = validateClipSelection(1.0, 3.5, 0.5);
    assert.equal(validValidation.isValid, true);
    assert.equal(validValidation.duration, 2.5);

    // 3. Exceeds max duration (190s > 180s)
    const longValidation = validateClipSelection(0, 195, 0.5, 180);
    assert.equal(longValidation.isValid, false);
    assert.ok(longValidation.message?.includes('too long'));
  });
});

describe('Phase 3 — Transcript Workspace: Editing, Ripple Cut & State Parity', () => {
  it('updates cue text and re-tokenizes words while updating project caption track', () => {
    let cues: TimedCaptionCue[] = [
      {
        id: 'c1',
        start: 0.0,
        end: 2.0,
        text: 'Old caption words',
        words: [
          { text: 'Old', start: 0.0, end: 0.6 },
          { text: 'caption', start: 0.6, end: 1.3 },
          { text: 'words', start: 1.3, end: 2.0 },
        ],
      },
    ];

    const project: EditorProject = {
      id: 'p1',
      user_id: 'u1',
      title: 'Transcript Test',
      version: 1,
      canvas: { aspect_ratio: '9:16', background_color: '#000000' },
      playhead: 0,
      tracks: [
        {
          id: 'caption-track',
          type: 'CAPTION',
          name: 'Captions',
          order: 0,
          muted: false,
          hidden: false,
          items: [
            {
              id: 'cap-item',
              track_id: 'caption-track',
              type: 'CAPTION',
              timeline_start: 0,
              timeline_end: 10,
              source_start: 0,
              source_end: 10,
              caption: {
                style: 'clean',
                position: 'bottom',
                cues: JSON.parse(JSON.stringify(cues)),
              },
            },
          ],
        },
      ],
    };

    // Simulate updateCueText
    const newText = 'Brand new polished text';
    const updatedWords = newText.split(' ').map((w, idx) => ({
      text: w,
      start: Number((0.0 + idx * 0.5).toFixed(3)),
      end: Number((0.0 + (idx + 1) * 0.5).toFixed(3)),
      confidence: 1.0,
    }));

    cues = cues.map((c) =>
      c.id === 'c1' ? { ...c, text: newText, words: updatedWords } : c
    );

    project.tracks[0].items[0].caption.cues = JSON.parse(JSON.stringify(cues));

    assert.equal(cues[0].text, 'Brand new polished text');
    assert.equal(cues[0].words?.length, 4);
    assert.equal(project.tracks[0].items[0].caption.cues[0].text, 'Brand new polished text');

    // ASS generation parity check
    const ass = CaptionService.buildAssScript(cues, {
      style: 'clean',
      aspectRatio: '9:16',
    });
    assert.ok(ass.includes('Brand new polished text'), 'Exported ASS contains updated transcript text');
  });

  it('ripple cuts selected transcript range, shifting subsequent cues and timeline items synchronously', () => {
    const initialCues: TimedCaptionCue[] = [
      { id: 'c1', start: 0.0, end: 2.0, text: 'Keep this' },
      { id: 'c2', start: 2.0, end: 4.0, text: 'Cut this middle part' },
      { id: 'c3', start: 4.5, end: 7.0, text: 'Keep this end' },
    ];

    const initialProject: EditorProject = {
      id: 'p1',
      user_id: 'u1',
      title: 'Ripple Test',
      version: 1,
      canvas: { aspect_ratio: '9:16', background_color: '#000000' },
      playhead: 0,
      tracks: [
        {
          id: 'v-track',
          type: 'VIDEO',
          name: 'Video',
          order: 0,
          muted: false,
          hidden: false,
          items: [
            {
              id: 'v1',
              track_id: 'v-track',
              type: 'VIDEO',
              timeline_start: 0,
              timeline_end: 10,
              source_start: 0,
              source_end: 10,
            },
          ],
        },
      ],
    };

    // Cut range [2.0, 4.0] (duration 2.0s)
    const shiftedCues = sliceAndShiftCues(initialCues, 2.0, 4.0, 2.0);
    const updatedProject = applyRippleCutToProject(initialProject, 2.0, 4.0);

    // C1 remains unchanged
    assert.equal(shiftedCues[0].id, 'c1');
    assert.equal(shiftedCues[0].start, 0.0);
    assert.equal(shiftedCues[0].end, 2.0);

    // C2 is completely removed
    assert.ok(!shiftedCues.some((c) => c.id === 'c2'));

    // C3 shifted back by 2.0s: start 4.5 -> 2.5, end 7.0 -> 5.0
    const c3 = shiftedCues.find((c) => c.id === 'c3');
    assert.ok(c3);
    assert.equal(c3?.start, 2.5);
    assert.equal(c3?.end, 5.0);

    // Project video track was split into two pieces with gap ripple cut
    const vItems = updatedProject.tracks[0].items;
    assert.equal(vItems.length, 2);
    assert.equal(vItems[0].timeline_start, 0);
    assert.equal(vItems[0].timeline_end, 2.0);
    assert.equal(vItems[1].timeline_start, 2.0);
    assert.equal(vItems[1].timeline_end, 8.0);
  });
});

describe('Phase 3 — Regression Guardrails: Workspace, Timeline & Direct Captioning', () => {
  const editorShellPath = path.join(projectRoot, 'src/components/editor/EditorShell.tsx');
  const previewCanvasPath = path.join(projectRoot, 'src/components/editor/PreviewCanvas.tsx');
  const unifiedTimelinePath = path.join(projectRoot, 'src/components/editor/UnifiedTimeline.tsx');

  const editorShellSource = fs.readFileSync(editorShellPath, 'utf8');
  const previewCanvasSource = fs.readFileSync(previewCanvasPath, 'utf8');
  const unifiedTimelineSource = fs.readFileSync(unifiedTimelinePath, 'utf8');

  it('preserves Phase 1 Hide/Show Timeline toggle in UnifiedTimeline and EditorShell', () => {
    assert.ok(
      editorShellSource.includes('isTimelineCollapsed'),
      'EditorShell retains isTimelineCollapsed state'
    );
    assert.ok(
      unifiedTimelineSource.includes('onToggleCollapse'),
      'UnifiedTimeline retains onToggleCollapse handler'
    );
    assert.ok(
      unifiedTimelineSource.includes("isCollapsed ? 'h-9'"),
      'UnifiedTimeline retains 36px collapsed dock'
    );
  });

  it('preserves Phase 2 Direct Caption Positioning: Zero-jump grab offset, Scope pill, and Danger zones', () => {
    assert.ok(
      previewCanvasSource.includes('captionGrabOffset'),
      'PreviewCanvas retains zero-jump captionGrabOffset'
    );
    assert.ok(
      previewCanvasSource.includes('captionScope'),
      'PreviewCanvas retains captionScope state (All vs This Cue)'
    );
    assert.ok(
      previewCanvasSource.includes('isInDangerZone'),
      'PreviewCanvas retains TikTok/Reels platform danger-zone indicator'
    );
    assert.ok(
      previewCanvasSource.includes('handleResizeHandlePointerDown'),
      'PreviewCanvas retains corner font size scaling handler'
    );
  });

  it('verifies TranscriptEditor is cleanly hosted in EditorShell with seek, text update, and ripple cut', () => {
    assert.ok(
      editorShellSource.includes('<TranscriptEditor'),
      'EditorShell mounts TranscriptEditor'
    );
    assert.ok(
      editorShellSource.includes('onSeek={seek}'),
      'EditorShell passes seek handler to TranscriptEditor'
    );
    assert.ok(
      editorShellSource.includes('onUpdateCueText={onUpdateCueText}'),
      'EditorShell passes onUpdateCueText to TranscriptEditor'
    );
    assert.ok(
      editorShellSource.includes('onDeleteTimeRange={onDeleteTimeRange}'),
      'EditorShell passes onDeleteTimeRange to TranscriptEditor'
    );
  });
});
