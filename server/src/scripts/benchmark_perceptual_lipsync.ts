import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
const probeBinary = (ffprobeStatic as any)?.path || (ffprobeStatic as any)?.default?.path || ffprobeStatic;
if (probeBinary && typeof probeBinary === 'string') {
  ffmpeg.setFfprobePath(probeBinary);
}

const ffPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : (ffmpegStatic as any)?.path;

interface MouthSample {
  time: number;
  mouthScore: number;
}

interface AudioEnergySample {
  time: number;
  rms: number;
}

async function extractMouthMotion(videoPath: string, durationSec: number): Promise<MouthSample[]> {
  const pythonBin = path.resolve(process.cwd(), 'python_embed/python.exe');
  const scriptPath = path.resolve(process.cwd(), 'python/smart_reframe.py');

  const inputJson = JSON.stringify({
    videoPath,
    sampleFps: 30, // Full 30fps evaluation for highest temporal resolution
    startSec: 0,
    durationSec,
  });

  const raw = execSync(`"${pythonBin}" "${scriptPath}"`, {
    input: inputJson,
    maxBuffer: 50 * 1024 * 1024,
  }).toString();

  const data = JSON.parse(raw);
  const samples: MouthSample[] = [];

  for (const s of data.samples || []) {
    const face = (s.faces || [])[0];
    const mouthScore = face ? (face.mouth_score ?? 0.0) : 0.0;
    samples.push({ time: s.time, mouthScore });
  }

  return samples;
}

async function extractAudioRmsProfile(videoPath: string, durationSec: number): Promise<AudioEnergySample[]> {
  // Use FFmpeg astats with metadata print or resample to 100Hz audio frames
  const tempWav = path.resolve(process.cwd(), '../delete/temp_sync_eval.wav');
  if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav);

  // Extract uncompressed 16kHz mono PCM for precise RMS windowing
  execSync(`"${ffPath}" -y -i "${videoPath}" -t ${durationSec} -vn -acodec pcm_s16le -ac 1 -ar 16000 "${tempWav}"`, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const buffer = fs.readFileSync(tempWav);
  // Header is 44 bytes for standard WAV
  const pcmData = new Int16Array(buffer.buffer, buffer.byteOffset + 44, (buffer.byteLength - 44) / 2);

  const windowSize = Math.floor(16000 / 30); // 533 samples per 30fps video frame
  const energySamples: AudioEnergySample[] = [];

  for (let i = 0; i < pcmData.length; i += windowSize) {
    let sumSquares = 0;
    let count = 0;
    const end = Math.min(pcmData.length, i + windowSize);
    for (let j = i; j < end; j++) {
      const val = pcmData[j];
      if (typeof val === 'number' && !isNaN(val)) {
        const norm = val / 32768.0;
        sumSquares += norm * norm;
        count++;
      }
    }
    const rms = count > 0 ? Math.sqrt(sumSquares / count) : 0;
    const time = Number((i / 16000).toFixed(4));
    energySamples.push({ time, rms });
  }

  try { fs.unlinkSync(tempWav); } catch {}
  return energySamples;
}

function computeCrossCorrelation(mouth: number[], audio: number[], maxLagFrames = 10): {
  optimalLagFrames: number;
  optimalLagMs: number;
  maxCorrelation: number;
  correlationCurve: Array<{ lagMs: number; r: number }>;
} {
  const n = Math.min(mouth.length, audio.length);
  if (n < 10) return { optimalLagFrames: 0, optimalLagMs: 0, maxCorrelation: 0, correlationCurve: [] };

  const mMean = mouth.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const aMean = audio.slice(0, n).reduce((a, b) => a + b, 0) / n;

  let mVar = 0;
  let aVar = 0;
  for (let i = 0; i < n; i++) {
    mVar += (mouth[i] - mMean) * (mouth[i] - mMean);
    aVar += (audio[i] - aMean) * (audio[i] - aMean);
  }
  const denom = Math.sqrt(mVar * aVar) || 1e-6;

  let bestLag = 0;
  let maxR = -999;
  const curve: Array<{ lagMs: number; r: number }> = [];

  for (let lag = -maxLagFrames; lag <= maxLagFrames; lag++) {
    let cov = 0;
    let validPairs = 0;
    let subMVar = 0;
    let subAVar = 0;

    for (let i = 0; i < n; i++) {
      const aIdx = i + lag;
      if (aIdx >= 0 && aIdx < n) {
        const dm = mouth[i] - mMean;
        const da = audio[aIdx] - aMean;
        cov += dm * da;
        subMVar += dm * dm;
        subAVar += da * da;
        validPairs++;
      }
    }
    const subDenom = Math.sqrt(subMVar * subAVar) || 1e-6;
    const r = validPairs > 0 ? cov / subDenom : 0;
    const lagMs = Math.round((lag / 30) * 1000);
    curve.push({ lagMs, r: Number(r.toFixed(4)) });

    if (r > maxR) {
      maxR = r;
      bestLag = lag;
    }
  }

  return {
    optimalLagFrames: bestLag,
    optimalLagMs: Math.round((bestLag / 30) * 1000),
    maxCorrelation: Number(maxR.toFixed(4)),
    correlationCurve: curve,
  };
}

