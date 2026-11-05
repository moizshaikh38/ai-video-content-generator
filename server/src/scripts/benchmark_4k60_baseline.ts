import fs from 'fs';
import path from 'path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { VideoSceneService } from '../services/multimodal/videoSceneService.js';
import { FaceFeatureService } from '../services/multimodal/faceFeatureService.js';

const execFileAsync = promisify(execFile);
const ffmpegBin = (ffmpegStatic as unknown as string) || 'ffmpeg';
const ffprobeBin = (ffprobeStatic as any)?.path || 'ffprobe';

interface AssetBenchmark {
  assetName: string;
  durationSec: number;
  fileSizeBytes: number;
  probe: {
    width: number;
    height: number;
    fps: number;
    codec: string;
  };
  sceneCut: {
    durationMs: number;
    cutsDetected: number;
    success: boolean;
    error?: string;
  };
  faceAnalysis: {
    durationMs: number;
    presenceRatio: number;
    sampleCount: number;
    success: boolean;
    error?: string;
  };
  cpuTranscode: {
    durationMs: number;
    outputSizeBytes: number;
    fps: number;
    speed: string;
    success: boolean;
    error?: string;
  };
  qsvTranscode: {
    durationMs: number;
    outputSizeBytes: number;
    fps: number;
    speed: string;
    success: boolean;
    error?: string;
  };
  memory: {
    peakRssMb: number;
    peakHeapUsedMb: number;
  };
}

async function probeVideo(filePath: string): Promise<{ width: number; height: number; fps: number; codec: string }> {
  const probeBin = ffprobeBin;
  const args = [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,codec_name',
    '-of', 'json',
    filePath,
  ];
  const { stdout } = await execFileAsync(probeBin, args);
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0] || {};
  let fps = 60;
  if (stream.r_frame_rate) {
    const parts = stream.r_frame_rate.split('/');
    if (parts.length === 2 && Number(parts[1]) > 0) {
      fps = Math.round(Number(parts[0]) / Number(parts[1]));
    }
  }
  return {
    width: stream.width || 3840,
    height: stream.height || 2160,
    fps,
    codec: stream.codec_name || 'h264',
  };
}

