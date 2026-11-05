import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import ffprobeStatic from 'ffprobe-static';
import ffmpegStatic from 'ffmpeg-static';

const execAsync = promisify(exec);
const ffprobeBin = (ffprobeStatic as unknown as { path: string }).path || 'ffprobe';
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '../../..');
const assetsDir = path.resolve(repoRoot, 'delete/4k60_assets');
const outDir = path.resolve(repoRoot, 'delete/recalculated_4k60');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const sourceFile = path.resolve(assetsDir, '4k60_5m.mp4');

async function probeMedia(filePath: string) {
  const { stdout } = await execAsync(
    `"${ffprobeBin}" -v error -select_streams v:0 -show_entries stream=nb_frames,duration,width,height,r_frame_rate -of json "${filePath}"`
  );
  const data = JSON.parse(stdout);
  const stream = data.streams[0];
  const frames = parseInt(stream.nb_frames || '0', 10);
  const duration = parseFloat(stream.duration || '0');
  const sizeBytes = fs.statSync(filePath).size;
  return { frames, duration, width: stream.width, height: stream.height, fps: stream.r_frame_rate, sizeBytes };
}

async function main() {
  console.log('========================================================================');
  console.log('VIREOCLIP — 5-MINUTE FULL-SOURCE 4K 60FPS SUSTAINED TRANSCODE BENCHMARK');
  console.log('========================================================================\n');

  console.log(`Probing input source: ${sourceFile}`);
  const inputProbe = await probeMedia(sourceFile);
  console.log(`Source duration: ${inputProbe.duration}s, frames: ${inputProbe.frames}, size: ${(inputProbe.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);

  // 1. Run QSV full transcode
  const qsvOut = path.resolve(outDir, 'full_qsv_4k60_5m.mp4');
  const qsvCmd = `"${ffmpegBin}" -y -init_hw_device qsv=hw -filter_hw_device hw -i "${sourceFile}" -vf "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920" -c:v h264_qsv -preset faster -global_quality 23 -r 60 -c:a aac -b:a 128k "${qsvOut}"`;
  console.log('\n[1/2] Starting Intel Arc 130T QSV Full-Source Transcode (300s, 18,000 frames)...');
  console.log(`Command: ${qsvCmd}`);

  const qsvStart = Date.now();
  await execAsync(qsvCmd);
  const qsvWallMs = Date.now() - qsvStart;
  const qsvWallSec = qsvWallMs / 1000;

  const qsvProbe = await probeMedia(qsvOut);
  const qsvSpeedMultiplier = Number((qsvProbe.duration / qsvWallSec).toFixed(2));
  console.log(`-> QSV Complete in ${qsvWallSec.toFixed(3)}s!`);
  console.log(`   Output Duration: ${qsvProbe.duration}s, Frames: ${qsvProbe.frames}, Size: ${(qsvProbe.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   QSV Speed Multiplier: ${qsvSpeedMultiplier}x real-time`);

  // 2. Run CPU libx264 full transcode
  const cpuOut = path.resolve(outDir, 'full_cpu_4k60_5m.mp4');
  const cpuCmd = `"${ffmpegBin}" -y -i "${sourceFile}" -vf "crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920" -c:v libx264 -preset faster -crf 22 -r 60 -c:a aac -b:a 128k "${cpuOut}"`;
  console.log('\n[2/2] Starting CPU libx264 Full-Source Transcode (300s, 18,000 frames)...');
  console.log(`Command: ${cpuCmd}`);

  const cpuStart = Date.now();
  await execAsync(cpuCmd);
  const cpuWallMs = Date.now() - cpuStart;
  const cpuWallSec = cpuWallMs / 1000;

  const cpuProbe = await probeMedia(cpuOut);
  const cpuSpeedMultiplier = Number((cpuProbe.duration / cpuWallSec).toFixed(2));
  console.log(`-> CPU Complete in ${cpuWallSec.toFixed(3)}s!`);
  console.log(`   Output Duration: ${cpuProbe.duration}s, Frames: ${cpuProbe.frames}, Size: ${(cpuProbe.sizeBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`   CPU Speed Multiplier: ${cpuSpeedMultiplier}x real-time`);

  const qsvSpeedupPercent = Number((((cpuWallMs - qsvWallMs) / cpuWallMs) * 100).toFixed(1));

  const result = {
    assetName: '4k60_5m.mp4',
    sourceDurationSec: inputProbe.duration,
    sourceFrames: inputProbe.frames,
    sourceSizeBytes: inputProbe.sizeBytes,
    mode: 'full_source',
    outputDurationSec: qsvProbe.duration,
    outputFrames: qsvProbe.frames,
    cpu: {
      command: cpuCmd,
      wallTimeMs: cpuWallMs,
      wallTimeSec: cpuWallSec,
      speedMultiplier: cpuSpeedMultiplier,
      outputSizeBytes: cpuProbe.sizeBytes,
    },
    qsv: {
      command: qsvCmd,
      wallTimeMs: qsvWallMs,
      wallTimeSec: qsvWallSec,
      speedMultiplier: qsvSpeedMultiplier,
      outputSizeBytes: qsvProbe.sizeBytes,
    },
    qsvSpeedupPercent,
  };

  const resultsPath = path.resolve(repoRoot, 'delete/recalculated_4k60_5m_full_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\nSaved 5m full transcode benchmark to ${resultsPath}`);
}

main().catch(err => {
  console.error('5m benchmark failed:', err);
  process.exit(1);
});
