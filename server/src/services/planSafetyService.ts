/**
 * PlanSafetyService — code-enforced limits on producer edit plan operations.
 *
 * Producer plans are user-revisable (POST .../plans/:planId/revise merges
 * caller-supplied `operation_overrides.parameters` into stored operations)
 * and are rendered by ffmpeg. Before this service existed, arbitrary
 * parameter values flowed straight into the render graph: out-of-range trim
 * offsets, huge REMOVE_RANGE sets, non-finite numbers, and unbounded
 * caption/audio values. This module clamps every parameter the renderers
 * consume and drops operations that cannot be made safe, so a bad plan
 * (AI-authored or client-authored) degrades to a benign render instead of a
 * stalled/failed/exploitative one.
 *
 * Pure functions only: no service imports, so both ProducerPlanningService
 * (write-time) and ProducerRenderService (render-time) can use it without an
 * import cycle.
 */

import type {
  ProducerOperation,
  ProducerOperationType,
} from '../types/index.js';
import { PRODUCER_OPERATION_TYPES } from '../types/index.js';

export interface PlanSanitizeResult {
  operations: ProducerOperation[];
  warnings: string[];
}

/** Fallback span used when the clip's usable duration is unknown. */
const UNKNOWN_DURATION_FALLBACK_SEC = 86400;

const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ALLOWED_ASPECT_RATIOS = new Set(['9:16', '16:9', '1:1']);
const ALLOWED_CROP_MODES = new Set(['center', 'auto', 'manual']);