async function run4K60Benchmark() {
  console.log('========================================================================');
  console.log('VIREOCLIP — PHASE 3.2 4K 60FPS SUSTAINED PROCESSING BENCHMARK');
  console.log('========================================================================\n');

  const assets = [
    { name: '4k60_30s.mp4', duration: 30 },
    { name: '4k60_1m.mp4', duration: 60 },
    { name: '4k60_3m.mp4', duration: 180 },
    { name: '4k60_5m.mp4', duration: 300 },
  ];

  const results: AssetBenchmark[] = [];
  const outputDir = path.resolve(process.cwd(), '../delete/benchmark_renders/4k60');
  fs.mkdirSync(outputDir, { recursive: true });

  for (const item of assets) {
    const videoPath = path.resolve(process.cwd(), `../delete/4k60_assets/${item.name}`);
    if (!fs.existsSync(videoPath)) {
      console.warn(`File not found: ${videoPath}`);
      continue;
    }

    const fileSize = fs.statSync(videoPath).size;
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`Evaluating 4K 60fps Asset: ${item.name} (${(fileSize / 1024 / 1024).toFixed(1)} MB, ${item.duration}s)`);
    console.log(`------------------------------------------------------------------------`);

    let peakRss = process.memoryUsage().rss;
    let peakHeap = process.memoryUsage().heapUsed;
    const updateMem = () => {
      const m = process.memoryUsage();
      if (m.rss > peakRss) peakRss = m.rss;
      if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;
    };

    // 1. Probe video
    const probe = await probeVideo(videoPath);
    console.log(`[Probe] Stream: ${probe.width}x${probe.height} @ ${probe.fps}fps (${probe.codec})`);

    // 2. Visual Scene Cuts Detection
    console.log('[1/4] Running Scene Cut Detection on 4K 60fps stream...');
    const sceneRes = { durationMs: 0, cutsDetected: 0, success: false, error: undefined as string | undefined };
    try {
      const sStart = Date.now();
      // Use 120s timeout for 4k
      const cuts = await VideoSceneService.detectSceneCuts(videoPath, 0.3, 180000);
      sceneRes.durationMs = Date.now() - sStart;
      sceneRes.cutsDetected = cuts.length;
      sceneRes.success = true;
      console.log(`  -> Scene Cuts: ${cuts.length} cuts detected in ${(sceneRes.durationMs / 1000).toFixed(2)}s`);
    } catch (err: any) {
      sceneRes.durationMs = Date.now();
      sceneRes.success = false;
      sceneRes.error = err.message;
      console.error(`  -> Scene Detection Error: ${err.message}`);
    }
    updateMem();

    // 3. Face Presence Analysis
    console.log('[2/4] Running Face Presence Analysis on 4K 60fps stream (sampling at 0.5 fps)...');
    const faceRes = { durationMs: 0, presenceRatio: 0, sampleCount: 0, success: false, error: undefined as string | undefined };
    try {
      const fStart = Date.now();
      const faceResult = await FaceFeatureService.analyzeFacePresence(videoPath, item.duration, 0.5, 180000);
      faceRes.durationMs = Date.now() - fStart;
      faceRes.presenceRatio = faceResult.face_presence_ratio;
      faceRes.sampleCount = faceResult.sample_count;
      faceRes.success = true;
      console.log(`  -> Face Presence: ratio=${faceResult.face_presence_ratio}, samples=${faceResult.sample_count} in ${(faceRes.durationMs / 1000).toFixed(2)}s`);
    } catch (err: any) {
      faceRes.durationMs = Date.now();
      faceRes.success = false;
      faceRes.error = err.message;
      console.error(`  -> Face Presence Error: ${err.message}`);
    }
    updateMem();

    // 4. CPU Transcoding Benchmark: 9:16 vertical crop & scale (1080x1920) at 60fps (15-second clip)
    console.log('[3/4] Running CPU Transcoding Benchmark (libx264, 15s clip @ 1080x1920 60fps)...');
    const cpuRes = { durationMs: 0, outputSizeBytes: 0, fps: 0, speed: '0x', success: false, error: undefined as string | undefined };
    const cpuOutPath = path.join(outputDir, `cpu_${item.name}`);
    try {
      const cStart = Date.now();
      const cpuArgs = [
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
        cpuOutPath,
      ];
      const { stderr } = await execFileAsync(ffmpegBin, cpuArgs, { timeout: 180000 });
      cpuRes.durationMs = Date.now() - cStart;
      cpuRes.outputSizeBytes = fs.statSync(cpuOutPath).size;
      cpuRes.success = true;

      // Parse speed & fps from stderr
      const fpsMatch = stderr.match(/fps=\s*([\d.]+)/);
      const speedMatch = stderr.match(/speed=\s*([\d.]+x)/);
      if (fpsMatch) cpuRes.fps = parseFloat(fpsMatch[1]);
      if (speedMatch) cpuRes.speed = speedMatch[1];

      console.log(`  -> CPU Transcode: ${(cpuRes.outputSizeBytes / 1024 / 1024).toFixed(2)} MB in ${(cpuRes.durationMs / 1000).toFixed(2)}s (fps: ${cpuRes.fps}, speed: ${cpuRes.speed})`);
    } catch (err: any) {
      cpuRes.durationMs = Date.now();
      cpuRes.success = false;
      cpuRes.error = err.message;
      console.error(`  -> CPU Transcode Error: ${err.message}`);
    }
    updateMem();

    // 5. Intel QSV Hardware Transcoding Benchmark: 9:16 vertical crop & scale (1080x1920) at 60fps (15-second clip)
    console.log('[4/4] Running Intel QSV Hardware Transcoding Benchmark (h264_qsv, 15s clip @ 1080x1920 60fps)...');
    const qsvRes = { durationMs: 0, outputSizeBytes: 0, fps: 0, speed: '0x', success: false, error: undefined as string | undefined };
    const qsvOutPath = path.join(outputDir, `qsv_${item.name}`);
    try {
      const qStart = Date.now();
      const qsvArgs = [
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
        qsvOutPath,
      ];
      const { stderr } = await execFileAsync(ffmpegBin, qsvArgs, { timeout: 180000 });
      qsvRes.durationMs = Date.now() - qStart;
      qsvRes.outputSizeBytes = fs.statSync(qsvOutPath).size;
      qsvRes.success = true;

      // Parse speed & fps from stderr
      const fpsMatch = stderr.match(/fps=\s*([\d.]+)/);
      const speedMatch = stderr.match(/speed=\s*([\d.]+x)/);
      if (fpsMatch) qsvRes.fps = parseFloat(fpsMatch[1]);
      if (speedMatch) qsvRes.speed = speedMatch[1];

      console.log(`  -> QSV Transcode: ${(qsvRes.outputSizeBytes / 1024 / 1024).toFixed(2)} MB in ${(qsvRes.durationMs / 1000).toFixed(2)}s (fps: ${qsvRes.fps}, speed: ${qsvRes.speed})`);
    } catch (err: any) {
      qsvRes.durationMs = Date.now();
      qsvRes.success = false;
      qsvRes.error = err.message;
      console.error(`  -> QSV Transcode Error: ${err.message}`);
    }
    updateMem();

    results.push({
      assetName: item.name,
      durationSec: item.duration,
      fileSizeBytes: fileSize,
      probe,
      sceneCut: sceneRes,
      faceAnalysis: faceRes,
      cpuTranscode: cpuRes,
      qsvTranscode: qsvRes,
      memory: {
        peakRssMb: Number((peakRss / 1024 / 1024).toFixed(1)),
        peakHeapUsedMb: Number((peakHeap / 1024 / 1024).toFixed(1)),
      },
    });
  }

  const resultsPath = path.resolve(process.cwd(), '../delete/4k60_benchmark_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n========================================================================`);
  console.log(`Saved 4K 60fps Benchmark Results to ${resultsPath}`);
}

run4K60Benchmark().catch((err) => {
  console.error('Fatal 4K60 benchmark error:', err);
  process.exit(1);
});
