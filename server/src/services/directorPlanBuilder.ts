import {
  ContentGenre,
  ClipDirectorPlan,
  DirectorCreativeDecisions,
  DirectorValidationCheck,
  MomentStructure,
  ReframeKeyframe,
} from '../types/index.js';
import { MomentCandidate } from './momentStructurer.js';
import { tryIncludeQuestion } from '../utils/questionInclusion.js';

/**
 * Clip Director Plan Builder (AI Clip Director, Phase 1).
 *
 * Compiles MomentCandidates into ClipDirectorPlans: enforces genre duration
 * clamps, applies question auto-inclusion, makes creative decisions grounded
 * in the moment structure (reaction punch-in, event framing, caption
 * emphasis), and runs pre-render QA checks. Every field is grounded in the
 * input moment's evidence — no invented timestamps.
 */

export interface DirectorGenreClamps {
  minDurationSec: number;
  maxDurationSec: number;
}

const GENRE_CLAMPS: Record<string, DirectorGenreClamps> = {
  podcast_interview: { minDurationSec: 30, maxDurationSec: 75 },
  education_tutorial: { minDurationSec: 35, maxDurationSec: 85 },
  motivation: { minDurationSec: 25, maxDurationSec: 60 },
  business_finance: { minDurationSec: 20, maxDurationSec: 60 },
  gaming: { minDurationSec: 15, maxDurationSec: 45 },
  sports: { minDurationSec: 15, maxDurationSec: 50 },
  news_politics: { minDurationSec: 25, maxDurationSec: 75 },
  comedy_entertainment: { minDurationSec: 15, maxDurationSec: 60 },
  storytelling: { minDurationSec: 45, maxDurationSec: 90 },
  product_marketing: { minDurationSec: 20, maxDurationSec: 60 },
  general: { minDurationSec: 20, maxDurationSec: 60 },
};

export function getDirectorClamps(genre: string): DirectorGenreClamps {
  return GENRE_CLAMPS[genre] ?? GENRE_CLAMPS.general;
}

/** Reaction-heavy genres get punch-in creative decisions. */
const PUNCH_IN_GENRES = new Set(['gaming', 'motivation', 'comedy_entertainment']);

/** Genres where the reaction face matters more than the screen. */
const FACE_FOCUS_EVENT_GENRES = new Set(['gaming', 'motivation', 'comedy_entertainment']);

export interface DirectorBuildContext {
  genre: ContentGenre;
  project_id: string;
  user_id: string;
  /** Transcript words for question-inclusion boundary repair. */
  words: Array<{ start: number; end: number; word?: string }>;
  /** Reframe track keyframes for framing decision (optional). */
  reframeKeyframes?: ReframeKeyframe[];
  /** Layout mode from the reframe track (optional). */
  layoutMode?: string;
}

export interface DirectorPlanBuildResult {
  plan: ClipDirectorPlan | null;
  /** Why the plan was rejected (when plan is null). */
  rejection?: { check: string; detail: string };
}

/**
 * Compiles a MomentCandidate into a ClipDirectorPlan with creative decisions
 * and QA validation. Returns null when the plan fails a blocking QA check.
 */