function clampNum(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Clamp one numeric parameter in place when present. Non-finite values
 * (NaN, Infinity) are removed and reported so the renderer falls back to
 * its default.
 */
function clampParam(
  op: ProducerOperation,
  key: string,
  min: number,
  max: number,
  warnings: string[]
): void {
  const value = op.parameters[key];
  if (value === undefined) return;
  if (!isFiniteNumber(value)) {
    delete op.parameters[key];
    warnings.push(`${op.type}:${key} non-finite, removed`);
    return;
  }
  const clamped = clampNum(value, min, max);
  if (clamped !== value) {
    op.parameters[key] = Number(clamped.toFixed(3));
    warnings.push(`${op.type}:${key} clamped ${value} -> ${op.parameters[key]}`);
  }
}

/**
 * Return a sanitized deep copy of the plan's operations plus human-readable
 * warnings describing every clamp/drop. Never throws; unknown or unusable
 * operations are dropped (treated as disabled downstream).
 *
 * @param operations plan operations as stored
 * @param clipDurationSec usable clip span in seconds (end - start). When not
 *   a positive finite number, a generous fallback keeps range clamps loose
 *   while structural limits (counts, sizes, enums) still apply.
 */
export function sanitizePlanOperations(
  operations: ProducerOperation[] | null | undefined,
  clipDurationSec: number
): PlanSanitizeResult {
  const warnings: string[] = [];
  if (!Array.isArray(operations)) {
    return { operations: [], warnings: operations == null ? [] : ['operations not an array, dropped'] };
  }

  const duration = isFiniteNumber(clipDurationSec) && clipDurationSec > 0
    ? clipDurationSec
    : UNKNOWN_DURATION_FALLBACK_SEC;

  const out: ProducerOperation[] = [];

  for (const raw of operations) {
    if (!raw || typeof raw !== 'object') {
      warnings.push('non-object operation dropped');
      continue;
    }
    const op: ProducerOperation = JSON.parse(JSON.stringify(raw));
    if (!PRODUCER_OPERATION_TYPES.includes(op.type as ProducerOperationType)) {
      warnings.push(`unknown operation type '${String(op.type)}' dropped`);
      continue;
    }
    if (!op.parameters || typeof op.parameters !== 'object') {
      op.parameters = {};
    }

    switch (op.type) {
      case 'INTRO_TRIM':
      case 'TRIM':
        clampParam(op, 'start_sec', 0, Math.max(0, duration - 1.5), warnings);
        break;

      case 'OUTRO_TRIM':
        clampParam(op, 'end_sec', 0, Math.max(0, duration - 1.5), warnings);
        break;

      case 'REMOVE_RANGE': {
        const ranges = op.parameters.cut_ranges;
        if (ranges !== undefined && !Array.isArray(ranges)) {
          delete op.parameters.cut_ranges;
          warnings.push('REMOVE_RANGE:cut_ranges not an array, removed');
          break;
        }
        if (Array.isArray(ranges)) {
          const kept: Array<{ start: number; end: number; duration: number }> = [];
          let totalCut = 0;
          const maxCut = 0.8 * duration;
          for (const cut of ranges.slice(0, 200)) {
            if (!cut || !isFiniteNumber(cut.start) || !isFiniteNumber(cut.end)) {
              warnings.push('REMOVE_RANGE range with non-finite bounds dropped');
              continue;
            }
            const start = clampNum(cut.start, 0, duration);
            const end = clampNum(cut.end, 0, duration);
            if (end <= start + 0.05) {
              warnings.push(`REMOVE_RANGE empty/reversed range ${cut.start}-${cut.end} dropped`);
              continue;
            }
            if (totalCut + (end - start) > maxCut) {
              warnings.push(`REMOVE_RANGE range ${cut.start}-${cut.end} dropped (cumulative cut cap 80% of clip)`);
              continue;
            }
            totalCut += end - start;
            kept.push({ start, end, duration: Number((end - start).toFixed(3)) });
          }
          if (ranges.length > 200) {
            warnings.push(`REMOVE_RANGE cut_ranges capped at 200 (had ${ranges.length})`);
          }
          op.parameters.cut_ranges = kept;
        }
        break;
      }

      case 'PUNCH_IN':
        clampParam(op, 'punch_in_start_sec', 0, Math.max(0, duration - 0.4), warnings);
        clampParam(op, 'punch_in_duration_sec', 0.4, 12, warnings);
        clampParam(op, 'scale', 1.0, 2.0, warnings);
        break;

      case 'CAPTION_STYLE':
        clampParam(op, 'font_size', 32, 110, warnings);
        if (op.parameters.primary_color !== undefined && !HEX_COLOR_RE.test(String(op.parameters.primary_color))) {
          delete op.parameters.primary_color;
          warnings.push('CAPTION_STYLE:primary_color invalid, removed');
        }
        break;

      case 'CAPTION_EMPHASIS':
        if (op.parameters.highlight_color !== undefined && !HEX_COLOR_RE.test(String(op.parameters.highlight_color))) {
          delete op.parameters.highlight_color;
          warnings.push('CAPTION_EMPHASIS:highlight_color invalid, removed');
        }
        break;

      case 'HOOK_TEXT': {
        if (op.parameters.text !== undefined) {
          const text = String(op.parameters.text);
          if (text.length > 50) {
            op.parameters.text = text.slice(0, 50);
            warnings.push(`HOOK_TEXT:text truncated to 50 chars (was ${text.length})`);
          }
        }
        clampParam(op, 'display_start_sec', 0, duration, warnings);
        clampParam(op, 'display_end_sec', 0, duration, warnings);
        if (
          isFiniteNumber(op.parameters.display_start_sec) &&
          isFiniteNumber(op.parameters.display_end_sec) &&
          op.parameters.display_end_sec <= op.parameters.display_start_sec
        ) {
          op.parameters.display_end_sec = Number((op.parameters.display_start_sec + 3.5).toFixed(3));
          warnings.push('HOOK_TEXT:display_end_sec before start, reset to start+3.5s');
        }
        break;
      }

      case 'AUDIO_FADE':
        clampParam(op, 'fade_in_sec', 0, Math.min(5, duration / 2), warnings);
        clampParam(op, 'fade_out_sec', 0, Math.min(5, duration / 2), warnings);
        break;

      case 'NORMALIZE_AUDIO':
        clampParam(op, 'gain_db', -20, 20, warnings);
        clampParam(op, 'target_lufs', -30, -6, warnings);
        break;

      case 'AUDIO_GAIN':
        clampParam(op, 'gain_db', -40, 40, warnings);
        break;

      case 'REFRAME':
        if (op.parameters.aspect_ratio !== undefined && !ALLOWED_ASPECT_RATIOS.has(String(op.parameters.aspect_ratio))) {
          delete op.parameters.aspect_ratio;
          warnings.push(`REFRAME:aspect_ratio '${String(op.parameters.aspect_ratio)}' unsupported, removed`);
        }
        if (op.parameters.crop_mode !== undefined && !ALLOWED_CROP_MODES.has(String(op.parameters.crop_mode))) {
          delete op.parameters.crop_mode;
          warnings.push(`REFRAME:crop_mode '${String(op.parameters.crop_mode)}' unsupported, removed`);
        }
        break;

      case 'TEXT_OVERLAY':
        if (op.parameters.text !== undefined && String(op.parameters.text).length > 200) {
          op.parameters.text = String(op.parameters.text).slice(0, 200);
          warnings.push('TEXT_OVERLAY:text truncated to 200 chars');
        }
        break;

      default:
        // CUT, BRAND_OVERLAY, WATERMARK: no numeric render params consumed.
        break;
    }

    out.push(op);
  }

  // Cross-operation invariant: intro + outro trims cannot consume the clip.
  const intro = out.find((o) => (o.type === 'INTRO_TRIM' || o.type === 'TRIM') && o.enabled);
  const outro = out.find((o) => o.type === 'OUTRO_TRIM' && o.enabled);
  if (intro && outro && isFiniteNumber(intro.parameters.start_sec) && isFiniteNumber(outro.parameters.end_sec)) {
    const combined = intro.parameters.start_sec + outro.parameters.end_sec;
    const maxCombined = Math.max(0, duration - 1.5);
    if (combined > maxCombined) {
      const reduced = Math.max(0, maxCombined - intro.parameters.start_sec);
      outro.parameters.end_sec = Number(reduced.toFixed(3));
      warnings.push(`INTRO+OUTRO trims exceed clip, OUTRO_TRIM:end_sec reduced to ${outro.parameters.end_sec}`);
    }
  }

  return { operations: out, warnings };
}

/**
 * Convenience for services holding a clip record: derive the usable span
 * from start/end seconds (falls back internally when unknown).
 */
export function clipSpanSeconds(clip: { start_seconds?: number; end_seconds?: number } | null | undefined): number {
  const start = clip && isFiniteNumber(clip.start_seconds) ? Number(clip.start_seconds) : 0;
  const end = clip && isFiniteNumber(clip.end_seconds) ? Number(clip.end_seconds) : 0;
  return end > start ? end - start : UNKNOWN_DURATION_FALLBACK_SEC;
}
