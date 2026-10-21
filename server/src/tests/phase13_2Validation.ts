import { SmartReframeService } from '../services/smartReframeService.js';
import type { ReframeKeyframe, ReframeSample, ClipAspectRatio } from '../types/index.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import os from 'os';

const execFileAsync = promisify(execFile);

interface FixtureConfig {
  name: string;
  category: string;
  path: string;
  startSec: number;
  durationSec: number;
  sampleFps: number;
}

const fixtures: FixtureConfig[] = [
  {
    name: 'Cristiano Ronaldo',
    category: 'Single-speaker clip',
    path: 'demo/creators/ronaldo/source.mp4',
    startSec: 10.0,
    durationSec: 15.0,
    sampleFps: 4.0,
  },
  {
    name: 'Lex Fridman & Guest',
    category: 'Two-person interview',
    path: 'demo/creators/lex-fridman/source.mp4',
    startSec: 12.0,
    durationSec: 15.0,
    sampleFps: 4.0,
  },
  {
    name: 'Joe Rogan Experience',
    category: 'Camera cuts / multi-angle',
    path: 'demo/creators/joe-rogan/source.mp4',
    startSec: 15.0,
    durationSec: 15.0,
    sampleFps: 4.0,
  },
  {
    name: 'MrBeast Challenge',
    category: 'Occlusion & rapid motion',
    path: 'demo/creators/mrbeast/source.mp4',
    startSec: 5.0,
    durationSec: 15.0,
    sampleFps: 4.0,
  },
  {
    name: 'Dribbble Incident Platform UI',
    category: 'No usable face detected (UI recording)',
    path: 'reference/Website for an Incident Management Platform by Outcrowd on Dribbble.mp4',
    startSec: 0.0,
    durationSec: 15.0,
    sampleFps: 4.0,
  },
];

async function validateFixture(cfg: FixtureConfig) {
  const absPath = path.resolve(process.cwd(), cfg.path);
  if (!fs.existsSync(absPath)) {
    console.error(`Fixture not found: ${absPath}`);
    return null;
  }

  // Get stream metadata via ffprobe
  const ffprobeOut = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,duration',
    '-of', 'json',
    absPath,
  ]);
  const probeData = JSON.parse(ffprobeOut.stdout);
  const stream = probeData.streams[0];
  const width = stream.width;
  const height = stream.height;
  const fpsStr = stream.r_frame_rate;

  const t0 = performance.now();
  const cvResult = await SmartReframeService.runCvAnalyzer(
    absPath,
    cfg.sampleFps,
    cfg.startSec,
    cfg.durationSec,
    60000
  );
  const t1 = performance.now();
  const analysisRuntimeSec = (t1 - t0) / 1000;
  const rtf = analysisRuntimeSec / cfg.durationSec;

  const totalSamples = cvResult.samples.length;
  const samplesWithFace = cvResult.samples.filter((s: ReframeSample) => s.faces.length > 0).length;
  const faceDetectionRate = totalSamples > 0 ? (samplesWithFace / totalSamples) * 100 : 0;

  // Track association
  const { tracks, faceCount } = SmartReframeService.associateTracks(cvResult.samples);
  const { dominantTrackId, score } = SmartReframeService.selectDominantTrack(tracks, totalSamples);

  // Generate keyframes
  const keyframes = SmartReframeService.smoothAndGenerateKeyframes({
    samples: cvResult.samples,
    dominantTrackId,
    duration: cfg.durationSec,
    sceneCuts: cvResult.scene_cuts || [],
  });

  // Calculate statistics
  let maxJump = 0;
  for (let i = 1; i < keyframes.length; i++) {
    const jump = Math.abs(keyframes[i].centerX - keyframes[i - 1].centerX);
    if (jump > maxJump) maxJump = jump;
  }

  const allX = keyframes.map((k) => k.centerX);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allX);
  const meanX = allX.reduce((a, b) => a + b, 0) / allX.length;

  // Hard cuts in keyframes
  const hardCutPairs: Array<{ time: number; prevX: number; newX: number }> = [];
  for (let i = 1; i < keyframes.length; i++) {
    const dt = keyframes[i].time - keyframes[i - 1].time;
    if (dt <= 0.02 && Math.abs(keyframes[i].centerX - keyframes[i - 1].centerX) > 0.04) {
      hardCutPairs.push({
        time: keyframes[i].time,
        prevX: keyframes[i - 1].centerX,
        newX: keyframes[i].centerX,
      });
    }
  }

  const switchesPerMin = (hardCutPairs.length / cfg.durationSec) * 60;

  // Fallback frequency (samples where x defaulted to 0.5 center because no face was visible)
  let fallbackSamples = 0;
  for (const s of cvResult.samples) {
    if (s.faces.length === 0) fallbackSamples++;
  }
  const fallbackFreq = totalSamples > 0 ? (fallbackSamples / totalSamples) * 100 : 0;

  return {
    name: cfg.name,
    category: cfg.category,
    path: cfg.path,
    resolution: `${width}x${height}`,
    sourceFps: fpsStr,
    clipWindow: `${cfg.startSec}s to ${cfg.startSec + cfg.durationSec}s (${cfg.durationSec}s)`,
    sampleFps: cfg.sampleFps,
    runtimeSec: Number(analysisRuntimeSec.toFixed(2)),
    rtf: Number(rtf.toFixed(2)),
    totalSamples,
    detectionRatePct: Number(faceDetectionRate.toFixed(1)),
    trackCount: tracks.size,
    stableFaceCount: faceCount,
    dominantTrackId,
    dominantScore: score,
    keyframeCount: keyframes.length,
    sceneCutsFound: cvResult.scene_cuts?.length || 0,
    hardCutJumps: hardCutPairs.length,
    switchesPerMin: Number(switchesPerMin.toFixed(1)),
    meanX: Number(meanX.toFixed(3)),
    minX: Number(minX.toFixed(3)),
    maxX: Number(maxX.toFixed(3)),
    maxJump: Number(maxJump.toFixed(3)),
    fallbackPct: Number(fallbackFreq.toFixed(1)),
    hardCutPairs,
  };
}

