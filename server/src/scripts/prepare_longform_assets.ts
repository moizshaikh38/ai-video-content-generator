import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';

const ffPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic as any)?.path;
const outDir = path.resolve(process.cwd(), '../delete/longform');
fs.mkdirSync(outDir, { recursive: true });

const src1 = path.resolve(process.cwd(), '../public/demo/creator-studio-demo.mp4'); // 49.86s 1080p
const src2 = path.resolve(process.cwd(), '../public/demo/vireo-demo.mp4');          // 52.21s 480p
const src3 = path.resolve(process.cwd(), '../public/demo/creator-demo.mp4');        // 6.17s 480p

// Normalize intermediate clip to standard 1280x720 30fps AAC stereo
const norm1 = path.join(outDir, 'norm1.mp4');
const norm2 = path.join(outDir, 'norm2.mp4');

console.log('Preparing normalized 720p 30fps building blocks for long-form tests...');
if (!fs.existsSync(norm1)) {
  execSync(`"${ffPath}" -y -i "${src1}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -preset ultrafast -c:a aac -b:a 128k -ar 44100 -ac 2 "${norm1}"`, { stdio: 'inherit' });
}
if (!fs.existsSync(norm2)) {
  execSync(`"${ffPath}" -y -i "${src2}" -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -preset ultrafast -c:a aac -b:a 128k -ar 44100 -ac 2 "${norm2}"`, { stdio: 'inherit' });
}

// Target durations in seconds
const targets = [
  { name: 'longform_5m.mp4', durationSec: 300 },
  { name: 'longform_10m.mp4', durationSec: 600 },
  { name: 'longform_15m.mp4', durationSec: 900 },
  { name: 'longform_30m.mp4', durationSec: 1800 },
];

for (const t of targets) {
  const targetPath = path.join(outDir, t.name);
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1000000) {
    console.log(`Asset already exists: ${t.name} (${(fs.statSync(targetPath).size / 1024 / 1024).toFixed(2)} MB)`);
    continue;
  }
  console.log(`Generating ${t.name} (target duration: ${t.durationSec}s / ${(t.durationSec / 60).toFixed(0)} min)...`);
  // Use stream loop on alternating normalized real videos to achieve exact duration
  const cmd = `"${ffPath}" -y -stream_loop -1 -i "${norm1}" -t ${t.durationSec} -c:v copy -c:a copy "${targetPath}"`;
  execSync(cmd, { stdio: 'inherit' });
  const sizeMb = (fs.statSync(targetPath).size / 1024 / 1024).toFixed(2);
  console.log(`  -> Created ${t.name} (${sizeMb} MB)`);
}

console.log('All long-form assets prepared successfully.');

