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
 *   finite/non-sentinel measurements, measured_lra !== 0,
 *   measured_tp + (target_i - measured_i) <= target_tp, measured_lra <= target_lra
 * Otherwise it SILENTLY falls back to dynamic (no log message), which reintroduces
 * the buffering failure. So this service validates feasibility itself and either
 * falls back to a bounded pre-rendered dynamic pass or fails with a clear error.
 *
 * Metering basis (measured, Nov 15 2026): pass 1 meters the exact spliced
 * dialogue program with the ebur128 filter, pass 2 applies the constant linear
 * gain `volume=(targetI - measuredI)dB`. af_loudnorm.c (FFmpeg 7.0.2) init()
 * shows loudnorm's own linear mode is the same constant gain (dst = src *
 * 10^((target_i - measured_i)/20); the `offset` option is ignored in linear
 * mode) - but loudnorm's INTERNAL meter reads lower than the ebur128 filter on
 * identical samples (measured: 0.47 LU on steady tones, ~2 LU on speech with
 * pauses; both wrap libebur128, the divergence mechanism is not fully isolated).
 * Using the ebur128 filter as the single basis for measurement, application and
 * verification closes the loop at 0.0 LU: a controlled same-file test meters
 * the linear output at exactly the target on the measuring meter, and external
 * validation tools see the same numbers our tests assert.
 *
 * Silence / audio below the -70 LUFS absolute gate (ebur128 reports Peak=-inf,
 * I pinned at -70.0) is a separate hard error.
 */

export interface LoudnormMeasured {
  /** Integrated loudness of the dialogue program, ebur128 filter basis (LUFS). */
  inputI: number;
  /** True peak of the dialogue program, ebur128 peak=true basis (dBTP). */
  inputTP: number;
  /** Loudness range of the dialogue program, ebur128 filter basis (LU). */
  inputLRA: number;
}

export interface LoudnormMeasurementGraph {
  /** Original finite dialogue duration, before any short-program lookahead pad. */
  programDuration?: number;
  /** Measured linear target gain would exceed the requested true-peak ceiling. */
  peakConstrained?: boolean;
  filterComplex: string[];
  audioMap: string;
  targetI: number;
  /** Dialogue chain input pad (e.g. '[0:a]', '[base_a_speed]'). */
  dialogueInputLabel: string;
  /** Dialogue filters before the loudnorm marker (level-dependent processors). */
  preMarkerFilters: string[];
  /** Dialogue filters after the loudnorm marker (limiter, fades). */
  postMarkerFilters: string[];
}

export class LoudnormNormalizationError extends Error {
  public readonly reason: string;
  /** True when the measurement failed because the dialogue is silent/below the
   * ebur128 absolute gate - the render can proceed WITHOUT normalization. */
  public readonly silent: boolean;
  constructor(reason: string, silent = false) {
    super(`Loudness normalization cannot be applied to this dialogue audio: ${reason}`);
    this.name = 'LoudnormNormalizationError';
    this.reason = reason;
    this.silent = silent;
  }
}

export class LoudnormTwoPassService {
  /** Extract and validate the ebur128 summary statistics from a pass-1 stderr log. */
  public static parseMeasurement(stderr: string): LoudnormMeasured {
    // ebur128 logs periodic stats, then one "Summary:" block per instance; use the last.
    const summaryIdx = stderr.lastIndexOf('Summary:');
    if (summaryIdx === -1) {
      const tail = stderr.trim().split('\n').slice(-3).join(' | ').slice(0, 300);
      throw new LoudnormNormalizationError(
        'measurement pass produced no loudness statistics' + (tail ? ` (ffmpeg: ${tail})` : '')
      );
    }
    const summary = stderr.slice(summaryIdx);
    const grab = (re: RegExp): number | null => {
      const m = summary.match(re);
      if (!m) return null;
      if (m[1] === '-inf') return -Infinity;
      if (m[1] === 'inf') return Infinity;
      const v = Number(m[1]);
      return Number.isNaN(v) ? null : v;
    };
    const raw = {
      inputI: grab(/\n\s*I:\s+(-?(?:\d+(?:\.\d+)?|inf))\s+LUFS/),
      inputLRA: grab(/\n\s*LRA:\s+(-?(?:\d+(?:\.\d+)?|inf))\s+LU\b/),
      inputTP: grab(/True peak:\s*\n\s*Peak:\s+(-?(?:\d+(?:\.\d+)?|inf))\s+dBFS/),
    };
    if (raw.inputI === null || raw.inputLRA === null || raw.inputTP === null) {
      throw new LoudnormNormalizationError('measurement pass returned incomplete loudness statistics');
    }
    if (!Number.isFinite(raw.inputI) || !Number.isFinite(raw.inputTP) || raw.inputI <= -70) {
      // Silence or audio below the absolute gate: ebur128 pins I at -70 LUFS and
      // reports Peak=-inf.
      throw new LoudnormNormalizationError(
        'dialogue audio is silent or below the loudness measurement gate (measured loudness is -inf)',
        true
      );
    }
    if (!Number.isFinite(raw.inputLRA)) {
      throw new LoudnormNormalizationError('measurement pass returned non-finite loudness range');
    }
    return raw as LoudnormMeasured;
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
  ): { ok: true } | { ok: false; reason: string; fallback: 'dynamic-prerender' | null } {
    if (!Number.isFinite(m.inputI) || !Number.isFinite(m.inputTP) || !Number.isFinite(m.inputLRA)) {
      // parseMeasurement already rejects these; guard direct callers.
      return {
        ok: false,
        fallback: null,
        reason:
          `measurement is degenerate (input_i=${m.inputI}, input_tp=${m.inputTP}, ` +
          `input_lra=${m.inputLRA}); FFmpeg would silently fall back to dynamic mode`,
      };
    }
    if (m.inputLRA === 0) {
      // Constant-level audio (e.g. a steady tone): FFmpeg excludes LRA=0 from
      // linear mode, but dynamic normalization handles it fine (legacy behavior).
      return {
        ok: false,
        fallback: 'dynamic-prerender',
        reason: `measured loudness range is 0 LU (constant-level audio); linear mode unavailable`,
      };
    }
    const gainDb = targetI - m.inputI;
    const offsetTP = m.inputTP + gainDb;
    if (offsetTP > targetTP) {
      return {
        ok: false,
        fallback: 'dynamic-prerender',
        reason:
          `linear gain of ${gainDb.toFixed(2)}dB would push true peak to ${offsetTP.toFixed(2)}dBTP, ` +
          `above the ${targetTP}dBTP ceiling`,
      };
    }
    if (m.inputLRA > targetLRA) {
      return {
        ok: false,
        fallback: 'dynamic-prerender',
        reason: `measured loudness range ${m.inputLRA}LU exceeds the target ${targetLRA}LU`,
      };
    }
    return { ok: true };
  }

