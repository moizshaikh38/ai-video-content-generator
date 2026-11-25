/** Programmatic seeks that only change which frame is PRESENTED while paused.
 * The transport (React playhead/timeRef) owns the playhead. presentSeek records the presentation
 * target the paused element sits on. While paused exactly on that target, a timeupdate is an echo of the
 * transport's own seek (queued, arbitrarily late) and must not write the playhead back.
 * Clock identity: the hook COMMITS the element's clock identity in a layout effect (commitPresentationClock),
 * which eagerly drops any held ownership when the identity changes (so A->B->A cannot revive it). Every writer
 * passes the identity its target was computed under; a writer with a KNOWN-STALE identity (defined, differs from the
 * committed one) is rejected: it neither seeks nor touches a newer owner. An undefined identity seeks without owning. Ownership is also dropped, never revived, by an off-target update, play,
 * a seek landing elsewhere, a source change, or a newer presentSeek. There is no time limit. */
const EPS = 1e-6;
export interface SeekableVideo { currentTime: number; paused: boolean }
interface Own { target: number; clock: string | undefined }
const owned = new WeakMap<object, Own>();
const clocks = new WeakMap<object, string>();
/** Commit-phase only (layout effect). Changing the identity eagerly invalidates ownership. */
export function commitPresentationClock(v: object, key: string): void {
  if (clocks.get(v) !== key) { clocks.set(v, key); owned.delete(v); }
}
export function getPresentationClock(v: object): string | undefined { return clocks.get(v); }
/** `clock` is the identity the target was computed under.
 * - equals the committed identity: seek and own it.
 * - known stale (defined, committed identity differs): REJECTED. Media and any newer owner are untouched. Returns false.
 * - unknown (undefined) or nothing committed yet: seek, but do not own it (the pre-existing behavior). */
export function presentSeek(v: SeekableVideo, time: number, clock: string | undefined): boolean {
  const committed = clocks.get(v);
  if (clock !== undefined && committed !== undefined && clock !== committed) return false;
  if (clock !== undefined && clock === committed) owned.set(v, { target: time, clock });
  else owned.delete(v);
  v.currentTime = time;
  return true;
}
function live(v: SeekableVideo): Own | undefined {
  const o = owned.get(v);
  if (o && o.clock !== clocks.get(v)) { owned.delete(v); return undefined; }
  return o;
}
export function isPausedOnPresentation(v: SeekableVideo): boolean {
  const o = live(v);
  return !!o && v.paused && Math.abs(v.currentTime - o.target) < EPS;
}
/** Call from timeupdate. True only while paused on the owned target; anything else drops ownership. */
export function consumePresentationEcho(v: SeekableVideo): boolean {
  if (!live(v)) return false;
  if (isPausedOnPresentation(v)) return true;
  owned.delete(v);
  return false;
}
export function clearPresentationSeek(v: SeekableVideo): void { owned.delete(v); }
/** 'seeking' handler: a seek that did not land on the owned target is not ours. */
export function onNativeSeeking(v: SeekableVideo): void {
  const o = live(v);
  if (o && Math.abs(v.currentTime - o.target) >= EPS) owned.delete(v);
}

/** Commit-owned snapshot: key and mapping inputs published together in one layout effect. */
export interface ClockSnapshot { key: string; slices: unknown; offset: number; time: number }
/** Present the frame for a snapshot: the target is computed from the snapshot's own inputs and stamped with its key. */
export function presentFromSnapshot(v: SeekableVideo, snap: ClockSnapshot, map: (slices: any, time: number, offset: number) => number): boolean {
  return presentSeek(v, map(snap.slices, snap.time, snap.offset), snap.key);
}
