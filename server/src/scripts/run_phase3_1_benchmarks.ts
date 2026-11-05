import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { getMongoDb, closeMongo } from '../db/mongoClient.js';
import { VideoIntelligenceService } from '../services/intelligence/videoIntelligenceService.js';
import { HighlightFusionService } from '../services/intelligence/highlightFusionService.js';
import { ShotBoundaryFusionService } from '../services/intelligence/shotBoundaryFusionService.js';
import { VideoSceneService } from '../services/multimodal/videoSceneService.js';
import { FaceFeatureService } from '../services/multimodal/faceFeatureService.js';
import { AudioFeatureService } from '../services/multimodal/audioFeatureService.js';
import { extractAudioFromVideo } from '../services/audioExtractionService.js';
import { OpenRouterTranscriptionProvider } from '../services/transcription/openRouterTranscriptionProvider.js';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
const probeBinary = (ffprobeStatic as any)?.path || (ffprobeStatic as any)?.default?.path || ffprobeStatic;
if (probeBinary && typeof probeBinary === 'string') {
  ffmpeg.setFfprobePath(probeBinary);
}

interface BenchmarkResult {
  category: string;
  filePath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  resolution: string;
  videoCodec: string;
  audioCodec: string;
  hasAudio: boolean;
  sha256TimeMs: number;
  audioExtractTimeMs: number;
  transcriptionTimeMs: number;
  transcriptionSegments: number;
  transcriptionWords: number;
  sceneDetectTimeMs: number;
  sceneCutCount: number;
  faceAnalysisTimeMs: number;
  facePresenceRatio: number;
  highlightAnalysisTimeMs: number;
  candidateCount: number;
  topCandidateScore: number;
  topCandidateDuration: number;
  clipRenderTimeMs: number;
  outputClipSizeBytes: number;
  outputClipDuration: number;
  avSyncOffsetSec: number;
  peakRssMb: number;
  peakHeapUsedMb: number;
}

async function probeFile(filePath: string): Promise<any> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return reject(err);
      resolve(meta);
    });
  });
}

