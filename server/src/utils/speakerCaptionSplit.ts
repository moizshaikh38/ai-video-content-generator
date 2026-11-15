/**
 * Speaker-split captions (OpenShorts): in a two-speaker split layout
 * (speaker 1 stacked on top, speaker 2 on the bottom), anchor each caption
 * cue to the half of the canvas where the speaking subject is.
 *
 * Attribution is grounded, never fabricated: a cue is attributed only when a
 * reframe keyframe (the followed, mouth-motion-dominant subject) exists near
 * its start AND the two speaker zones are distinguishable in the source.
 * Anything else leaves the cue untouched so captions render exactly as before.
 */

export interface SpeakerSplitKeyframe {
  time: number;    // clip-relative seconds (matches cue-local times)
  centerX: number; // normalized source x of the followed subject, 0..1
}

export interface SpeakerSplitZones {
  speaker1X: number; // source x of the TOP-half speaker, 0..1
  speaker2X: number; // source x of the BOTTOM-half speaker, 0..1
}

/** Top-half speaker's caption band: bottom of the upper half, above the divider. */
export const SPEAKER1_POSITION_Y = 0.4;
/** Minimum source-x separation for the zones to be distinguishable. */
export const MIN_ZONE_SEPARATION = 0.08;
/** Max |keyframe time - cue start| for attribution. */
export const MAX_KEYFRAME_DISTANCE_SEC = 1.0;

export function attributeCueSpeaker(
  cueStart: number,
  keyframes: SpeakerSplitKeyframe[],
  zones: SpeakerSplitZones,
  maxDistanceSec: number = MAX_KEYFRAME_DISTANCE_SEC
): 'speaker1' | 'speaker2' | null {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return null;
  if (!Number.isFinite(zones.speaker1X) || !Number.isFinite(zones.speaker2X)) return null;
  if (Math.abs(zones.speaker1X - zones.speaker2X) < MIN_ZONE_SEPARATION) return null;
  let best: SpeakerSplitKeyframe | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const k of keyframes) {
    if (!Number.isFinite(k?.time) || !Number.isFinite(k?.centerX)) continue;
    const d = Math.abs(k.time - cueStart);
    if (d <= maxDistanceSec && d < bestDist) {
      best = k;
      bestDist = d;
    }
  }
  if (!best) return null;
  return Math.abs(best.centerX - zones.speaker1X) <= Math.abs(best.centerX - zones.speaker2X)
    ? 'speaker1'
    : 'speaker2';
}

/**
 * Applies speaker-split anchoring to auto-generated cues: cues attributed to
 * the top-half speaker get position_y = SPEAKER1_POSITION_Y; bottom-half
 * speaker cues keep the default band (no explicit position). Returns the
 * input array unchanged when there is nothing to attribute. Pure: input cue
 * objects are not mutated.
 */
export function applySpeakerSplitToCues<T extends { start: number; position_x?: number; position_y?: number }>(
  cues: T[],
  keyframes: SpeakerSplitKeyframe[],
  zones: SpeakerSplitZones
): { cues: T[]; attributedTop: number } {
  if (!cues.length || !Array.isArray(keyframes) || keyframes.length === 0) {
    return { cues, attributedTop: 0 };
  }
  let attributedTop = 0;
  const out = cues.map((cue) => {
    // User/editor-placed cues (explicit position) are never moved.
    if (cue.position_x !== undefined || cue.position_y !== undefined) return cue;
    const speaker = attributeCueSpeaker(cue.start, keyframes, zones);
    if (speaker === 'speaker1') {
      attributedTop++;
      return { ...cue, position_y: SPEAKER1_POSITION_Y };
    }
    return cue;
  });
  return { cues: out, attributedTop };
}
