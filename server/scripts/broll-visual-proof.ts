// One-off visual compositing proof: navy base + red B-roll overlay through the
// REAL compileRenderGraph path, frames extracted inside/outside the overlay
// window. Distinct solid colors make overlay correctness pixel-checkable,
// which the phase19 suite (same asset as base and b-roll) cannot show.
import { ProEditorService } from '../src/services/proEditorService.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

const project: any = {
  id: crypto.randomUUID(),
  user_id: crypto.randomUUID(),
  project_id: crypto.randomUUID(),
  clip_id: crypto.randomUUID(),
  version: 1,
  status: 'draft',
  title: 'broll visual proof',
  canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: 3.5, background_color: '#000000', background_mode: 'color' },
  tracks: [
    {
      id: 't-base', type: 'VIDEO', name: 'Main Video', locked: false, muted: false, hidden: false, height: 64,
      items: [{
        id: 'i-base', track_id: 't-base', type: 'VIDEO', source_path: '/tmp/broll-proof/base-navy.mp4',
        timeline_start: 0, timeline_end: 3.5, source_start: 0, source_end: 3.5,
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
        speed: { speed: 1.0, pitch_preserved: true },
        audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 },
        effects: [], keyframes: [], locked: false, muted: false, hidden: false, z_index: 0,
      }],
    },
    {
      id: 't-broll', type: 'VIDEO', name: 'B-Roll Layer', locked: false, muted: false, hidden: false, height: 64,
      items: [{
        id: 'i-broll', track_id: 't-broll', type: 'VIDEO', source_path: '/tmp/broll-proof/broll-red.mp4',
        timeline_start: 1.0, timeline_end: 3.0, source_start: 5.0, source_end: 7.0,
        transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
        crop: { mode: 'fill', focusX: 0.5, focusY: 0.5 },
        speed: { speed: 1.0, pitch_preserved: true },
        effects: [], keyframes: [], locked: false, muted: true, hidden: false, z_index: 5,
      }],
    },
  ],
  created_at: new Date(), updated_at: new Date(),
};

const graph = ProEditorService.compileRenderGraph(project, '/tmp/broll-proof/base-navy.mp4', '/tmp/broll-proof/out.mp4', '/tmp/broll-proof');
const hasOverlay = graph.filterComplex.some((f: string) => f.includes('overlay'));
console.log('overlay node present:', hasOverlay);
await execFileAsync(ffmpegBin, ['-y', ...graph.inputArgs, '-filter_complex', graph.filterComplex.join(';'), '-map', graph.videoMap, '-map', graph.audioMap, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac', '-t', '3.5', '/tmp/broll-proof/out.mp4']);
for (const t of ['0.5', '1.5', '2.5']) {
  await execFileAsync(ffmpegBin, ['-y', '-ss', t, '-i', '/tmp/broll-proof/out.mp4', '-frames:v', '1', `/downloads/vireo-realmedia/broll-proof-t${t}.jpg`]);
}
console.log('render + frames done');
