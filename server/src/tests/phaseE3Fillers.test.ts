import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  detectFillerRanges,
  summarizeFillerRanges,
  FillerWordToken,
} from '../utils/fillerDetection.js';
import { applyBatchRippleCuts } from '../utils/editorRippleCut.js';
import { EditorProject, EditorTrackItem, TimedCaptionCue } from '../types/index.js';

/**
 * Platform Quality Roadmap E-3 — filler-word removal (Descript parity):
 * tiered detection with conservative content guards, measured recall/precision
 * on a labeled fixture, and temporal removal through the proven ripple-cut
 * infrastructure (video + audio + captions cut together, never text-only).
 */

const w = (text: string, start: number, end: number, sentenceIndex?: number): FillerWordToken => ({
  text,
  start,
  end,
  ...(sentenceIndex !== undefined ? { sentenceIndex } : {}),
});

describe('E3 — filler detection accuracy on a labeled fixture', () => {
  // Ground truth: filler spans marked by a human on this synthetic transcript.
  const words: FillerWordToken[] = [
    w('so', 0.0, 0.2, 0), w('um', 0.2, 0.5, 0), w('the', 0.5, 0.7, 0), w('revenue', 0.7, 1.1, 0), w('doubled', 1.1, 1.5, 0),
    w('after', 1.5, 1.7, 1), w('we', 1.7, 1.9, 1), w('shipped', 1.9, 2.3, 1), w('the', 2.3, 2.4, 1), w('new', 2.4, 2.6, 1), w('pricing', 2.6, 3.0, 1),
    w('and', 3.0, 3.2, 2), w('uh', 3.2, 3.5, 2), w('basically', 3.5, 3.9, 2), w('customers', 3.9, 4.3, 2), w('loved', 4.3, 4.7, 2), w('it', 4.7, 4.9, 2),
    w('I', 4.9, 5.0, 3), w('like', 5.0, 5.2, 3), w('pizza', 5.2, 5.6, 3), // verb "like" — NOT filler
    w('they', 5.6, 5.8, 4), w('you', 5.8, 6.0, 4), w('know', 6.0, 6.3, 4), w('renewed', 6.3, 6.8, 4), w('anyway', 6.8, 7.1, 4), // "you know" mid-sentence — filler
    w('You', 7.1, 7.3, 5), w('know', 7.3, 7.6, 5), w('what', 7.6, 7.9, 5), w('helped', 7.9, 8.2, 5), w('most', 8.2, 8.5, 5), // sentence-start "You know" — NOT filler
    w('hmm', 8.5, 8.8, 6), w('the', 8.8, 9.0, 6), w('onboarding', 9.0, 9.5, 6),
  ];
  // Labeled truth (word indexes that ARE fillers): um=1, uh=12, basically=13,
  // you+know(mid-sentence)=21/22, hmm=30.
  const truth = new Set([1, 12, 13, 21, 22, 30]);

  const ranges = detectFillerRanges(words);
  const detected = new Set<number>();
  for (const r of ranges) {
    // Map range back to covered word indexes for scoring
    words.forEach((word, i) => {
      if (word.start >= r.start - 0.01 && word.end <= r.end + 0.01) detected.add(i);
    });
  }

  const tp = [...detected].filter((i) => truth.has(i)).length;
  const recall = tp / truth.size;
  const precision = detected.size > 0 ? tp / detected.size : 1;

  it('achieves ≥0.8 recall and ≥0.8 precision on the labeled fixture', () => {
    assert.ok(recall >= 0.8, `recall ${recall}`);
    assert.ok(precision >= 0.8, `precision ${precision}`);
  });

  it('never flags the verb "like" after a subject, or sentence-start "You know"', () => {
    assert.equal(detected.has(18), false, 'I like pizza');
    assert.equal(detected.has(25), false, 'You know what helped most');
    assert.equal(detected.has(26), false, '(sentence-start know)');
  });

  it('tier-2 markers can be excluded (conservative mode keeps tier 1 only)', () => {
    const conservative = detectFillerRanges(words, { includeTier2: false });
    assert.ok(conservative.every((r) => r.tier === 1));
    assert.ok(conservative.length < ranges.length);
  });

  it('merges adjacent fillers and rejects over-long runs', () => {
    const run = [
      w('um', 0, 0.3, 0), w('uh', 0.3, 0.6, 0), w('erm', 0.6, 0.9, 0),
    ];
    const merged = detectFillerRanges(run);
    assert.equal(merged.length, 1);
    assert.ok(Math.abs(merged[0].durationSec - 0.9) < 0.01);

    const tooLong = [w('um', 0, 2.0, 0)];
    assert.equal(detectFillerRanges(tooLong).length, 0, 'ranges >1.5s are rejected');
  });

  it('summarizes counts for the confirm dialog', () => {
    const s = summarizeFillerRanges(ranges);
    assert.equal(s.totalRanges, ranges.length);
    assert.equal(s.tier1Ranges + s.tier2Ranges, ranges.length);
    assert.ok(s.totalDurationSec > 0);
  });
});

