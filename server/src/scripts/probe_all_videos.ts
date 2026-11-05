import path from 'node:path';
import ffmpeg from 'fluent-ffmpeg';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';

const probePath: string = (ffprobeStatic as any)?.path || String(ffprobeStatic);
if (probePath) {
  ffmpeg.setFfprobePath(probePath);
}

const files = [
  '../public/demo/creator-demo.mp4',
  '../public/demo/creator-studio-demo.mp4',
  '../public/demo/sample-video.mp4',
  '../public/demo/vireo-demo.mp4',
  '../delete/2.mp4',
  '../delete/video_20261011_011105.mp4',
  '../public/demo/showcase/v0.mp4',
  '../public/demo/showcase/v1.mp4',
  '../public/demo/showcase/v2.mp4',
  '../public/demo/showcase/v5.mp4',
  '../public/demo/showcase/v9.mp4',
];

async function probeAll() {
  console.log('Probing available video files...\n');
  for (const f of files) {
    const full = path.resolve(process.cwd(), f);
    await new Promise((resolve) => {
      ffmpeg.ffprobe(full, (err, meta) => {
        if (err) {
          console.log(path.basename(f), 'ERROR:', err.message);
          return resolve(null);
        }
        const vStream = meta.streams.find((s) => s.codec_type === 'video');
        const aStream = meta.streams.find((s) => s.codec_type === 'audio');
        console.log(path.basename(f), {
          duration: `${Number(meta.format.duration).toFixed(1)}s`,
          sizeMb: `${(Number(meta.format.size) / (1024 * 1024)).toFixed(2)} MB`,
          resolution: vStream ? `${vStream.width}x${vStream.height}` : 'no-video',
          fps: vStream ? vStream.r_frame_rate : 'none',
          audio: aStream ? `${aStream.codec_name} (${aStream.sample_rate}Hz, ${aStream.channels}ch)` : 'no-audio',
        });
        resolve(null);
      });
    });
  }
}

probeAll().catch(console.error);