export function buildDirectorPlan(
  moment: MomentCandidate,
  ctx: DirectorBuildContext
): DirectorPlanBuildResult {
  const clamps = getDirectorClamps(ctx.genre);
  const validation: DirectorValidationCheck[] = [];
  const warnings: string[] = [];

  // ── 1. Duration clamps ──
  let start = moment.start;
  let end = moment.end;
  let duration = end - start;

  if (duration < clamps.minDurationSec) {
    // Try extending the payoff tail to reach the minimum.
    const extended = Math.min(clamps.minDurationSec + 1, end + (clamps.minDurationSec - duration));
    if (extended - start >= clamps.minDurationSec * 0.9) {
      end = extended;
      duration = end - start;
      warnings.push(`Payoff tail extended to reach ${clamps.minDurationSec}s genre minimum.`);
    }
  }
  validation.push({
    check: 'duration_within_clamps',
    passed: duration >= clamps.minDurationSec * 0.9 && duration <= clamps.maxDurationSec,
    detail: `${duration.toFixed(1)}s in [${clamps.minDurationSec}, ${clamps.maxDurationSec}]`,
  });
  if (duration > clamps.maxDurationSec) {
    return { plan: null, rejection: { check: 'duration_within_clamps', detail: `${duration.toFixed(1)}s exceeds max ${clamps.maxDurationSec}s` } };
  }

  // ── 2. Question auto-inclusion (B4, same logic as scoring pipeline) ──
  // If the moment has a setup phase ending with '?' and the payoff doesn't,
  // tryIncludeQuestion was already applied upstream in the structurer — here
  // we just validate that the structure includes a setup when it's a dialogue.
  if (moment.structure.pattern === 'dialogue_qa' && moment.structure.setup_at === undefined) {
    warnings.push('Dialogue moment without a detected question setup — may start mid-exchange.');
    validation.push({ check: 'dialogue_has_setup', passed: false, detail: 'no setup_at' });
  } else {
    validation.push({ check: 'dialogue_has_setup', passed: true });
  }

  // ── 3. Structure completeness ──
  const hasEvent = moment.structure.event_at !== undefined;
  const hasPayoff = moment.structure.payoff_at !== undefined;
  validation.push({ check: 'has_event', passed: hasEvent });
  validation.push({ check: 'has_payoff', passed: hasPayoff, detail: hasPayoff ? undefined : 'payoff not detected — may end before resolution' });
  if (!hasPayoff && moment.structure.pattern === 'reaction_arc') {
    warnings.push('Reaction arc without a detected payoff — clip may end before the moment resolves.');
  }

  // ── 4. Creative decisions (grounded in structure) ──
  const creative: DirectorCreativeDecisions = { framing: determineFraming(ctx, moment) };

  // Punch-in at the reaction timestamp for reaction-heavy genres.
  if (PUNCH_IN_GENRES.has(ctx.genre) && moment.structure.reaction_at !== undefined) {
    creative.punch_in = {
      at: moment.structure.reaction_at,
      zoom: ctx.genre === 'gaming' ? 1.12 : 1.08,
      duration: 1.2,
    };
  }

  // Caption emphasis on the reaction/event window.
  if (moment.structure.event_at !== undefined) {
    const emphasisStart = moment.structure.event_at;
    const emphasisEnd = moment.structure.reaction_at ?? moment.structure.payoff_at ?? emphasisStart + 2;
    creative.caption_emphasis = { start: emphasisStart, end: emphasisEnd };
  }

  // ── 5. Confidence ──
  const blockingFailures = validation.filter((v) => !v.passed && (v.check === 'has_event' || v.check === 'duration_within_clamps'));
  const confidence = Math.max(
    0.2,
    Math.min(0.95,
      moment.confidence * 0.7 +
      (validation.filter((v) => v.passed).length / validation.length) * 0.3 -
      blockingFailures.length * 0.2
    )
  );

  const plan: ClipDirectorPlan = {
    clip_id: '', // assigned by the caller when persisted
    project_id: ctx.project_id,
    user_id: ctx.user_id,
    genre: ctx.genre,
    source_interval: { start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) },
    structure: moment.structure,
    evidence: moment.evidence,
    selection_reason: buildSelectionReason(moment, ctx.genre),
    confidence: Number(confidence.toFixed(2)),
    creative,
    validation,
    warnings,
    created_at: new Date().toISOString(),
  };

  return { plan };
}

function determineFraming(ctx: DirectorBuildContext, moment: MomentCandidate): DirectorCreativeDecisions['framing'] {
  // Event-aware framing: during a gameplay event, prioritize the face if the genre is reaction-heavy.
  if (FACE_FOCUS_EVENT_GENRES.has(ctx.genre) && moment.structure.event_at !== undefined) {
    return 'face_focus_during_event';
  }
  if (ctx.layoutMode === 'screencast') return 'screencast';
  if (ctx.layoutMode === 'split') return 'split';
  if (ctx.layoutMode === 'blur') return 'blur';
  if (ctx.reframeKeyframes && ctx.reframeKeyframes.length > 1) return 'face_track';
  return 'center';
}

function buildSelectionReason(moment: MomentCandidate, genre: string): string {
  const parts: string[] = [];
  if (moment.structure.event_at !== undefined) {
    parts.push(`event at ${moment.structure.event_at.toFixed(1)}s`);
  }
  if (moment.structure.reaction_at !== undefined) {
    parts.push(`reaction at ${moment.structure.reaction_at.toFixed(1)}s`);
  }
  if (moment.structure.payoff_at !== undefined) {
    parts.push(`payoff at ${moment.structure.payoff_at.toFixed(1)}s`);
  }
  const signals = [...new Set(moment.evidence.map((e) => e.signal))].join(', ');
  return `${genre} moment: ${parts.join(' → ')} (signals: ${signals})`;
}

/**
 * Pre-render QA gate: validates a plan before rendering. Returns the list of
 * failed blocking checks (empty = render may proceed).
 */
export function validateDirectorPlan(plan: ClipDirectorPlan): DirectorValidationCheck[] {
  const failures: DirectorValidationCheck[] = [];
  for (const check of plan.validation) {
    if (!check.passed && (check.check === 'has_event' || check.check === 'duration_within_clamps')) {
      failures.push(check);
    }
  }
  // Structural integrity: setup must precede event must precede payoff.
  const st = plan.structure;
  if (st.setup_at !== undefined && st.event_at !== undefined && st.setup_at > st.event_at) {
    failures.push({ check: 'structure_order', passed: false, detail: 'setup after event' });
  }
  if (st.event_at !== undefined && st.payoff_at !== undefined && st.event_at > st.payoff_at) {
    failures.push({ check: 'structure_order', passed: false, detail: 'event after payoff' });
  }
  return failures;
}
