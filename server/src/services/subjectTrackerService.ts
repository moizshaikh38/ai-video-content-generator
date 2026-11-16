import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { dataRepository } from '../db/repositories/dataRepository.js';
import { downloadObjectToFile } from './objectStorageService.js';
import { SmartReframeService } from './smartReframeService.js';
import { logger } from '../utils/logger.js';

export interface SubjectTrackRequest {
  refTime: number;
  box: { x: number; y: number; w: number; h: number };
  startSec?: number;
  endSec?: number;
}
export interface SubjectTrackResult {
  source_width: number;
  source_height: number;
  keyframes: Array<{ time: number; centerX: number; centerY: number; w?: number; h?: number; confidence?: number }>;
  tracked_from: number;
  tracked_to: number;
  lost_after: number | null;
  lost_before: number | null;
}

const num = (v: unknown, d = NaN) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Validates a client request. Returns a clean payload or throws a coded error. */
export function validateTrackRequest(body: any): SubjectTrackRequest {
  const bad = (m: string) => { const e = new Error(m); (e as any).code = 'INVALID_PAYLOAD'; return e; };
  const b = body?.box;
  const refTime = num(body?.refTime);
  if (!Number.isFinite(refTime) || refTime < 0) throw bad('refTime must be a non-negative number.');
  if (!b || ![b.x, b.y, b.w, b.h].every((v: unknown) => typeof v === 'number' && Number.isFinite(v))) throw bad('box {x,y,w,h} is required.');
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  const x = clamp01(b.x), y = clamp01(b.y);
  const w = Math.min(1 - x, Math.max(0.01, b.w)), h = Math.min(1 - y, Math.max(0.01, b.h));
  if (w < 0.01 || h < 0.01) throw bad('box is empty.');
  const startSec = Math.max(0, num(body?.startSec, 0));
  const endSec = num(body?.endSec, startSec + 120);
  if (endSec <= startSec) throw bad('endSec must be after startSec.');
  return { refTime, box: { x, y, w, h }, startSec, endSec: Math.min(endSec, startSec + 180) };
}

export class SubjectTrackerService {
  static async trackForClip(clipId: string, userId: string, req: SubjectTrackRequest): Promise<SubjectTrackResult> {
    const { data: clip } = await dataRepository.from('clips').select('*').eq('id', clipId).maybeSingle();
    if (!clip) { const e = new Error('Clip not found.'); (e as any).code = 'CLIP_NOT_FOUND'; throw e; }
    if ((clip as any).user_id !== userId) { const e = new Error('Access denied.'); (e as any).code = 'ACCESS_DENIED'; throw e; }
    if (!(clip as any).source_storage_path) { const e = new Error('Clip has no source video.'); (e as any).code = 'SOURCE_VIDEO_NOT_FOUND'; throw e; }
    const tempDir = path.join(os.tmpdir(), `vireo-track-${clipId}-${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
    try {
      fs.mkdirSync(tempDir, { recursive: true });
      const local = path.join(tempDir, 'source.mp4');
      await downloadObjectToFile('source', (clip as any).source_storage_path, local);
      return await SubjectTrackerService.runScript(local, req);
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }

  static runScript(videoPath: string, req: SubjectTrackRequest, timeoutMs = 120000): Promise<SubjectTrackResult> {
    const candidates = [
      path.resolve(process.cwd(), 'server/python/track_subject.py'),
      path.resolve(process.cwd(), 'python/track_subject.py'),
      path.resolve(process.cwd(), '../server/python/track_subject.py'),
    ];
    const script = candidates.find((s) => fs.existsSync(s));
    if (!script) { const e = new Error('Subject tracker script not found.'); (e as any).code = 'SCRIPT_NOT_FOUND'; return Promise.reject(e); }
    return new Promise((resolve, reject) => {
      const child = spawn(SmartReframeService.getPythonPath(), [script], { stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      const timer = setTimeout(() => { child.kill('SIGKILL'); const e = new Error('Subject tracking timed out.'); (e as any).code = 'TRACK_TIMEOUT'; reject(e); }, timeoutMs);
      child.stdout.on('data', (d) => { out += d; });
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', (e) => { clearTimeout(timer); reject(e); });
      child.on('close', () => {
        clearTimeout(timer);
        try {
          const parsed = JSON.parse(out.trim().split('\n').pop() || '{}');
          if (parsed.status !== 'ok') { logger.warn('[SubjectTracker] failed', { err, parsed }); const e = new Error(parsed.error_message || 'Subject tracking failed.'); (e as any).code = 'TRACK_FAILED'; return reject(e); }
          resolve(parsed as SubjectTrackResult);
        } catch (e: any) { reject(new Error(`Subject tracker output unreadable: ${e.message}`)); }
      });
      child.stdin.end(JSON.stringify({ videoPath, refTime: req.refTime, box: req.box, startSec: req.startSec, endSec: req.endSec }));
    });
  }
}