async function renderClip(
  sourcePath: string,
  outputPath: string,
  start: number,
  duration: number,
  hasAudio: boolean
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(sourcePath)
      .setStartTime(start)
      .setDuration(duration)
      .videoCodec('libx264')
      .outputOptions(['-preset ultrafast', '-pix_fmt yuv420p']);

    if (hasAudio) {
      cmd.audioCodec('aac').audioBitrate('128k');
    } else {
      cmd.noAudio();
    }

    cmd
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

async function runBenchmark() {
  console.log('========================================================================');
  console.log('VIREOCLIP — PHASE 3.1 PRODUCTION VALIDATION & REAL VIDEO BENCHMARKING');
  console.log('========================================================================\n');

  const assets = [
    {
      category: '1. Talking-head',
      filePath: path.resolve(process.cwd(), '../public/demo/creator-demo.mp4'),
    },
    {
      category: '2. 1080p Tutorial / Screencast',
      filePath: path.resolve(process.cwd(), '../public/demo/creator-studio-demo.mp4'),
    },
    {
      category: '3. Silent B-roll footage',
      filePath: path.resolve(process.cwd(), '../public/demo/showcase/v9.mp4'),
    },
    {
      category: '4. Multiple-speaker video (Long 102s)',
      filePath: path.resolve(process.cwd(), '../delete/extended_multispeaker_108s.mp4'),
    },
    {
      category: '5. 4K UHD video (HEVC 3840x2160, 101MB)',
      filePath: path.resolve(process.cwd(), '../delete/video_20261011_011105.mp4'),
    },
    {
      category: '6. Rapid scene-transitions',
      filePath: path.resolve(process.cwd(), '../public/demo/vireo-demo.mp4'),
    },
  ];

  const results: BenchmarkResult[] = [];
  const tempDir = path.resolve(process.cwd(), '../delete/benchmark_renders');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const stt = new OpenRouterTranscriptionProvider();

  for (const asset of assets) {
    console.log(`\n------------------------------------------------------------------------`);
    console.log(`BENCHMARKING: ${asset.category}`);
    console.log(`File: ${asset.filePath}`);
    console.log(`------------------------------------------------------------------------`);

    const stat = fs.statSync(asset.filePath);
    const probeMeta = await probeFile(asset.filePath);
    const vStream = probeMeta.streams.find((s: any) => s.codec_type === 'video');
    const aStream = probeMeta.streams.find((s: any) => s.codec_type === 'audio');
    const duration = Number(probeMeta.format.duration) || 0;
    const hasAudio = Boolean(aStream);

    // 1. Full-content SHA-256 Streaming Read
    const tSha0 = Date.now();
    const fullSha256 = VideoIntelligenceService.computeFullContentSha256(asset.filePath);
    const sha256TimeMs = Date.now() - tSha0;
    console.log(`[SHA-256] Hash: ${fullSha256.slice(0, 16)}... computed in ${sha256TimeMs}ms`);

    // 2. Audio Extraction & Transcription
    let audioExtractTimeMs = 0;
    let transcriptionTimeMs = 0;
    let segments: any[] = [];
    let words: any[] = [];
    let transcriptText = '';

    if (hasAudio) {
      const tExt0 = Date.now();
      const extracted = await extractAudioFromVideo(asset.filePath, 'benchmark.mp4', {
        durationHintSec: duration,
      });
      audioExtractTimeMs = Date.now() - tExt0;

      const tTr0 = Date.now();
      try {
        const trResult = await stt.transcribeAudio(extracted.audioBuffer, 'audio.mp3', 'audio/mp3');
        transcriptionTimeMs = Date.now() - tTr0;
        transcriptText = trResult.text;
        segments = trResult.segments || [];
        words = trResult.words || [];
        console.log(`[Audio/STT] Extracted in ${audioExtractTimeMs}ms, transcribed in ${transcriptionTimeMs}ms: ${segments.length} segments, ${words.length} words.`);
      } catch (sttErr: any) {
        console.warn(`[Audio/STT] STT notice: ${sttErr.message}`);
      }
    } else {
      console.log(`[Audio/STT] Video has NO audio stream (Silent). Skipping STT.`);
    }

    // 3. Scene Detection
    const tScene0 = Date.now();
    const sceneCuts = await VideoSceneService.detectSceneCuts(asset.filePath, 0.30, 90000).catch(() => []);
    const sceneDetectTimeMs = Date.now() - tScene0;
    console.log(`[Scene Detection] Detected ${sceneCuts.length} scene cuts in ${sceneDetectTimeMs}ms:`, sceneCuts.slice(0, 5).map(c => `${c.timestamp.toFixed(2)}s (score ${(c.score * 100).toFixed(0)}%)`));

    // 4. Face Presence Analysis
    const tFace0 = Date.now();
    const faceResult = await FaceFeatureService.analyzeFacePresence(asset.filePath, Math.min(duration, 30), 2.0).catch(() => ({
      face_presence_ratio: 0,
      intervals: [],
    }));
    const faceAnalysisTimeMs = Date.now() - tFace0;
    console.log(`[Face Tracking] Presence ratio: ${(faceResult.face_presence_ratio * 100).toFixed(1)}% in ${faceAnalysisTimeMs}ms`);

    // 5. Multimodal Highlight & Shot-Boundary Fusion
    const tHigh0 = Date.now();
    const candidates = HighlightFusionService.generateHighlightCandidates({
      audio: {
        transcriptText,
        language: 'en',
        segments,
        words,
        silenceIntervals: [],
        meanVolumeDb: -22,
        speakingPaceWpm: words.length && duration ? (words.length / (duration / 60)) : 0,
      },
      visual: {
        sceneCuts,
        keyframeTimestamps: [],
        facePresenceRatio: faceResult.face_presence_ratio,
        faceIntervals: faceResult.intervals,
        objects: [],
        actions: [],
        ocr: [],
        scenes: [],
      },
      reasoning: {
        summary: transcriptText.slice(0, 100) || 'Visual footage',
        topics: ['creator', 'content'],
        groundedProvenance: {
          spokenFacts: transcriptText ? [transcriptText.slice(0, 50)] : [],
          visualObservations: [],
          ocrConfirmedText: [],
          inferences: [],
          contradictions: [],
        },
      },
      totalDurationSeconds: duration,
      targetDuration: { min: Math.min(2.5, duration), max: Math.min(30, duration), optimal: 15 },
      maxCandidates: 3,
    });
    const highlightAnalysisTimeMs = Date.now() - tHigh0;
    console.log(`[Highlight Fusion] Generated ${candidates.length} candidates in ${highlightAnalysisTimeMs}ms`);

    const topCandidate = candidates[0] || {
      combinedScore: 50,
      start: 0,
      end: Math.min(duration, 5),
      duration: Math.min(duration, 5),
    };

    // 6. FFmpeg Video Rendering & Playback Inspection
    const outClipName = `clip_${path.basename(asset.filePath, path.extname(asset.filePath))}.mp4`;
    const outClipPath = path.join(tempDir, outClipName);
    if (fs.existsSync(outClipPath)) fs.unlinkSync(outClipPath);

    const tRen0 = Date.now();
    await renderClip(asset.filePath, outClipPath, topCandidate.start, topCandidate.duration, hasAudio);
    const clipRenderTimeMs = Date.now() - tRen0;

    // Inspect rendered clip
    const clipStat = fs.statSync(outClipPath);
    const clipProbe = await probeFile(outClipPath);
    const clipVStream = clipProbe.streams.find((s: any) => s.codec_type === 'video');
    const clipAStream = clipProbe.streams.find((s: any) => s.codec_type === 'audio');
    const clipDur = Number(clipProbe.format.duration) || 0;
    const vDur = clipVStream ? Number(clipVStream.duration || clipDur) : 0;
    const aDur = clipAStream ? Number(clipAStream.duration || clipDur) : vDur;
    const avSyncOffsetSec = Math.abs(vDur - aDur);

    console.log(`[Rendering] Rendered in ${clipRenderTimeMs}ms: ${(clipStat.size / 1024).toFixed(1)} KB, duration: ${clipDur.toFixed(2)}s, A/V sync offset: ${avSyncOffsetSec.toFixed(3)}s`);

    const mem = process.memoryUsage();
    results.push({
      category: asset.category,
      filePath: asset.filePath,
      fileSizeBytes: stat.size,
      durationSeconds: Number(duration.toFixed(2)),
      resolution: vStream ? `${vStream.width}x${vStream.height}` : 'unknown',
      videoCodec: vStream?.codec_name || 'unknown',
      audioCodec: aStream?.codec_name || 'none',
      hasAudio,
      sha256TimeMs,
      audioExtractTimeMs,
      transcriptionTimeMs,
      transcriptionSegments: segments.length,
      transcriptionWords: words.length,
      sceneDetectTimeMs,
      sceneCutCount: sceneCuts.length,
      faceAnalysisTimeMs,
      facePresenceRatio: Number(faceResult.face_presence_ratio.toFixed(2)),
      highlightAnalysisTimeMs,
      candidateCount: candidates.length,
      topCandidateScore: topCandidate.combinedScore,
      topCandidateDuration: Number(topCandidate.duration.toFixed(2)),
      clipRenderTimeMs,
      outputClipSizeBytes: clipStat.size,
      outputClipDuration: Number(clipDur.toFixed(2)),
      avSyncOffsetSec: Number(avSyncOffsetSec.toFixed(3)),
      peakRssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
      peakHeapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
    });
  }

  console.log('\n========================================================================');
  console.log('SUMMARY BENCHMARK TABLE ACROSS ALL 6 CATEGORIES');
  console.log('========================================================================\n');
  console.table(
    results.map((r) => ({
      Category: r.category,
      Res: r.resolution,
      Codec: `${r.videoCodec}/${r.audioCodec}`,
      Duration: `${r.durationSeconds}s`,
      InSize: `${(r.fileSizeBytes / (1024 * 1024)).toFixed(2)}MB`,
      Sha256: `${r.sha256TimeMs}ms`,
      STT: `${r.transcriptionTimeMs}ms`,
      Scenes: `${r.sceneCutCount} cuts`,
      Faces: `${(r.facePresenceRatio * 100).toFixed(0)}%`,
      Highlight: `${r.highlightAnalysisTimeMs}ms`,
      Score: r.topCandidateScore,
      Render: `${r.clipRenderTimeMs}ms`,
      ClipDur: `${r.outputClipDuration}s`,
      AVSync: `${r.avSyncOffsetSec}s`,
      RAM: `${r.peakRssMb}MB`,
    }))
  );

  // Save JSON report for verification artifact
  const outJson = path.resolve(process.cwd(), '../delete/benchmark_results.json');
  fs.writeFileSync(outJson, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\nBenchmark JSON results saved to: ${outJson}`);
}

runBenchmark()
  .catch((e) => {
    console.error('Benchmark error:', e);
    process.exit(1);
  })
  .finally(() => {
    closeMongo(true);
  });
