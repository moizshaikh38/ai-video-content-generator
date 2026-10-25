import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  structureMoments,
  findReactionArcs,
  findDialogueMoments,
  findGameplayPlays,
  wordsFromTranscript,
  energyFromTimeline,
  MomentStructurerInput,
} from '../services/momentStructurer.js';
import {
  buildDirectorPlan,
  validateDirectorPlan,
  getDirectorClamps,
} from '../services/directorPlanBuilder.js';
import {
  runDirectorQA,
  estimatePlanDuration,
} from '../services/directorQAGate.js';
import {
  detectBestEncoder,
  getVideoCodecArgs,
} from '../utils/encoderDetection.js';
import { ContentGenre } from '../types/index.js';

/**
 * AI Clip Director — Phase 1 (moment structurer + plan builder + QA gate)
 * and Phase 5 (hardware encoder detection). Pure logic fully tested.
 */

const w = (start: number, end: number, word?: string) => ({ start, end, word });
const seg = (start: number, end: number, db: number) => ({ start, end, audio_energy_db: db });

function makeInput(over: Partial<MomentStructurerInput> = {}): MomentStructurerInput {
  return {
    durationSec: 60,
    words: [
      w(0, 0.4, 'hello'), w(0.5, 1.0, 'everyone'), w(1.1, 1.5, 'welcome'),
      w(2.0, 2.5, 'this'), w(2.6, 3.0, 'is'), w(3.1, 3.5, 'amazing'), w(3.6, 4.0, '!'),
      w(5.0, 5.5, 'wow'), w(5.6, 6.0, 'that'), w(6.1, 6.5, 'was'), w(6.6, 7.0, 'incredible'),
      w(7.1, 7.5, 'I'), w(7.6, 8.0, 'cannot'), w(8.1, 8.5, 'believe'), w(8.6, 9.0, 'it'),
      w(10.0, 10.5, 'and'), w(10.6, 11.0, 'the'), w(11.1, 11.5, 'crowd'), w(11.6, 12.0, 'goes'),
      w(12.1, 12.5, 'wild'),
    ],
    energySegments: [
      seg(0, 1, -30), seg(1, 2, -31), seg(2, 3, -30), seg(3, 4, -14), seg(4, 5, -29),
      seg(5, 6, -12), seg(6, 7, -28), seg(7, 8, -30), seg(8, 9, -30),
    ],
    spikes: [],
    sceneCuts: [0, 2.2],
    faceIntervals: [{ start: 3, end: 8 }],
    gameEvents: undefined,
    genre: 'gaming',
    ...over,
  };
}

describe('Moment structurer — reaction arcs', () => {
  it('finds a reaction arc from an audio spike with setup and payoff', () => {
    const input = makeInput({ spikes: [{ time: 3.2, confidence: 0.8 }] });
    const arcs = findReactionArcs(input);
    assert.ok(arcs.length >= 1, 'must find at least one reaction arc');
    const arc = arcs[0];
    assert.equal(arc.structure.pattern, 'reaction_arc');
    assert.equal(arc.structure.event_at, 3.2);
    assert.ok(arc.structure.setup_at !== undefined, 'setup boundary detected');
    assert.ok(arc.structure.payoff_at !== undefined, 'payoff boundary detected');
    assert.ok(arc.confidence >= 0.4);
    assert.ok(arc.evidence.some((e) => e.signal === 'audio_spike'));
  });

  it('rejects spikes with confidence below threshold', () => {
    const input = makeInput({ spikes: [{ time: 3.2, confidence: 0.3 }] });
    const arcs = findReactionArcs(input);
    assert.equal(arcs.length, 0);
  });

  it('suppresses overlapping arcs (keeps highest confidence)', () => {
    const input = makeInput({
      spikes: [
        { time: 3.2, confidence: 0.7 },
        { time: 3.5, confidence: 0.9 },
      ],
    });
    const arcs = structureMoments(input);
    // Both spikes overlap; only the higher-confidence arc should survive.
    const reactionArcs = arcs.filter((a) => a.structure.pattern === 'reaction_arc');
    assert.equal(reactionArcs.length, 1);
    assert.equal(reactionArcs[0].confidence >= 0.7, true);
  });
});