describe('E3 — temporal removal through the ripple infrastructure', () => {
  const cueWords = [
    w('um', 0.2, 0.5, 0), w('hello', 0.5, 0.9, 0), w('there', 0.9, 1.2, 0),
    w('we', 1.2, 1.4, 1), w('uh', 1.4, 1.7, 1), w('ship', 1.7, 2.1, 1), w('fast', 2.1, 2.5, 1),
  ];
  const cues: TimedCaptionCue[] = [
    {
      id: 'cue-1',
      start: 0.2,
      end: 1.2,
      text: 'um hello there',
      words: cueWords.slice(0, 3).map((x) => ({ text: x.text, start: x.start, end: x.end })) as any,
    },
    {
      id: 'cue-2',
      start: 1.2,
      end: 2.5,
      text: 'we uh ship fast',
      words: cueWords.slice(3).map((x) => ({ text: x.text, start: x.start, end: x.end })) as any,
    },
  ];

  const makeItem = (id: string, ts: number, te: number, ss: number, se: number): EditorTrackItem =>
    ({
      id, type: 'VIDEO', timeline_start: ts, timeline_end: te, source_start: ss, source_end: se,
      transform: { position_x: 0, position_y: 0, scale: 1, rotation: 0, opacity: 1 },
      speed: { speed: 1, pitch_preserved: true }, effects: [], keyframes: [],
      locked: false, muted: false, hidden: false, z_index: 0,
    }) as EditorTrackItem;

  const project = (): EditorProject =>
    ({
      id: 'p', user_id: 'u', project_id: 'p', clip_id: 'c', version: 1, status: 'editing', title: 't',
      canvas: { width: 1080, height: 1920, fps: 30, aspect_ratio: '9:16', duration: 2.5 },
      tracks: [
        { id: 'cap', type: 'CAPTION', name: 'Subtitles', locked: false, muted: true, hidden: false,
          items: [{ ...makeItem('cap-1', 0, 2.5, 0, 2.5), caption: { cues: JSON.parse(JSON.stringify(cues)), style: 'clean', position: 'bottom' } }] },
        { id: 'v', type: 'VIDEO', name: 'V1', locked: false, muted: false, hidden: false,
          items: [makeItem('v1', 0, 2.5, 0, 2.5)] },
      ],
      playhead: 0, settings: { snapping: false, safe_guides: false, snap_tolerance_sec: 0.1 },
    }) as unknown as EditorProject;

  it('removes fillers from media AND caption cues in one consistent cut', () => {
    const detected = detectFillerRanges(cueWords);
    assert.equal(detected.length, 2); // "um" and "uh"

    const next = applyBatchRippleCuts(project() as any, detected.map((r) => ({ startSec: r.start, endSec: r.end })));

    const videoItems = next.tracks.find((t) => t.id === 'v')!.items;
    const totalVideoDur = videoItems.reduce((acc, it) => acc + (it.timeline_end - it.timeline_start), 0);
    // 2.5s − 0.3s (um) − 0.3s (uh) = 1.9s across all resulting slices.
    assert.ok(Math.abs(totalVideoDur - 1.9) < 0.02, `video duration ${totalVideoDur}`);

    const captionItem = next.tracks.find((t) => t.id === 'cap')!.items[0];
    const remaining = (captionItem.caption?.cues ?? []).flatMap((c: any) => c.words ?? []);
    const texts = remaining.map((x: any) => x.text);
    assert.ok(!texts.includes('um') && !texts.includes('uh'), 'filler words excised from captions');
    assert.ok(texts.includes('hello') && texts.includes('fast'), 'content words preserved');
    // No cue or word time may land on a negative or duplicated clock.
    for (const c of captionItem.caption?.cues ?? []) {
      assert.ok(c.start >= 0 && c.end > c.start, `cue bounds sane after cuts: ${c.start}-${c.end}`);
    }
    assert.ok(next.canvas.duration < 2.5, 'canvas duration shrinks');
  });
});

describe('E3 — wiring', () => {
  it('server route and preview/confirm contract are registered', () => {
    const routes = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/projectRoutes.ts'), 'utf8');
    assert.match(routes, /\/editor-projects\/:id\/remove-fillers/);
    const controller = fs.readFileSync(path.resolve(process.cwd(), 'src/controllers/proEditorController.ts'), 'utf8');
    assert.match(controller, /confirmed: req\.body\?\.confirmed === true/);
    const service = fs.readFileSync(path.resolve(process.cwd(), 'src/services/proEditorService.ts'), 'utf8');
    assert.match(service, /applyBatchRippleCuts/);
    assert.match(service, /NO_WORD_TIMINGS/);
  });

  it('frontend confirm flow prefers temporal removal with explicit consent', () => {
    const fe = fs.readFileSync(path.resolve(process.cwd(), '../src/components/editor/TranscriptEditor.tsx'), 'utf8');
    assert.match(fe, /onDeleteTimeRanges\)/, 'temporal path when hook available');
    assert.match(fe, /window\.confirm/, 'explicit confirmation required');
    assert.match(fe, /detectFillerRanges/, 'shares the single-source detector');
    const feService = fs.readFileSync(path.resolve(process.cwd(), '../src/services/proEditorService.ts'), 'utf8');
    assert.match(feService, /remove-fillers/);
  });
});
