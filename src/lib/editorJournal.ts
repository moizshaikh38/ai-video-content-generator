import { useSyncExternalStore } from 'react';
import { EDITOR_RESOURCE_LIMITS, type EditorProject } from '../types';

// Durable local journal of the latest ACCEPTED, not-yet-acknowledged snapshot of an editor session.
// One storage key per (user, clip, project, session): sessions never read-modify-write a shared value, so concurrent tabs
// cannot overwrite each other. Records from other sessions are never evicted or cleared here. No media or credentials.
const PREFIX = 'vireo.editorJournal.v2:';
const QPREFIX = 'vireo.editorJournalQuarantine.v2:';
const MAX_RECORDS = 6;
const MAX_QUARANTINE = 12;
const MAX_BYTES = 1_500_000;

export interface JournalData { title: string; canvas: EditorProject['canvas']; tracks: EditorProject['tracks']; playhead: number; settings: EditorProject['settings'] }
export interface JournalRecord {
  session: string;
  /** Generation of the latest snapshot stored in `data`. */
  generation: number;
  /** Verified server revision this snapshot was built on. */
  baseVersion: number;
  /** Project acknowledgement metadata of one SENT request. It describes that generation only, never the latest snapshot. */
  projectAck: { generation: number; version: number } | null;
  savedAt: number;
  data: JournalData;
}
/** 'project-acked' only when the stored snapshot IS the payload the project ack covered. */
export const journalStage = (r: JournalRecord): 'local' | 'project-acked' => (r.projectAck && r.projectAck.generation === r.generation ? 'project-acked' : 'local');
interface JournalFile { v: 2; user: string; clip: string; project: string; record: JournalRecord }
type Scope = Pick<EditorProject, 'user_id' | 'clip_id' | 'id'>;
export type JournalFailure = 'unavailable' | 'too-large' | 'full' | 'invalid' | 'quarantine' | 'ack-write' | 'clear' | 'read';
export type JournalResult = { ok: true } | { ok: false; reason: JournalFailure };

const scopeId = (p: Scope) => `${p.user_id}:${p.clip_id}:${p.id}`;
const scopePrefix = (p: Scope) => `${PREFIX}${scopeId(p)}:`;
export const journalKey = (p: Scope, session: string) => `${scopePrefix(p)}${session}`;

// Visible state, keyed per scope+session, so one editor's success cannot clear another's failure.
const issues = new Map<string, string>();
const listeners = new Set<() => void>();
const emit = () => { cachedSnapshot.clear(); listeners.forEach((l) => l()); };
const cachedSnapshot = new Map<string, string | null>();
const ISSUE_TEXT: Record<JournalFailure, string> = {
  unavailable: 'A local backup of unsaved changes could not be kept on this device. Your changes are only safe once they show Saved.',
  'too-large': 'These changes are too large to back up on this device. They are only safe once they show Saved.',
  full: 'Too many earlier unsaved backups are waiting on this device. Your newest changes are only safe once they show Saved.',
  invalid: 'A local backup of unsaved changes could not be kept. Your changes are only safe once they show Saved.',
  quarantine: 'An earlier unreadable backup could not be set aside, so no new backup was written. Your changes are only safe once they show Saved.',
  'ack-write': 'The local backup could not be updated after a partial save. Your changes are only safe once they show Saved.',
  read: 'The local backup on this device could not be read, so no new backup was written. Your changes are only safe once they show Saved.',
  clear: 'An old local backup could not be removed from this device. It will be offered again later.',
};
function setIssue(p: Scope, session: string, reason: JournalFailure | null) {
  const k = `${scopeId(p)}:${session}`;
  if (reason === null) { if (issues.delete(k)) emit(); return; }
  if (issues.get(k) !== ISSUE_TEXT[reason]) { issues.set(k, ISSUE_TEXT[reason]); emit(); }
}
/** Warning text for any session in this user+clip+project scope. */
export function useJournalIssue(p: Scope | null | undefined): string | null {
  const prefix = p ? `${scopeId(p)}:` : null;
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => { if (!prefix) return null; for (const [k, v] of issues) if (k.startsWith(prefix)) return v; return null; },
    () => null,
  );
}

