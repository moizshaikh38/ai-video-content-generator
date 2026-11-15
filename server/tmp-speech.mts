import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { ProEditorService } from './src/services/proEditorService';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string);
const ffprobeBin = (ffprobeStatic as unknown as { path: string }).path;
const SRC = '/tmp/loudnorm-2pass-fixtures/speech-9s.mp4';
const OUTDIR = '/tmp/loudnorm-2pass-fixtures';

function project() {
  return {
    user_id: 'speech-recon',
    canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration: 9 },
    tracks: [
      { type: 'VIDEO', name: 'Main', items: [
        { id: 's1', name: 's1', timeline_start: 0, timeline_end: 9, source_start: 0, source_end: 9, source_path: SRC,
          audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 } },
      ] },
    ],
  } as any;
}

async function render(graph: any, outPath: string, dur: number) {
  await execFileAsync(ffmpegBin, ['-y', '-v', 'error', ...graph.inputArgs,
    '-filter_complex', graph.filterComplex.join(';'),
    '-map', graph.videoMap, '-map', graph.audioMap,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-c:a', 'aac',
    '-t', String(dur), outPath], { timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
}

async function loudness(file: string): Promise<string> {
  const r = await execFileAsync(ffmpegBin, ['-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 }).catch(e => e);
  const tail = (r.stderr as string).split('Summary:').pop() || '';
  const i = tail.match(/I:\s+(-?[\d.]+) LUFS/);
  return i ? i[1] : 'NA';
}

async function streamDurs(file: string) {
  const { stdout } = await execFileAsync(ffprobeBin, ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', file]);
  const s = JSON.parse(stdout).streams;
  return { v: s.find((x: any) => x.codec_type === 'video')?.duration, a: s.find((x: any) => x.codec_type === 'audio')?.duration };
}

(async () => {
  const one = ProEditorService.compileRenderGraph(project(), SRC, `${OUTDIR}/speech-1pass.mp4`, OUTDIR);
  console.log('one-pass loudnorm segment:', one.filterComplex.find((s: string) => s.includes('loudnorm')));
  await render(one, `${OUTDIR}/speech-1pass.mp4`, 9);

  const two = await ProEditorService.compileRenderGraphWithNormalization(project(), SRC, `${OUTDIR}/speech-2pass.mp4`, OUTDIR);
  console.log('two-pass loudnorm segment:', two.filterComplex.find((s: string) => s.includes('loudnorm')));
  await render(two, `${OUTDIR}/speech-2pass.mp4`, 9);

  console.log('one-pass out: I =', await loudness(`${OUTDIR}/speech-1pass.mp4`), 'durs =', JSON.stringify(await streamDurs(`${OUTDIR}/speech-1pass.mp4`)));
  console.log('two-pass out: I =', await loudness(`${OUTDIR}/speech-2pass.mp4`), 'durs =', JSON.stringify(await streamDurs(`${OUTDIR}/speech-2pass.mp4`)));
})().catch((e) => { console.error('FAILED', e.message || e); process.exit(1); });
