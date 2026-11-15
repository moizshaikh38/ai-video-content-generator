import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

/**
 * Two-pass EBU R128 loudness normalization support.
 *
 * Why this exists (measured, Nov 15 2026): one-pass `loudnorm` holds its input
 * until EOF before emitting, and while it blocks, decoded video frames accumulate
 * unbounded in upstream filter FIFOs. On a 120s 1080p source through the Pro
 * editor B-roll graph the render was OOM-killed at ~1.2GB RSS; with two-pass
 * linear loudnorm the same render peaks at ~473MB and completes.
 *
 * FFmpeg 7.0 af_loudnorm.c init() applies linear mode ONLY when ALL of:
 *   measured_tp !== 99, measured_thresh !== -70, measured_lra !== 0, measured_i !== 0,
 *   measured_tp + (target_i - measured_i) <= target_tp, measured_lra <= target_lra
 * Otherwise it SILENTLY falls back to dynamic (no log message), which reintroduces
 * the buffering failure. So this service validates feasibility itself and fails
 * the render with a clear error instead of silently switching modes.
 *
 * Non-finite measurements (silence / below the -70 LUFS absolute gate report
 * input_i=-inf, input_tp=-inf, target_offset=inf) cannot even be passed back to
 * loudnorm (AVOption range rejects them), so they are separate hard errors.
 */

export interface LoudnormMeasured {
  inputI: number;
  inputTP: number;
  inputLRA: number;
  inputThresh: number;
  targetOffset: number;
}

export interface LoudnormMeasurementGraph {
  filterComplex: string[];
  audioMap: string;
  targetI: number;
}

export class LoudnormNormalizationError extends Error {
  public readonly reason: string;
  constructor(reason: string) {
    super(`Loudness normalization cannot be applied to this dialogue audio: ${reason}`);
    this.name = 'LoudnormNormalizationError';
    this.reason = reason;
  }
}

export class LoudnormTwoPassService {
  /** Extract and validate the loudnorm measurement JSON from a pass-1 stderr log. */
  public static parseMeasurement(stderr: string): LoudnormMeasured {
    // print_format=json logs one block per loudnorm instance; take the last one.
    const blocks = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
    if (!blocks || blocks.length === 0) {
      const tail = stderr.trim().split('\n').slice(-3).join(' | ').slice(0, 300);
      throw new LoudnormNormalizationError(
        'measurement pass produced no loudnorm statistics' + (tail ? ` (ffmpeg: ${tail})` : '')
      );
    }
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(blocks[blocks.length - 1]);
    } catch {
      throw new LoudnormNormalizationError('measurement pass returned malformed loudnorm statistics');
    }
    const raw = {
      inputI: Number(parsed['input_i']),
      inputTP: Number(parsed['input_tp']),
      inputLRA: Number(parsed['input_lra']),
      inputThresh: Number(parsed['input_thresh']),
      targetOffset: Number(parsed['target_offset']),
    };
    const anyMissing = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'].some(
      (k) => parsed[k] === undefined
    );
    if (anyMissing) {
      throw new LoudnormNormalizationError('measurement pass returned incomplete loudnorm statistics');
    }
    if (!Number.isFinite(raw.inputI) || !Number.isFinite(raw.inputTP) || !Number.isFinite(raw.targetOffset)) {
      // Silence or audio below loudnorm's absolute gate reports -inf/inf here.
      throw new LoudnormNormalizationError(
        'dialogue audio is silent or below the loudness measurement gate (measured loudness is -inf)'
      );
    }
    if (!Number.isFinite(raw.inputLRA) || !Number.isFinite(raw.inputThresh)) {
      throw new LoudnormNormalizationError('measurement pass returned non-finite loudness range/threshold');
    }
    return raw;
  }

  /**
   * Mirror of FFmpeg 7.0 af_loudnorm.c init() linear-mode conditions, so we can
   * fail loudly instead of letting the filter silently switch to dynamic mode.
   */
  public static assessLinearFeasibility(
    m: LoudnormMeasured,
    targetI: number,
    targetTP: number,
    targetLRA: number
  ): { ok: true } | { ok: false; reason: string } {
    if (m.inputTP === 99 || m.inputThresh === -70 || m.inputLRA === 0 || m.inputI === 0) {
      return {
        ok: false,
        reason:
          `measurement is degenerate (input_i=${m.inputI}, input_lra=${m.inputLRA}, ` +
          `input_thresh=${m.inputThresh}); FFmpeg would silently fall back to dynamic mode`,
      };
    }
    const gainDb = targetI - m.inputI;
    const offsetTP = m.inputTP + gainDb;
    if (offsetTP > targetTP) {
      return {
        ok: false,
        reason:
          `linear gain of ${gainDb.toFixed(2)}dB would push true peak to ${offsetTP.toFixed(2)}dBTP, ` +
          `above the ${targetTP}dBTP ceiling`,
      };
    }
    if (m.inputLRA > targetLRA) {
      return {
        ok: false,
        reason: `measured loudness range ${m.inputLRA}LU exceeds the target ${targetLRA}LU`,
      };
    }
    return { ok: true };
  }

  /** loudnorm filter string for the final render pass (linear, measured values). */
  public static buildLinearFilter(targetI: number, targetTP: number, targetLRA: number, m: LoudnormMeasured): string {
    return (
      `loudnorm=I=${targetI}:TP=${targetTP}:LRA=${targetLRA}` +
      `:measured_I=${m.inputI}:measured_TP=${m.inputTP}:measured_LRA=${m.inputLRA}` +
      `:measured_thresh=${m.inputThresh}:offset=${m.targetOffset}:linear=true`
    );
  }

  /** loudnorm filter string for the measurement pass. */
  public static buildMeasureFilter(targetI: number, targetTP: number, targetLRA: number): string {
    return `loudnorm=I=${targetI}:TP=${targetTP}:LRA=${targetLRA}:print_format=json`;
  }

  /**
   * Run the audio-only measurement pass. Video streams are never decoded: the
   * measurement graph references only audio pads, so ffmpeg demuxes but does not
   * decode/queue video. Cost scales with source length (audio decode only).
   */
  public static async measure(
    inputArgs: string[],
    measurement: LoudnormMeasurementGraph,
    timeoutMs = 300_000
  ): Promise<LoudnormMeasured> {
    const args = [
      '-hide_banner',
      '-nostats',
      ...inputArgs,
      '-filter_complex',
      measurement.filterComplex.join(';'),
      '-map',
      measurement.audioMap,
      '-f',
      'null',
      '-',
    ];
    let stderr = '';
    try {
      const res = await execFileAsync(ffmpegBin, args, { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
      stderr = res.stderr || '';
    } catch (err: any) {
      if (err?.stderr) stderr = err.stderr;
      // ffmpeg exits non-zero if the graph itself is invalid; measurement JSON may
      // still be absent, in which case parseMeasurement produces the clear error.
      if (!stderr) {
        throw new LoudnormNormalizationError(`measurement pass failed to run: ${err?.message || err}`);
      }
    }
    return LoudnormTwoPassService.parseMeasurement(stderr);
  }
}