describe('Moment structurer — dialogue Q&A', () => {
  it('finds a question-answer structure from word timestamps', () => {
    const words = [
      w(0, 0.3, 'why'), w(0.4, 0.7, 'did'), w(0.8, 1.1, 'it'), w(1.2, 1.5, 'fail?'),
      w(2.0, 2.3, 'because'), w(2.4, 2.7, 'the'), w(2.8, 3.1, 'onboarding'),
      w(3.2, 3.5, 'was'), w(3.6, 3.9, 'broken'), w(4.0, 4.3, 'and'), w(4.4, 4.7, 'nobody'),
      w(4.8, 5.1, 'fixed'), w(5.2, 5.5, 'it'), w(5.6, 5.9, 'until'), w(6.0, 6.3, 'now'),
    ];
    const input = makeInput({ words, genre: 'podcast_interview' });
    const results = findDialogueMoments(input);
    assert.ok(results.length >= 1, 'must find at least one dialogue Q&A');
    const qa = results[0];
    assert.equal(qa.structure.pattern, 'dialogue_qa');
    assert.ok(qa.structure.setup_at !== undefined);
    assert.ok(qa.structure.payoff_at !== undefined);
  });
});

describe('Moment structurer — gameplay plays', () => {
  it('finds gameplay play from VLM events with audio corroboration', () => {
    const input = makeInput({
      gameEvents: [{ time: 3.2, type: 'multi_kill', confidence: 0.8 }],
      spikes: [{ time: 3.2, confidence: 0.7 }],
    });
    const plays = findGameplayPlays(input);
    assert.ok(plays.length >= 1);
    const play = plays[0];
    assert.equal(play.structure.pattern, 'gameplay_play');
    assert.ok(play.confidence >= 0.6, 'corroborated play should have elevated confidence');
    assert.ok(play.evidence.some((e) => e.signal === 'game_event'));
  });

  it('falls back to standalone audio spikes when no VLM events exist', () => {
    const input = makeInput({ spikes: [{ time: 3.2, confidence: 0.7 }] });
    const plays = findGameplayPlays(input);
    assert.ok(plays.length >= 1);
  });
});

describe('Director plan builder — compilation and QA', () => {
  it('builds a plan with creative decisions grounded in structure', () => {
    const moment: MomentCandidate = {
      start: 0, end: 30,
      structure: { setup_at: 0, event_at: 10, reaction_at: 12, payoff_at: 28, pattern: 'reaction_arc' },
      evidence: [{ signal: 'audio_spike', timestamp: 10, confidence: 0.8 }],
      confidence: 0.85,
    };
    const result = buildDirectorPlan(moment, {
      genre: 'gaming' as ContentGenre,
      project_id: 'p', user_id: 'u',
      words: [],
      layoutMode: 'screencast',
    });
    assert.ok(result.plan, 'plan should compile');
    const plan = result.plan!;
    assert.equal(plan.structure.event_at, 10);
    assert.equal(plan.creative.framing, 'face_focus_during_event');
    assert.ok(plan.creative.punch_in, 'gaming genre should get punch-in');
    assert.ok(plan.creative.caption_emphasis, 'caption emphasis window should exist');
    assert.ok(plan.selection_reason.includes('event at'));
  });

  it('rejects plans exceeding the genre max duration', () => {
    const moment: MomentCandidate = {
      start: 0, end: 100,
      structure: { event_at: 50, payoff_at: 95, pattern: 'reaction_arc' },
      evidence: [{ signal: 'audio_spike', timestamp: 50, confidence: 0.8 }],
      confidence: 0.8,
    };
    const result = buildDirectorPlan(moment, {
      genre: 'gaming' as ContentGenre,
      project_id: 'p', user_id: 'u', words: [],
    });
    assert.equal(result.plan, null);
    assert.match(result.rejection!.detail, /exceeds max/);
  });

  it('genre clamps match the genre intelligence service values', () => {
    assert.deepEqual(getDirectorClamps('gaming'), { minDurationSec: 15, maxDurationSec: 45 });
    assert.deepEqual(getDirectorClamps('storytelling'), { minDurationSec: 45, maxDurationSec: 90 });
    assert.deepEqual(getDirectorClamps('unknown'), { minDurationSec: 20, maxDurationSec: 60 });
  });
});

