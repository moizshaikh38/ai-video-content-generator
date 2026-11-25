import { getPresentationClock } from './presentationSeek';
import { settledTimelineTime, type PlaybackSlice } from './editorPlaybackTime';

export interface PauseSettleVideo { currentTime: number; paused: boolean; seeking: boolean; ended?: boolean }
/** Committed clock generation: key and mapping inputs published together (see ClockSnapshot). */
export interface PauseSettleCtx { key: string; slices: PlaybackSlice[]; offset: number; hint: number; duration: number }

/**
 * Single owner of the play-to-pause progress receipt. A receipt is published at most once per play run,
 * from the video's own time at the transition. A later or duplicate native pause event, or a pause on an
 * already presented (adjusted) frame, finds the run disarmed and publishes nothing.
 */
export class PauseSettle {
  private armed = false;
  /** Native play event: arm only if the video is really playing (a stale event after pause() must not arm). */
  onPlay(v: PauseSettleVideo): void { if (!v.paused) this.armed = true; }
  /** Toolbar pause(): wasPlaying is the video state read BEFORE v.pause(). Disarms either way. */
  onToolbarPause(v: PauseSettleVideo, wasPlaying: boolean, ctx: PauseSettleCtx | null): number | null {
    this.armed = false;
    return wasPlaying ? this.settle(v, ctx) : null;
  }
  /** Native pause event. */
  onNativePause(v: PauseSettleVideo, ctx: PauseSettleCtx | null): number | null {
    // Stale (old) pause event delivered after a resume: media is playing, so the current run is not ours to consume.
    if (!v.paused) return null;
    const was = this.armed; this.armed = false;
    return was ? this.settle(v, ctx) : null;
  }
  /** An explicit receipt owner (pauseForEdit) ended the run and published its own receipt: disarm, publish nothing here. */
  endRun(): void { this.armed = false; }
  /** Source lifecycle (emptied / loadstart): drop any armed run. */
  reset(): void { this.armed = false; }
  private settle(v: PauseSettleVideo, ctx: PauseSettleCtx | null): number | null {
    if (!ctx || v.ended) return null;
    // Committed generation only: a mapping the video's committed clock identity does not match is not used.
    if (getPresentationClock(v) !== ctx.key) return null;
    return settledTimelineTime(ctx.slices, v.currentTime, ctx.hint, ctx.offset, ctx.duration, v.seeking);
  }
}
