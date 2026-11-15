import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { ProEditorService } from './src/services/proEditorService';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string);
const ffprobeBin = (ffprobeStatic as unknown as { path: string }).path;
const MAIN = '/tmp/loudnorm-2pass-fixtures/ts2-mod-small.mp4';
const BROLL = '/tmp/loudnorm-2pass-fixtures/broll-red.mp4';
const OUTDIR = '/tmp/loudnorm-2pass-fixtures';

// Mirrors brollPlanService.ts:158-180: secondary track inserted as type VIDEO.
const project = {
  user_id: 'vtrack-recon',
  canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: 4 },
  tracks: [
    { type: 'VIDEO', name: 'Main', items: [
      { id: 'm1', name: 'm1', timeline_start: 0, timeline_end: 2, source_start: 0, source_end: 2, source_path: MAIN,
        audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 } },
      { id: 'm2', name: 'm2', timeline_start: 2, timeline_end: 4, source_start: 2, source_end: 4, source_path: MAIN,
        audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 } },
    ] },
    { type: 'VIDEO', name: 'B-Roll Layer', items: [
      { id: 'b1', name: 'b1', timeline_start: 1.0, timeline_end: 3.0, source_start: 5.0, source_end: 7.0, source_path: BROLL,
        audio: { volume: 0.0, fade_in: 0, fade_out: 0 } },
    ] },
  ],
} as any;

(async () => {
  const graph = await ProEditorService.compileRenderGraphWithNormalization(project, MAIN, `${OUTDIR}/vtrack-out.mp4`, OUTDIR);
  console.log('filter_complex:', graph.filterComplex.join(';'));
  await execFileAsync(ffmpegBin, ['-y', '-v', 'error', ...graph.inputArgs,
    '-filter_complex', graph.filterComplex.join(';'),
    '-map', graph.videoMap, '-map', graph.audioMap,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac',
    '-t', '4', `${OUTDIR}/vtrack-out.mp4`], { timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
  const { stdout } = await execFileAsync(ffprobeBin, ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'csv=p=0', `${OUTDIR}/vtrack-out.mp4`]);
  console.log('output stream durations:', stdout.trim().replace(/\n/g, ' '));
  console.log('RENDER_OK');
})().catch((e) => { console.error('FAILED', (e.message || e).slice(0, 600)); process.exit(1); });
