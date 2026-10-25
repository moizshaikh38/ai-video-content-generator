/**
 * Audio-spike reaction detection (gaming/quality roadmap).
 *
 * Pure detection over the multimodal timeline's per-segment audio energy:
 * a "reaction spike" is a rapid surge in audio energy relative to the local
 * baseline — screams, exclamations, sudden laughter. Used two ways:
 *  - standalone gaming signal (fallback when VLM game events are unavailable),
 *  - cross-validation for VLM gameplay events (both signals agreeing is a
 *    high-confidence moment).
 */

export interface EnergySegment {
  start: number;
  end: number;
  audio_energy_db: number;
}

export interface ReactionSpike {
  /** Spike peak timestamp. */
  time: number;
  /** dB above local baseline at the peak. */
  magnitude: number;
  /** Absolute dB at the peak (for UI). */
  peakDb: number;
  /** Confidence 0..1 from magnitude and corroboration length. */
  confidence: number;
}

export interface SpikeOptions {
  /** dB rise over local baseline required to call a spike. */
  thresholdDb?: number;
  /** Local baseline window length (seconds) on each side. */
  baselineWindowSec?: number;
  /** Minimum gap between reported spikes. */
  minSeparationSec?: number;
  /** Segments below this absolute level are ignored (noise floor). */
  minAbsoluteDb?: number;
}

const DEFAULTS: Required<SpikeOptions> = {
  thresholdDb: 9,
  baselineWindowSec: 8,
  minSeparationSec: 3,
  minAbsoluteDb: -45,
};

export function detectReactionSpikes(
  segments: EnergySegment[],
  options: SpikeOptions = {}
): ReactionSpike[] {
  const { thresholdDb, baselineWindowSec, minSeparationSec, minAbsoluteDb } = {
    ...DEFAULTS,
    ...options,
  };

  const valid = (segments || [])
    .filter((s) => s && Number.isFinite(s.audio_energy_db) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  if (valid.length < 3) return [];

  const spikes: ReactionSpike[] = [];
  let lastReported = Number.NEGATIVE_INFINITY;

  for (const seg of valid) {
    if (seg.audio_energy_db < minAbsoluteDb) continue;

    // Local baseline: median energy of nearby segments (robust to the spike itself)
    const neighbors = valid.filter(
      (s) => s !== seg && s.start >= seg.start - baselineWindowSec && s.end <= seg.end + baselineWindowSec
    );
    if (neighbors.length < 2) continue;
    const energies = neighbors.map((s) => s.audio_energy_db).sort((a, b) => a - b);
    const baseline = energies[Math.floor(energies.length / 2)];

    const magnitude = seg.audio_energy_db - baseline;
    if (magnitude < thresholdDb) continue;

    const time = seg.start;
    if (time - lastReported < minSeparationSec) {
      // Keep the stronger of two spikes inside the separation window.
      const prev = spikes[spikes.length - 1];
      if (magnitude > prev.magnitude) {
        spikes[spikes.length - 1] = {
          time,
          magnitude: Number(magnitude.toFixed(1)),
          peakDb: seg.audio_energy_db,
          confidence: confidenceFor(magnitude),
        };
        lastReported = time;
      }
      continue;
    }

    spikes.push({
      time,
      magnitude: Number(magnitude.toFixed(1)),
      peakDb: seg.audio_energy_db,
      confidence: confidenceFor(magnitude),
    });
    lastReported = time;
  }

  return spikes;
}

function confidenceFor(magnitude: number): number {
  // 9dB → ~0.5, 15dB+ → ~0.9, capped 0.95
  return Number(Math.min(0.95, Math.max(0.3, 0.3 + (magnitude - 9) * 0.05)).toFixed(2));
}

/**
 * Cross-validates VLM gameplay events against audio spikes: an event within
 * `toleranceSec` of a spike gains corroboration. Returns the max combined
 * confidence for an event and whether a spike agreed.
 */
export function corroborateEventWithSpikes(
  eventTime: number,
  eventConfidence: number,
  spikes: ReactionSpike[],
  toleranceSec = 4
): { confidence: number; corroborated: boolean } {
  const near = spikes.filter((s) => Math.abs(s.time - eventTime) <= toleranceSec);
  if (near.length === 0) {
    return { confidence: Math.min(0.9, eventConfidence), corroborated: false };
  }
  const best = Math.max(...near.map((s) => s.confidence));
  // Agreement boosts toward 1 but never fully trusts a single signal.
  const combined = Math.min(0.97, eventConfidence * 0.6 + best * 0.5);
  return { confidence: Number(combined.toFixed(2)), corroborated: true };
}