  /**
   * Constant linear gain filter for the final render pass: (targetI - measured I)
   * in dB, ebur128 basis. Numerically identical to loudnorm's linear mode
   * (af_loudnorm.c LINEAR_MODE multiplies each sample by 10^((target_i -
   * measured_i)/20)) without switching metering basis between measurement and
   * verification. Call ONLY after assessLinearFeasibility passes, so the applied
   * gain is known to keep true peak <= targetTP.
   *
   * Placement rule (measured, Nov 15 2026): append this AFTER every
   * level-dependent processor in the dialogue chain (compressors, limiters) and
   * meter the measurement pass at the same end-of-chain position. A gain placed
   * before a limiter is not additive with the limiter's gain reduction, which
   * left outputs ~1.7 LU hot on limited material; constant gain commutes exactly
   * with the linear fades that follow.
   */
  public static buildLinearGainFilter(targetI: number, m: LoudnormMeasured): string {
    return `volume=${(targetI - m.inputI).toFixed(2)}dB`;
  }

  /** ebur128 meter filter string for the measurement pass (integrated, range, true peak). */
  public static buildMeasureFilter(_targetI: number, _targetTP: number, _targetLRA: number): string {
    return 'ebur128=peak=true';
  }

  /**
   * Pre-render the dialogue program with legacy one-pass (dynamic) loudnorm into
   * a WAV, for content where linear mode is infeasible (true-peak headroom or
   * loudness-range limits). TP=-2.0 gives the pre-encode headroom so the delivered
   * (AAC-encoded) output holds the -1.5dBTP ceiling within 0.5dB codec overshoot.
   * The dialogue chain is rebuilt with one-pass loudnorm
   * at the marker position (limiter/fades after it) - the same one-pass dynamic
   * behavior legacy renders had, with the tighter TP ceiling, as a bounded
   * audio-only process: no video is decoded, so the muxer-stall frame queue that
   * OOM-killed in-graph one-pass renders cannot form.
   */
  public static async renderNormalizedDialogue(
    inputArgs: string[],
    measurement: LoudnormMeasurementGraph,
    outWavPath: string,
    timeoutMs = 300_000
  ): Promise<void> {
    const legacyFilter = `loudnorm=I=${measurement.targetI}:TP=-2.0:LRA=11`;
    const duration=measurement.programDuration;
    const shortProgram=measurement.peakConstrained===true&&typeof duration==='number'&&Number.isFinite(duration)&&duration>0&&duration<3;
    // The dynamic normalizer needs its three-second analysis window. A shorter
    // EOF can fall into an attenuating linear result even with linear=false.
    // Pad only the audio analysis input and remove that pad after processing.
    const lookaheadPad=shortProgram?['apad=whole_dur=3']:[];
    const restoreDuration=shortProgram?[`atrim=end=${duration.toFixed(6)}`]:[];
    // Rebuild the dialogue chain with one-pass loudnorm at the marker position
    // (limiter/fades after it), exactly as legacy one-pass renders had it. The
    // measurement graph meters at end-of-chain instead, so a blind string swap
    // would misplace the loudnorm.
    const chain =
      `${measurement.dialogueInputLabel}` +
      `${[...measurement.preMarkerFilters, ...lookaheadPad, legacyFilter, ...measurement.postMarkerFilters, ...restoreDuration].join(',')}` +
      `${measurement.audioMap}`;
    const renderChains = [...measurement.filterComplex.slice(0, -1), chain];
    await execFileAsync(
      ffmpegBin,
      [
        '-y',
        '-hide_banner',
        ...inputArgs,
        '-filter_complex',
        renderChains.join(';'),
        '-map',
        measurement.audioMap,
        '-c:a',
        'pcm_s16le',
        outWavPath,
      ],
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }
    );
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
