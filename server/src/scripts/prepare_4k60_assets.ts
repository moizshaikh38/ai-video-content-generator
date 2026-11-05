import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';

const ffPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic as any)?.path;
const outDir = path.resolve(process.cwd(), '../delete/4k60_assets');
fs.mkdirSync(outDir, { recursive: true });

const src4k = path.resolve(process.cwd(), '../delete/video_20261011_011105.mp4'); // 3840x2160 HEVC 22.43s

console.log('Preparing 4K 60fps building block...');
const base4k60 = path.join(outDir, 'base_4k60.mp4');
if (!fs.existsSync(base4k60)) {
  // Transcode to genuine 4K 60fps H.264
  console.log('Encoding base_4k60.mp4 from 4K source with fps=60 filter...');
  const cmd = `"${ffPath}" -y -i "${src4k}" -t 15 -vf "fps=60" -c:v libx264 -preset ultrafast -crf 22 -c:a aac -b:a 128k "${base4k60}"`;
  execSync(cmd, { stdio: 'inherit' });
}

const targets = [
  { name: '4k60_30s.mp4', durationSec: 30 },
  { name: '4k60_1m.mp4', durationSec: 60 },
  { name: '4k60_3m.mp4', durationSec: 180 },
  { name: '4k60_5m.mp4', durationSec: 300 },
];

for (const t of targets) {
  const targetPath = path.join(outDir, t.name);
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000000) {
    console.log(`Asset already exists: ${t.name} (${(fs.statSync(targetPath).size / 1024 / 1024).toFixed(2)} MB)`);
    continue;
  }
  console.log(`Generating ${t.name} (${t.durationSec}s at 4K 60fps)...`);
  const cmd = `"${ffPath}" -y -stream_loop -1 -i "${base4k60}" -t ${t.durationSec} -c:v copy -c:a copy "${targetPath}"`;
  execSync(cmd, { stdio: 'inherit' });
  const sizeMb = (fs.statSync(targetPath).size / 1024 / 1024).toFixed(2);
  console.log(`  -> Created ${t.name} (${sizeMb} MB)`);
}

console.log('All 4K 60fps assets prepared successfully.');

