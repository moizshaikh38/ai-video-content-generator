import fs from 'fs';
import path from 'path';
// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import ffmpeg from 'fluent-ffmpeg';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
const probeBinary = (ffprobeStatic as any)?.path || (ffprobeStatic as any)?.default?.path || ffprobeStatic;
if (probeBinary && typeof probeBinary === 'string') {
  ffmpeg.setFfprobePath(probeBinary);
}

function probeVideo(file: string): Promise<any> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(file, (err, meta) => {
      if (err) return resolve({ file, error: err.message });
      const v = meta.streams.find((s) => s.codec_type === 'video');
      const a = meta.streams.find((s) => s.codec_type === 'audio');
      resolve({
        file: path.basename(file),
        fullPath: file,
        sizeMb: (fs.statSync(file).size / 1024 / 1024).toFixed(2),
        durationSec: parseFloat(meta.format.duration?.toString() || '0').toFixed(2),
        resolution: v ? `${v.width}x${v.height}` : 'none',
        fps: v ? eval(v.r_frame_rate || '0') : 0,
        videoCodec: v ? v.codec_name : 'none',
        audioCodec: a ? a.codec_name : 'none',
        audioChannels: a ? a.channels : 0,
        sampleRate: a ? a.sample_rate : 0,
      });
    });
  });
}

async function findVideos() {
  const root = path.resolve(process.cwd(), '..');
  const candidates: string[] = [];

  function search(dir: string, depth = 0) {
    if (depth > 4) return;
    if (dir.includes('node_modules') || dir.includes('.git')) return;
    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          search(full, depth + 1);
        } else if (/\.(mp4|mov|mkv|webm|m4v)$/i.test(item)) {
          candidates.push(full);
        }
      }
    } catch (e) {}
  }

  search(root);

  console.log(`Found ${candidates.length} video assets in workspace:`);
  for (const c of candidates) {
    const p = await probeVideo(c);
    console.log(JSON.stringify(p));
  }
}

findVideos().catch(console.error);