async function runLipSyncBenchmark() {
  console.log('========================================================================');
  console.log('VIREOCLIP — PHASE 3.2 PERCEPTUAL AUDIO-VIDEO LIP-SYNC BENCHMARK');
  console.log('========================================================================\n');

  const sourceVideo = path.resolve(process.cwd(), '../public/demo/creator-demo.mp4');
  const renderedClip = path.resolve(process.cwd(), '../delete/benchmark_renders/clip_creator-demo.mp4');

  console.log(`Analyzing Source Video: ${sourceVideo}`);
  const duration = 6.0;

  // 1. Source Video Lip-Sync Evaluation
  const sourceMouth = await extractMouthMotion(sourceVideo, duration);
  const sourceAudio = await extractAudioRmsProfile(sourceVideo, duration);

  const mValues = sourceMouth.map((s) => s.mouthScore);
  const aValues = sourceAudio.map((s) => s.rms);

  console.log(`Source mouth samples: ${sourceMouth.length}, audio energy samples: ${sourceAudio.length}`);
  console.log('First 5 mouth scores:', sourceMouth.slice(0, 5).map(s => s.mouthScore));
  console.log('First 5 audio RMS:', sourceAudio.slice(0, 5).map(s => s.rms));

  const sourceSync = computeCrossCorrelation(mValues, aValues, 10);
  console.log(`Source Video Diagnostic Alignment:`);
  console.log(`  Optimal Acoustic-Visual Lag: ${sourceSync.optimalLagMs} ms (${sourceSync.optimalLagFrames} frames at 30fps)`);
  console.log(`  Max Cross-Correlation (r):   ${sourceSync.maxCorrelation}`);

  // 2. Rendered Clip Lip-Sync Evaluation
  console.log(`\nAnalyzing Rendered Output Clip: ${renderedClip}`);
  let renderedSync: any = null;
  if (fs.existsSync(renderedClip)) {
    const renderedMouth = await extractMouthMotion(renderedClip, 3.4);
    const renderedAudio = await extractAudioRmsProfile(renderedClip, 3.4);
    renderedSync = computeCrossCorrelation(
      renderedMouth.map((s) => s.mouthScore),
      renderedAudio.map((s) => s.rms),
      10
    );
    console.log(`Rendered Clip Diagnostic Alignment:`);
    console.log(`  Optimal Acoustic-Visual Lag: ${renderedSync.optimalLagMs} ms (${renderedSync.optimalLagFrames} frames)`);
    console.log(`  Max Cross-Correlation (r):   ${renderedSync.maxCorrelation}`);
    console.log(`  Relative Shift After Render: ${Math.abs(renderedSync.optimalLagMs - sourceSync.optimalLagMs)} ms`);
  }

  const syncReport = {
    methodology: 'Mouth ROI Sobel aperture vs 16kHz PCM audio RMS normalized cross-correlation',
    discreteFrameGranularityMs: 33.33,
    sourceVideo: {
      path: sourceVideo,
      durationSec: duration,
      sampleCount: sourceMouth.length,
      measuredLagMs: sourceSync.optimalLagMs,
      correlationCoefficient: sourceSync.maxCorrelation,
    },
    renderedClip: renderedSync ? {
      path: renderedClip,
      measuredLagMs: renderedSync.optimalLagMs,
      correlationCoefficient: renderedSync.maxCorrelation,
      inducedRenderDriftMs: Math.abs(renderedSync.optimalLagMs - sourceSync.optimalLagMs),
    } : null,
    measurementUncertaintyMs: 33.33, // 1 video frame at 30fps
    perceptualThresholds: {
      ituRecommendationBT1359: 'Audio should not lead video by > 45ms or lag video by > 125ms for imperceptible drift',
      passFailCriteria: 'Induced render drift must be <= 33.33ms (0 frame slippage)',
      status: Math.abs((renderedSync?.optimalLagMs ?? 0) - sourceSync.optimalLagMs) <= 33.33 ? 'PASS' : 'INVESTIGATE',
    },
    knownLimitations: [
      'Diagnostic cross-correlation is mouth-aperture based, not a neural SyncNet phoneme model.',
      'Plosive and bilabial consonants (P, B, M) naturally involve mouth opening 40-80ms prior to vocal cord phonation.',
      'Single-camera frontal perspective assumed; profile angles reduce mouth tracking confidence.',
    ],
  };

  const outPath = path.resolve(process.cwd(), '../delete/lipsync_benchmark_results.json');
  fs.writeFileSync(outPath, JSON.stringify(syncReport, null, 2), 'utf8');
  console.log(`\nSaved Lip-Sync Diagnostic Report to ${outPath}`);
}

runLipSyncBenchmark().catch((err) => {
  console.error('Lip-sync benchmark failed:', err);
  process.exit(1);
});