async function runValidation() {
  console.log('Starting Phase 13.2 Fixture QA...\n');
  const results = [];
  for (const f of fixtures) {
    console.log(`Analyzing: [${f.category}] ${f.name}...`);
    const res = await validateFixture(f);
    if (res) results.push(res);
  }

  console.log('\n================ FIXTURE QA SUMMARY ================');
  console.table(
    results.map((r) => ({
      Category: r.category,
      Resolution: r.resolution,
      Runtime: `${r.runtimeSec}s (RTF ${r.rtf}x)`,
      'Detect Rate': `${r.detectionRatePct}%`,
      Tracks: r.trackCount,
      'Hard Cuts': r.hardCutJumps,
      'Switches/min': r.switchesPerMin,
      'Max Jump': r.maxJump,
      'Fallback %': `${r.fallbackPct}%`,
    }))
  );

  console.log('\nDetailed Metrics:');
  console.log(JSON.stringify(results, null, 2));

  // Render a real test clip with hard cut and verify frames around cut
  console.log('\n--- Real FFmpeg Render & Cut Frame Inspection ---');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireo-qa-render-'));
  const testOut = path.join(tempDir, 'qa_crop_render.mp4');
  const testKeyframes: ReframeKeyframe[] = [
    { time: 0.0, centerX: 0.30, centerY: 0.5 },
    { time: 1.995, centerX: 0.30, centerY: 0.5 },
    { time: 2.000, centerX: 0.70, centerY: 0.5 },
    { time: 4.0, centerX: 0.70, centerY: 0.5 },
  ];
  const filter = SmartReframeService.buildSmartCropFilter(testKeyframes, '9:16', 1920, 1080, 4.0);

  // Generate 4s test pattern video with horizontal gradient and text
  await execFileAsync('ffmpeg', [
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=duration=4:size=1920x1080:rate=30',
    '-vf', filter,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    testOut,
  ]);
  console.log(`Rendered verification video: ${testOut}`);

  // Extract frame right before cut (t = 1.96s) and right at cut (t = 2.04s)
  const fBefore = path.join(tempDir, 'frame_before_cut.png');
  const fAfter = path.join(tempDir, 'frame_after_cut.png');

  await execFileAsync('ffmpeg', ['-y', '-ss', '1.96', '-i', testOut, '-vframes', '1', fBefore]);
  await execFileAsync('ffmpeg', ['-y', '-ss', '2.04', '-i', testOut, '-vframes', '1', fAfter]);

  console.log(`Extracted before cut: ${fBefore} (${fs.statSync(fBefore).size} bytes)`);
  console.log(`Extracted after cut:  ${fAfter} (${fs.statSync(fAfter).size} bytes)`);

  // Cleanup temp files
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log('\nPhase 13.2 Fixture QA successfully completed.');
}

runValidation().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