const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const int = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
const plain = (o: unknown) => !!o && typeof o === 'object' && !Array.isArray(o);
const byteLen = (s: string) => { try { return new TextEncoder().encode(s).length; } catch { return s.length * 3; } };
const CANVAS_KEYS = new Set(['width','height','aspect_ratio','fps','duration','background_color','background_mode','background_spacing','background_corner_radius','background_user_choice','fit_band']);
const SETTINGS_KEYS = ['snapping', 'safe_guides', 'snap_tolerance_sec', 'show_safe_zones'];
const TRACK_KEYS = new Set(['caption_emoji','id','type','name','locked','muted','hidden','solo','height','items']);
const MAX_NODES = 200000, MAX_DEPTH = 24; // generous: raw bytes are already capped, so legitimate complex projects are preserved
/** JSON-only value check: no functions/undefined/NaN, bounded depth and node count. */
function jsonBounded(v: unknown, budget: { n: number }, depth = 0): boolean {
  if (++budget.n > MAX_NODES || depth > MAX_DEPTH) return false;
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return true;
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every((x) => jsonBounded(x, budget, depth + 1));
  if (plain(v)) return Object.values(v as object).every((x) => jsonBounded(x, budget, depth + 1));
  return false;
}
const str = (v: unknown, max = 2000) => typeof v === 'string' && v.length <= max;
const pos = (v: unknown, max: number) => num(v) && v > 0 && v <= max;
function validCanvas(c: any): boolean {
  if (!plain(c) || !Object.keys(c).every((k) => CANVAS_KEYS.has(k))) return false;
  if (!pos(c.width, 10000) || !pos(c.height, 10000) || !pos(c.fps, 240) || !num(c.duration) || c.duration < 0 || c.duration > 3600) return false;
  if (!str(c.aspect_ratio, 20) || !str(c.background_color, 100) || !['color', 'blur_source', 'transparent'].includes(c.background_mode)) return false;
  if (c.background_spacing !== undefined && !num(c.background_spacing)) return false;
  if (c.background_corner_radius !== undefined && !num(c.background_corner_radius)) return false;
  if (c.background_user_choice !== undefined && !['blur', 'color'].includes(c.background_user_choice)) return false;
  if (c.fit_band !== undefined && !['4:3', 'full'].includes(c.fit_band)) return false;
  return true;
}
function validSettings(s: any): boolean {
  if (!plain(s) || Object.keys(s).length !== SETTINGS_KEYS.length) return false;
  return typeof s.snapping === 'boolean' && typeof s.safe_guides === 'boolean' && typeof s.show_safe_zones === 'boolean' && num(s.snap_tolerance_sec) && s.snap_tolerance_sec >= 0 && s.snap_tolerance_sec <= 10;
}
function validTracks(t: any): boolean {
  if (!Array.isArray(t) || t.length > EDITOR_RESOURCE_LIMITS.MAX_TRACKS) return false;
  let items = 0;
  for (const tr of t) {
    if (!plain(tr) || !Object.keys(tr).every((k) => TRACK_KEYS.has(k))) return false;
    if (!str(tr.id, 200) || !str(tr.type, 50) || !str(tr.name, 500) || typeof tr.locked !== 'boolean' || typeof tr.muted !== 'boolean' || typeof tr.hidden !== 'boolean') return false;
    if (tr.solo !== undefined && typeof tr.solo !== 'boolean') return false;
    if (tr.height !== undefined && !num(tr.height)) return false;
    if (!Array.isArray(tr.items)) return false;
    items += tr.items.length;
    if (items > EDITOR_RESOURCE_LIMITS.MAX_TIMELINE_ITEMS) return false;
    if (!tr.items.every((it: any) => plain(it) && str(it.id, 200) && str(it.type, 50))) return false;
  }
  return true;
}
/** Strict structural check (known shapes only). NOT an admission rule: drafts failing it are still preserved verbatim, just never offered for restore. */
export function journalStructure(d: JournalData): 'known-shape' | 'unchecked' {
  return str(d.title, 2000) && validCanvas(d.canvas) && validTracks(d.tracks) && validSettings(d.settings) && d.playhead >= 0 && d.playhead <= 3600 ? 'known-shape' : 'unchecked';
}
/** Loose admission: a draft is preserved verbatim if it is bounded JSON of the right overall shape. Never rewritten, never fields dropped. */
/** Drop object keys whose value is exactly undefined. JSON.stringify (and so the network save) drops them too, so the stored draft equals what a save would send. Everything else (NaN, functions, bigint...) is left for the checks below to reject. Bounded depth. */
function dropUndefined(v: any, depth = 0): any {
  if (depth > 24 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => dropUndefined(x, depth + 1));
  if (Object.getPrototypeOf(v) !== Object.prototype) return v;
  const o: any = {};
  for (const k of Object.keys(v)) if (v[k] !== undefined) Object.defineProperty(o, k, { value: dropUndefined(v[k], depth + 1), enumerable: true, writable: true, configurable: true });
  return o;
}
function pickData(raw: any): JournalData | null {
  const p = raw && typeof raw === 'object' ? { ...raw, canvas: dropUndefined(raw.canvas), tracks: dropUndefined(raw.tracks), settings: dropUndefined(raw.settings) } : raw;
  if (!p || !str(p.title, 100000) || !plain(p.canvas) || !plain(p.settings) || !Array.isArray(p.tracks) || p.tracks.length > EDITOR_RESOURCE_LIMITS.MAX_TRACKS || !p.tracks.every(plain)) return null;
  if (!num(p.playhead) || p.playhead < 0) return null;
  if (!jsonBounded({ c: p.canvas, t: p.tracks, s: p.settings }, { n: 0 })) return null;
  return { title: p.title, canvas: p.canvas, tracks: p.tracks, playhead: p.playhead, settings: p.settings };
}
function validRecord(r: any): r is JournalRecord {
  if (!r || typeof r.session !== 'string' || !r.session || !int(r.generation) || r.generation < 1 || !int(r.baseVersion) || !num(r.savedAt) || !pickData(r.data)) return false;
  if (r.projectAck !== null) {
    if (!plain(r.projectAck) || !int(r.projectAck.generation) || r.projectAck.generation < 1 || r.projectAck.generation > r.generation || !int(r.projectAck.version) || r.projectAck.version < 1) return false;
    if (r.projectAck.generation === r.generation && r.projectAck.version < r.baseVersion) return false;
  }
  return true;
}
function quarantine(key: string, raw: string): boolean {
  try {
    const ls = window.localStorage;
    if (storageKeys(QPREFIX).length >= MAX_QUARANTINE) return false;
    ls.setItem(`${QPREFIX}${Date.now()}:${key.slice(PREFIX.length)}`, raw);
    ls.removeItem(key);
    return true;
  } catch { return false; }
}
type ReadResult = { kind: 'error' } | { kind: 'absent' } | { kind: 'ok'; record: JournalRecord } | { kind: 'invalid'; raw: string };
function readKey(key: string, p: Scope): ReadResult {
  let raw: string | null;
  try { raw = window.localStorage.getItem(key); } catch { return { kind: 'error' }; }
  if (raw === null) return { kind: 'absent' };
  if (byteLen(raw) > MAX_BYTES + 4096) return { kind: 'invalid', raw };
  try {
    const f = JSON.parse(raw);
    if (!f || f.v !== 2 || f.user !== p.user_id || f.clip !== p.clip_id || f.project !== p.id || !validRecord(f.record) || key !== journalKey(p, f.record.session)) return { kind: 'invalid', raw };
    return { kind: 'ok', record: { ...f.record, data: pickData(f.record.data)! } };
  } catch { return { kind: 'invalid', raw }; }
}
function storageKeys(prefix: string): string[] {
  const out: string[] = [];
  try { const ls = window.localStorage; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(prefix)) out.push(k); } } catch { /* unavailable */ }
  return out;
}
function putRecord(p: Scope, rec: JournalRecord): JournalResult {
  try {
    const raw = JSON.stringify({ v: 2, user: p.user_id, clip: p.clip_id, project: p.id, record: rec } satisfies JournalFile);
    if (byteLen(raw) > MAX_BYTES) return { ok: false, reason: 'too-large' };
    window.localStorage.setItem(journalKey(p, rec.session), raw);
    return { ok: true };
  } catch { return { ok: false, reason: 'unavailable' }; }
}

