import { ClipDirectorPlan, DirectorValidationCheck } from '../types/index.js';
import { validateDirectorPlan } from './directorPlanBuilder.js';
import { CAPTION_READABILITY } from '../shared/captionPresets.js';

/**
 * Pre-render QA gate (AI Clip Director, Phase 4).
 *
 * Validates a ClipDirectorPlan before it reaches the renderer. Blocking
 * failures prevent the render; non-blocking issues are surfaced as warnings.
 * When a non-blocking failure is repairable, the plan is auto-repaired once
 * and the repair is recorded.
 */

export interface DirectorQAResult {
  /** True when the plan may proceed to render. */
  ok: boolean;
  /** Blocking failures (empty = render may proceed). */
  blocking: DirectorValidationCheck[];
  /** Non-blocking warnings. */
  warnings: string[];
  /** Repairs applied by the auto-repair pass. */
  repairs: string[];
  /** The (possibly repaired) plan to render. */
  plan: ClipDirectorPlan;
}

export interface DirectorQAOptions {
  /** Maximum allowed caption chars-per-second in the plan window. */
  maxCharsPerSecond?: number;
  /** Minimum required structural confidence. */
  minConfidence?: number;
}

/**
 * Validates and optionally repairs a director plan. Deterministic; no IO.
 */
export function runDirectorQA(
  plan: ClipDirectorPlan,
  options: DirectorQAOptions = {}
): DirectorQAResult {
  const maxCps = options.maxCharsPerSecond ?? 28;
  const minConfidence = options.minConfidence ?? 0.3;
  const warnings: string[] = [];
  const repairs: string[] = [];
  const repaired: ClipDirectorPlan = { ...plan, structure: { ...plan.structure }, creative: { ...plan.creative } };

  // 1. Structural validation (from the plan builder)
  let blocking = validateDirectorPlan(plan);

  // 2. Confidence gate
  if (plan.confidence < minConfidence) {
    blocking.push({
      check: 'confidence_above_threshold',
      passed: false,
      detail: `confidence ${plan.confidence} below minimum ${minConfidence}`,
    });
  }

  // 3. Structure order integrity (setup ≤ event ≤ payoff)
  const st = plan.structure;
  if (st.setup_at !== undefined && st.event_at !== undefined && st.setup_at > st.event_at) {
    // Repairable: swap setup/event if the gap is small (< 2s).
    if (st.setup_at - st.event_at < 2) {
      repaired.structure.setup_at = st.event_at;
      repaired.structure.event_at = st.setup_at;
      repairs.push('swapped setup/event timestamps (inversion within 2s tolerance)');
      blocking = blocking.filter((c) => c.check !== 'structure_order');
    } else {
      blocking.push({ check: 'structure_order', passed: false, detail: 'setup after event by more than 2s' });
    }
  }
  if (st.event_at !== undefined && st.payoff_at !== undefined && st.event_at > st.payoff_at) {
    blocking.push({ check: 'event_before_payoff', passed: false, detail: 'event after payoff (impossible structure)' });
  }

  // 4. Source interval sanity: start < end, end > 0
  if (plan.source_interval.end <= plan.source_interval.start) {
    blocking.push({ check: 'source_interval_valid', passed: false, detail: 'end ≤ start' });
  }

  // 5. Non-blocking: punch-in timing sanity
  if (plan.creative.punch_in) {
    const pi = plan.creative.punch_in;
    if (pi.at < plan.source_interval.start || pi.at > plan.source_interval.end) {
      warnings.push(`punch-in at ${pi.at}s outside source interval — ignored`);
      repaired.creative.punch_in = undefined;
    }
  }

  // 6. Non-blocking: caption emphasis window sanity
  if (plan.creative.caption_emphasis) {
    const ce = plan.creative.caption_emphasis;
    if (ce.end <= ce.start) {
      warnings.push('caption emphasis window has zero duration — removed');
      repaired.creative.caption_emphasis = undefined;
    }
  }

  const ok = blocking.length === 0;
  return { ok, blocking, warnings, repairs, plan: ok ? repaired : plan };
}

/**
 * Estimates the plan's effective duration (after creative decisions).
 * Used by the renderer to set expected duration for ffprobe validation.
 */
export function estimatePlanDuration(plan: ClipDirectorPlan): number {
  return Math.max(0.1, plan.source_interval.end - plan.source_interval.start);
}

/**
 * Determines whether the plan includes a punch-in at a given time.
 * Used by the render graph to inject zoom filters.
 */
export function hasPunchInAt(plan: ClipDirectorPlan, time: number): boolean {
  if (!plan.creative.punch_in) return false;
  const pi = plan.creative.punch_in;
  return time >= pi.at && time <= pi.at + pi.duration;
}