describe('Director QA gate — pre-render validation', () => {
  const validPlan: ClipDirectorPlan = {
    clip_id: 'c', project_id: 'p', user_id: 'u',
    genre: 'gaming' as ContentGenre,
    source_interval: { start: 0, end: 30 },
    structure: { setup_at: 0, event_at: 10, reaction_at: 12, payoff_at: 28, pattern: 'reaction_arc' },
    evidence: [],
    selection_reason: 'test',
    confidence: 0.8,
    creative: { framing: 'face_track', punch_in: { at: 12, zoom: 1.12, duration: 1.2 } },
    validation: [],
    warnings: [],
    created_at: new Date().toISOString(),
  };

  it('accepts a valid plan (ok: true, no blocking failures)', () => {
    const result = runDirectorQA(validPlan);
    assert.equal(result.ok, true);
    assert.equal(result.blocking.length, 0);
  });

  it('rejects plans with impossible structure (event after payoff)', () => {
    const broken = { ...validPlan, structure: { ...validPlan.structure, event_at: 28, payoff_at: 10 } };
    const result = runDirectorQA(broken);
    assert.equal(result.ok, false);
    assert.ok(result.blocking.some((c) => c.check === 'event_before_payoff'));
  });

  it('rejects plans below confidence threshold', () => {
    const lowConf = { ...validPlan, confidence: 0.15 };
    const result = runDirectorQA(lowConf, { minConfidence: 0.3 });
    assert.equal(result.ok, false);
    assert.ok(result.blocking.some((c) => c.check === 'confidence_above_threshold'));
  });

  it('repairs punch-in outside source interval (non-blocking)', () => {
    const outside = {
      ...validPlan,
      creative: { ...validPlan.creative, punch_in: { at: 35, zoom: 1.12, duration: 1.2 } },
    };
    const result = runDirectorQA(outside);
    assert.equal(result.ok, true); // non-blocking
    assert.equal(result.plan.creative.punch_in, undefined, 'punch-in removed');
    assert.ok(result.repairs.length > 0 || result.warnings.length > 0);
  });

  it('estimatePlanDuration returns the source interval width', () => {
    assert.equal(estimatePlanDuration(validPlan), 30);
  });
});

describe('Hardware encoder detection', () => {
  it('detects the best available encoder without throwing', async () => {
    const info = await detectBestEncoder();
    assert.ok(info.codec.length > 0);
    assert.equal(typeof info.hardware, 'boolean');
    // On macOS, VideoToolbox should be available; on Linux CI, may fall back to libx264.
    assert.ok(['h264_videotoolbox', 'h264_nvenc', 'h264_qsv', 'libx264'].includes(info.codec));
  });

  it('returns bitrate args for hardware, CRF for software', async () => {
    const info = await detectBestEncoder();
    const args = getVideoCodecArgs(info, 22, '8M');
    assert.ok(Array.isArray(args));
    if (info.hardware) {
      assert.match(args.join(' '), /-b:v 8M/);
    } else {
      assert.match(args.join(' '), /-crf 22/);
    }
  });
});

describe('AI Clip Director — pipeline wiring pins', () => {
  const analysis = fs.readFileSync(path.resolve(process.cwd(), 'src/services/clipAnalysisService.ts'), 'utf8');

  it('analysis service enriches candidates with director plans', () => {
    assert.match(analysis, /structureMoments\(/);
    assert.match(analysis, /buildDirectorPlan\(/);
    assert.match(analysis, /director_plan: directorPlans/);
  });

  it('director plan is stored as a top-level field on the candidate (not buried in metadata)', () => {
    assert.match(analysis, /director_plan: directorPlans/);
  });
});
