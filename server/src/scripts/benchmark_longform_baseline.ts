import fs from 'fs';
import path from 'path';
import { extractAudioFromVideo } from '../services/audioExtractionService.js';
import { VideoSceneService } from '../services/multimodal/videoSceneService.js';
import { FaceFeatureService } from '../services/multimodal/faceFeatureService.js';
import { VideoIntelligenceService } from '../services/intelligence/videoIntelligenceService.js';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';

interface LongFormBenchmarkResult {
  assetName: string;
  durationSeconds: number;
  fileSizeBytes: number;
  audioExtraction: {
    durationMs: number;
    audioSizeBytes: number;
    success: boolean;
    error?: string;
  };
  sceneCutDetection: {
    durationMs: number;
    cutsDetected: number;
    success: boolean;
    error?: string;
  };
  facePresenceAnalysis: {
    durationMs: number;
    presenceRatio: number;
    sampleCount: number;
    success: boolean;
    error?: string;
  };
  peakRssMb: number;
  peakHeapUsedMb: number;
  overallStatus: 'PASS' | 'FAIL' | 'TIMEOUT';
}

async function runLongFormBenchmark() {
  console.log('========================================================================');
  console.log('VIREOCLIP — PHASE 3.2 LONG-FORM VIDEO BASELINE BENCHMARK');
  console.log('========================================================================\n');

  const assets = [
    { name: 'longform_5m.mp4', duration: 300 },
    { name: 'longform_10m.mp4', duration: 600 },
    { name: 'longform_15m.mp4', duration: 900 },
    { name: 'longform_30m.mp4', duration: 1800 },
  ];

  const results: LongFormBenchmarkResult[] = [];

  for (const item of assets) {
    const videoPath = path.resolve(process.cwd(), `../delete/longform/${item.name}`);
    if (!fs.existsSync(videoPath)) {
      console.warn(`File not found: ${videoPath}`);
      continue;
    }

    const fileSize = fs.statSync(videoPath).size;
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`Benchmarking Asset: ${item.name} (${(fileSize / 1024 / 1024).toFixed(2)} MB, ${item.duration}s / ${(item.duration / 60).toFixed(1)}m)`);
    console.log(`------------------------------------------------------------------------`);

    let peakRss = process.memoryUsage().rss;
    let peakHeap = process.memoryUsage().heapUsed;

    const updateMem = () => {
      const m = process.memoryUsage();
      if (m.rss > peakRss) peakRss = m.rss;
      if (m.heapUsed > peakHeap) peakHeap = m.heapUsed;
    };

    // 1. Audio Extraction Benchmark
    console.log('[1/3] Testing Audio Extraction...');
    const audioRes = { durationMs: 0, audioSizeBytes: 0, success: false, error: undefined as string | undefined };
    let cleanupAudio: (() => void) | null = null;
    try {
      const aStart = Date.now();
      const aOut = await extractAudioFromVideo(videoPath, item.name, { durationHintSec: item.duration });
      audioRes.durationMs = Date.now() - aStart;
      audioRes.audioSizeBytes = aOut.audioBuffer.length;
      audioRes.success = true;
      cleanupAudio = aOut.cleanup;
      console.log(`  -> Audio Extracted: ${(audioRes.audioSizeBytes / 1024 / 1024).toFixed(2)} MB in ${(audioRes.durationMs / 1000).toFixed(2)}s`);
    } catch (err: any) {
      audioRes.durationMs = Date.now();
      audioRes.success = false;
      audioRes.error = err.message;
      console.error(`  -> Audio Extraction FAILED: ${err.message}`);
    }
    updateMem();

    // 2. Scene Cut Detection Benchmark
    console.log('[2/3] Testing Scene Cut Detection (Current Baseline: 90s hardcoded timeout)...');
    const sceneRes = { durationMs: 0, cutsDetected: 0, success: false, error: undefined as string | undefined };
    try {
      const sStart = Date.now();
      const cuts = await VideoSceneService.detectSceneCuts(videoPath, 0.3, 90000);
      sceneRes.durationMs = Date.now() - sStart;
      sceneRes.cutsDetected = cuts.length;
      sceneRes.success = true;
      console.log(`  -> Scene Cuts: ${cuts.length} cuts detected in ${(sceneRes.durationMs / 1000).toFixed(2)}s`);
    } catch (err: any) {
      sceneRes.durationMs = Date.now();
      sceneRes.success = false;
      sceneRes.error = err.message;
      console.error(`  -> Scene Detection FAILED: ${err.message}`);
    }
    updateMem();

    // 3. Face Presence Analysis Benchmark
    console.log('[3/3] Testing Face Presence Analysis (Current Baseline: 90s hardcoded timeout)...');
    const faceRes = { durationMs: 0, presenceRatio: 0, sampleCount: 0, success: false, error: undefined as string | undefined };
    try {
      const fStart = Date.now();
      const faceResult = await FaceFeatureService.analyzeFacePresence(videoPath, item.duration, 0.5, 90000); // 0.5 fps sample rate
      faceRes.durationMs = Date.now() - fStart;
      faceRes.presenceRatio = faceResult.face_presence_ratio;
      faceRes.sampleCount = faceResult.sample_count;
      faceRes.success = true;
      console.log(`  -> Face Presence: ratio=${faceResult.face_presence_ratio}, samples=${faceResult.sample_count} in ${(faceRes.durationMs / 1000).toFixed(2)}s`);
    } catch (err: any) {
      faceRes.durationMs = Date.now();
      faceRes.success = false;
      faceRes.error = err.message;
      console.error(`  -> Face Analysis FAILED: ${err.message}`);
    }
    updateMem();

    if (cleanupAudio) cleanupAudio();

    const overallStatus = (audioRes.success && sceneRes.success && faceRes.success) ? 'PASS' : 'FAIL';

    results.push({
      assetName: item.name,
      durationSeconds: item.duration,
      fileSizeBytes: fileSize,
      audioExtraction: audioRes,
      sceneCutDetection: sceneRes,
      facePresenceAnalysis: faceRes,
      peakRssMb: Number((peakRss / 1024 / 1024).toFixed(1)),
      peakHeapUsedMb: Number((peakHeap / 1024 / 1024).toFixed(1)),
      overallStatus,
    });
  }

  const resultsPath = path.resolve(process.cwd(), '../delete/longform_baseline_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n========================================================================`);
  console.log(`Saved Long-Form Baseline Benchmark Results to ${resultsPath}`);
}

runLongFormBenchmark().catch((err) => {
  console.error('Long-form benchmark fatal error:', err);
  process.exit(1);
});

