import fs from 'fs';
import path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';

interface BenchmarkRecord {
  assetName: string;
  sourceDurationSec: number;
  sourceFrames: number;
  sourceSizeBytes: number;
  mode: '15s_clip' | 'full_source';
  outputDurationSec: number;
  outputFrames: number;
  cpu: {
    command: string;
    wallTimeMs: number;
    wallTimeSec: number;
    speedMultiplier: number;
    outputSizeBytes: number;
  };
  qsv: {
    command: string;
    wallTimeMs: number;
    wallTimeSec: number;
    speedMultiplier: number;
    outputSizeBytes: number;
  };
  qsvSpeedupPercent: number;
}

async function runRecalculation() {
  console.log('========================================================================');
  console.log('VIREOCLIP — 4K 60FPS BENCHMARK RECALCULATION & FULL SOURCE VERIFICATION');
  console.log('========================================================================\n');

  const assets = [
    { name: '4k60_30s.mp4', duration: 30, frames: 1800 },
    { name: '4k60_1m.mp4', duration: 60, frames: 3600 },
    { name: '4k60_3m.mp4', duration: 180, frames: 10800 },
    { name: '4k60_5m.mp4', duration: 300, frames: 18000 },
  ];

  const results: BenchmarkRecord[] = [];
  const outDir = path.resolve(process.cwd(), '../delete/recalculated_4k60');
  fs.mkdirSync(outDir, { recursive: true });

  for (const item of assets) {
    const videoPath = path.resolve(process.cwd(), `../delete/4k60_assets/${item.name}`);
    if (!fs.existsSync(videoPath)) continue;
    const fileSize = fs.statSync(videoPath).size;

    console.log(`\nEvaluating Asset: ${item.name} (${(fileSize / 1024 / 1024).toFixed(1)} MB, ${item.duration}s, ${item.frames} frames)`);

    // MODE 1: 15-second highlight clip render
    const cpuOut15 = path.join(outDir, `clip15_cpu_${item.name}`);
    const qsvOut15 = path.join(outDir, `clip15_qsv_${item.name}`);

    const cpuArgs15 = [
      '-y',
      '-ss', '0',
      '-t', '15',
      '-i', videoPath,
      '-vf', 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920',
      '-c:v', 'libx264',
      '-preset', 'faster',
      '-crf', '22',
      '-r', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      cpuOut15,
    ];

    const qsvArgs15 = [
      '-y',
      '-init_hw_device', 'qsv=hw',
      '-filter_hw_device', 'hw',
      '-ss', '0',
      '-t', '15',
      '-i', videoPath,
      '-vf', 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920',
      '-c:v', 'h264_qsv',
      '-preset', 'faster',
      '-global_quality', '23',
      '-r', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      qsvOut15,
    ];

    console.log('  -> [15s Clip] Running CPU libx264...');
    const tCpu0 = Date.now();
    await execFileAsync(ffmpegBin, cpuArgs15, { timeout: 180000 });
    const cpuWallMs15 = Date.now() - tCpu0;
    const cpuWallSec15 = Number((cpuWallMs15 / 1000).toFixed(3));
    const cpuMultiplier15 = Number((15.0 / cpuWallSec15).toFixed(2));
    const cpuSize15 = fs.statSync(cpuOut15).size;

    console.log('  -> [15s Clip] Running Intel QSV h264_qsv...');
    const tQsv0 = Date.now();
    await execFileAsync(ffmpegBin, qsvArgs15, { timeout: 180000 });
    const qsvWallMs15 = Date.now() - tQsv0;
    const qsvWallSec15 = Number((qsvWallMs15 / 1000).toFixed(3));
    const qsvMultiplier15 = Number((15.0 / qsvWallSec15).toFixed(2));
    const qsvSize15 = fs.statSync(qsvOut15).size;

    const speedup15 = Number((((cpuWallSec15 - qsvWallSec15) / cpuWallSec15) * 100).toFixed(1));

    results.push({
      assetName: item.name,
      sourceDurationSec: item.duration,
      sourceFrames: item.frames,
      sourceSizeBytes: fileSize,
      mode: '15s_clip',
      outputDurationSec: 15.0,
      outputFrames: 900,
      cpu: {
        command: `ffmpeg ${cpuArgs15.join(' ')}`,
        wallTimeMs: cpuWallMs15,
        wallTimeSec: cpuWallSec15,
        speedMultiplier: cpuMultiplier15,
        outputSizeBytes: cpuSize15,
      },
      qsv: {
        command: `ffmpeg ${qsvArgs15.join(' ')}`,
        wallTimeMs: qsvWallMs15,
        wallTimeSec: qsvWallSec15,
        speedMultiplier: qsvMultiplier15,
        outputSizeBytes: qsvSize15,
      },
      qsvSpeedupPercent: speedup15,
    });

    console.log(`     [15s Clip] CPU: ${cpuWallSec15}s (${cpuMultiplier15}x) | QSV: ${qsvWallSec15}s (${qsvMultiplier15}x) -> QSV +${speedup15}%`);
  }

  // MODE 2: Full source transcode on 30s and 60s assets
  for (const item of assets.slice(0, 2)) {
    const videoPath = path.resolve(process.cwd(), `../delete/4k60_assets/${item.name}`);
    const fileSize = fs.statSync(videoPath).size;
    const cpuOutFull = path.join(outDir, `full_cpu_${item.name}`);
    const qsvOutFull = path.join(outDir, `full_qsv_${item.name}`);

    const cpuArgsFull = [
      '-y',
      '-i', videoPath,
      '-vf', 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920',
      '-c:v', 'libx264',
      '-preset', 'faster',
      '-crf', '22',
      '-r', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      cpuOutFull,
    ];

    const qsvArgsFull = [
      '-y',
      '-init_hw_device', 'qsv=hw',
      '-filter_hw_device', 'hw',
      '-i', videoPath,
      '-vf', 'crop=ih*9/16:ih:(iw-ih*9/16)/2:0,scale=1080:1920',
      '-c:v', 'h264_qsv',
      '-preset', 'faster',
      '-global_quality', '23',
      '-r', '60',
      '-c:a', 'aac',
      '-b:a', '128k',
      qsvOutFull,
    ];

    console.log(`\nEvaluating FULL Source Transcode: ${item.name} (${item.duration}s, ${item.frames} frames)`);

    console.log('  -> [Full Source] Running CPU libx264...');
    const tCpu0 = Date.now();
    await execFileAsync(ffmpegBin, cpuArgsFull, { timeout: 300000 });
    const cpuWallMs = Date.now() - tCpu0;
    const cpuWallSec = Number((cpuWallMs / 1000).toFixed(3));
    const cpuMultiplier = Number((item.duration / cpuWallSec).toFixed(2));
    const cpuSize = fs.statSync(cpuOutFull).size;

    console.log('  -> [Full Source] Running Intel QSV h264_qsv...');
    const tQsv0 = Date.now();
    await execFileAsync(ffmpegBin, qsvArgsFull, { timeout: 300000 });
    const qsvWallMs = Date.now() - tQsv0;
    const qsvWallSec = Number((qsvWallMs / 1000).toFixed(3));
    const qsvMultiplier = Number((item.duration / qsvWallSec).toFixed(2));
    const qsvSize = fs.statSync(qsvOutFull).size;

    const speedup = Number((((cpuWallSec - qsvWallSec) / cpuWallSec) * 100).toFixed(1));

    results.push({
      assetName: item.name,
      sourceDurationSec: item.duration,
      sourceFrames: item.frames,
      sourceSizeBytes: fileSize,
      mode: 'full_source',
      outputDurationSec: item.duration,
      outputFrames: item.frames,
      cpu: {
        command: `ffmpeg ${cpuArgsFull.join(' ')}`,
        wallTimeMs: cpuWallMs,
        wallTimeSec: cpuWallSec,
        speedMultiplier: cpuMultiplier,
        outputSizeBytes: cpuSize,
      },
      qsv: {
        command: `ffmpeg ${qsvArgsFull.join(' ')}`,
        wallTimeMs: qsvWallMs,
        wallTimeSec: qsvWallSec,
        speedMultiplier: qsvMultiplier,
        outputSizeBytes: qsvSize,
      },
      qsvSpeedupPercent: speedup,
    });

    console.log(`     [Full Source] CPU: ${cpuWallSec}s (${cpuMultiplier}x) | QSV: ${qsvWallSec}s (${qsvMultiplier}x) -> QSV +${speedup}%`);
  }

  const outPath = path.resolve(process.cwd(), '../delete/recalculated_4k60_results.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nSaved recalculated results to: ${outPath}`);
}

runRecalculation().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});

