import { execFile } from 'child_process';
import { promisify } from 'util';
import ffmpegStatic from 'ffmpeg-static';
import { ProEditorService } from './src/services/proEditorService';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string);
const MOD = '/tmp/loudnorm-2pass-fixtures/modulated-small.mp4';
const BROLL = '/tmp/loudnorm-2pass-fixtures/broll-small.mp4';
const OUTDIR = '/tmp/loudnorm-2pass-fixtures';

function buildProject(duration: number) {
  return {
    user_id: 'recon',
    canvas: { width: 1080, height: 1920, aspect_ratio: '9:16', fps: 30, duration },
    tracks: [
      {
        type: 'VIDEO', name: 'Main',
        items: [
          { id: 'slice-1', name: 'slice-1', timeline_start: 0, timeline_end: 3.5, source_start: 0, source_end: 3.5, source_path: MOD,
            audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 } },
          { id: 'slice-2', name: 'slice-2', timeline_start: 3.5, timeline_end: 5.5, source_start: 5.0, source_end: 7.0, source_path: MOD,
            audio: { volume: 1.0, fade_in: 0.1, fade_out: 0.1, normalized: true, target_lufs: -16 } },
        ],
      },
      {
        type: 'OVERLAY', name: 'B-Roll',
        items: [
          { id: 'broll-1', name: 'broll-1', timeline_start: 1.0, timeline_end: 3.0, source_start: 5.0, source_end: 7.0, source_path: BROLL,
            audio: { volume: 0.0, fade_in: 0, fade_out: 0 } },
        ],
      },
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
  const { stderr } = await execFileAsync(ffmpegBin, ['-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { maxBuffer: 64 * 1024 * 1024 }).catch(e => e);
  const m = (stderr as string).match(/I:\s+(-?\d+\.\d+) LUFS[\s\S]*?$/);
  const tail = (stderr as string).split('Summary:').pop() || '';
  const i = tail.match(/I:\s+(-?[\d.]+) LUFS/);
  return i ? i[1] : 'NA';
}

async function dur(file: string): Promise<string> {
  const { stdout } = await execFileAsync(ffmpegBin.replace('ffmpeg', 'ffprobe'), ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).catch(() => ({ stdout: 'NA' } as any));
  return (stdout as string).trim();
}

(async () => {
  // A: same project as the reported test (canvas 3.5), inspect measured values
  const g35 = await ProEditorService.compileRenderGraphWithNormalization(buildProject(3.5), MOD, `${OUTDIR}/recon-35.mp4`, OUTDIR);
  const seg35 = g35.filterComplex.find((s: string) => s.includes('loudnorm'));
  console.log('A graph(3.5) loudnorm segment:', seg35);
  console.log('A graph(3.5) duration field:', (g35 as any).duration);
  await render(g35, `${OUTDIR}/recon-35.mp4`, 3.5);
  console.log('A out(-t 3.5): I =', await loudness(`${OUTDIR}/recon-35.mp4`), 'dur =', await dur(`${OUTDIR}/recon-35.mp4`));
  await render(g35, `${OUTDIR}/recon-35-full.mp4`, 5.5);
  console.log('A out(-t 5.5): I =', await loudness(`${OUTDIR}/recon-35-full.mp4`), 'dur =', await dur(`${OUTDIR}/recon-35-full.mp4`));

  // B: canvas duration 5.5 (full window), render full
  const g55 = await ProEditorService.compileRenderGraphWithNormalization(buildProject(5.5), MOD, `${OUTDIR}/recon-55.mp4`, OUTDIR);
  const seg55 = g55.filterComplex.find((s: string) => s.includes('loudnorm'));
  console.log('B graph(5.5) loudnorm segment:', seg55);
  await render(g55, `${OUTDIR}/recon-55.mp4`, 5.5);
  console.log('B out(-t 5.5): I =', await loudness(`${OUTDIR}/recon-55.mp4`), 'dur =', await dur(`${OUTDIR}/recon-55.mp4`));
})().catch((e) => { console.error('FAILED', e.message || e); process.exit(1); });