/** Idempotent per (session, generation). Replaces this session's own record only; never touches another session's. */
export function journalWrite(p: EditorProject, o: { session: string; generation: number }): JournalResult {
  const fail = (reason: JournalFailure): JournalResult => { setIssue(p, o.session, reason); return { ok: false, reason }; };
  const data = pickData(p);
  if (!data || !p.id || !p.clip_id || !p.user_id || !int(p.version) || !int(o.generation) || o.generation < 1 || !o.session) return fail('invalid');
  const key = journalKey(p, o.session);
  const existing = readKey(key, p);
  let own: JournalRecord | null = null;
  if (existing.kind === 'error') return fail('read');
  if (existing.kind === 'invalid') { if (!quarantine(key, existing.raw)) return fail('quarantine'); }
  else if (existing.kind === 'ok') own = existing.record;
  if (own && own.generation > o.generation) return { ok: true };
  if (!own && storageKeys(scopePrefix(p)).length >= MAX_RECORDS) return fail('full');
  const rec: JournalRecord = { session: o.session, generation: o.generation, baseVersion: p.version, projectAck: own?.projectAck ?? null, savedAt: Date.now(), data };
  const res = putRecord(p, rec);
  if (!res.ok) return fail(res.reason);
  setIssue(p, o.session, null);
  return res;
}
/** Record the project acknowledgement of one sent generation, without altering the snapshot or its base version. */
export function journalMarkProjectAcked(p: Scope, session: string, sentGeneration: number, ackedVersion: number): JournalResult {
  const r = readKey(journalKey(p, session), p);
  if (r.kind === 'absent') return { ok: true };
  if (r.kind !== 'ok') { setIssue(p, session, 'ack-write'); return { ok: false, reason: 'ack-write' }; }
  if (r.record.projectAck && r.record.projectAck.generation > sentGeneration) return { ok: true };
  const res = putRecord(p, { ...r.record, projectAck: { generation: sentGeneration, version: ackedVersion } });
  if (!res.ok) { setIssue(p, session, 'ack-write'); return { ok: false, reason: 'ack-write' }; }
  return res;
}
/** Remove only this session's record, only when its snapshot is not newer than the fully acknowledged generation. */
export function journalClear(p: Scope, session: string, ackedGeneration: number): JournalResult {
  const key = journalKey(p, session);
  const r = readKey(key, p);
  if (r.kind === 'absent') return { ok: true };
  if (r.kind !== 'ok') { setIssue(p, session, 'clear'); return { ok: false, reason: 'clear' }; }
  if (r.record.generation > ackedGeneration) return { ok: true };
  try { window.localStorage.removeItem(key); setIssue(p, session, null); return { ok: true }; }
  catch { setIssue(p, session, 'clear'); return { ok: false, reason: 'clear' }; }
}
/** Valid records for a scope. Invalid bytes are set aside, never silently dropped. Use journalListChecked to tell "no draft" from "could not read". */
export function journalList(p: Scope): JournalRecord[] { return journalListChecked(p).records; }
export type JournalListResult = { records: JournalRecord[]; failure: 'read' | 'quarantine' | null; quarantined: number };
export function journalListChecked(p: Scope): JournalListResult {
  const records: JournalRecord[] = [];
  let failure: JournalListResult['failure'] = null, quarantined = 0;
  let keys: string[] = [];
  try { const ls = window.localStorage; for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(scopePrefix(p))) keys.push(k); } } catch { return { records, failure: 'read', quarantined }; }
  for (const k of keys) {
    const r = readKey(k, p);
    if (r.kind === 'ok') records.push(r.record);
    else if (r.kind === 'error') failure = failure ?? 'read';
    else if (r.kind === 'invalid') { if (quarantine(k, r.raw)) quarantined++; else failure = 'quarantine'; }
  }
  return { records, failure, quarantined };
}
export function journalQuarantineCount(): number { return storageKeys(QPREFIX).length; }

export function newJournalSession(): string {
  try { if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID(); } catch { /* fall through */ }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
