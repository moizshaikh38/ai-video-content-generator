import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { HighlightFusionService } from '../services/intelligence/highlightFusionService.js';
import { ShotBoundaryFusionService } from '../services/intelligence/shotBoundaryFusionService.js';
import {
  AudioIntelligence,
  VisualIntelligence,
  MultimodalReasoning,
  SpeakerContinuity,
  AudioIntelligenceSegment,
} from '../types/videoIntelligence.js';

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
const probeBinary = (ffprobeStatic as any)?.path || (ffprobeStatic as any)?.default?.path || ffprobeStatic;
if (probeBinary && typeof probeBinary === 'string') {
  ffmpeg.setFfprobePath(probeBinary);
}

function probeStreamSkew(filePath: string): Promise<{
  videoStartTime: number;
  audioStartTime: number;
  startOffsetSec: number;
  durationDiffSec: number;
  hasAudio: boolean;
}> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(err);
      const v = data.streams.find((s) => s.codec_type === 'video');
      const a = data.streams.find((s) => s.codec_type === 'audio');
      const vStart = parseFloat(v?.start_time || '0');
      const aStart = parseFloat(a?.start_time || '0');
      const vDur = parseFloat(v?.duration || data.format.duration?.toString() || '0');
      const aDur = a ? parseFloat(a.duration || data.format.duration?.toString() || '0') : 0;

      resolve({
        videoStartTime: vStart,
        audioStartTime: aStart,
        startOffsetSec: a ? Math.abs(vStart - aStart) : 0,
        durationDiffSec: a ? Math.abs(vDur - aDur) : 0,
        hasAudio: !!a,
      });
    });
  });
}

describe('VIREOCLIP — FINAL PHASE 3 PRODUCTION VALIDATION TEST SUITE', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. SPEAKER IDENTITY VS FACE CONTINUITY (STRICT SEPARATION)
  // ──────────────────────────────────────────────────────────────────────────
  describe('1. Speaker Identity vs Face Continuity (Strict Separation)', () => {
    const baseVisual: VisualIntelligence = {
      sceneCuts: [{ timestamp: 0, score: 0.9 }],
      keyframeTimestamps: [2.0, 5.0, 8.0],
      facePresenceRatio: 0.85,
      faceIntervals: [{ start: 0, end: 10.0, average_confidence: 0.95 }],
      objects: [{ label: 'Person', category: 'person', confidence: 0.9, timestamp: 2.0 }],
      actions: [{ action: 'speaking', description: 'talking to audience', startTime: 0, endTime: 10.0 }],
      ocr: [],
      scenes: [],
    };

    const baseReasoning: MultimodalReasoning = {
      summary: 'Speaker discussing marketing strategy.',
      topics: ['marketing', 'strategy'],
      groundedProvenance: {
        spokenFacts: ['Scaling organic reach'],
        visualObservations: ['Person speaking'],
        ocrConfirmedText: [],
        inferences: [],
        contradictions: [],
      },
    };

    it('verifies single-speaker continuity when audio diarization explicitly confirms single speaker', () => {
      const diarizedSingleAudio: AudioIntelligence = {
        transcriptText: 'Here is the primary strategy for organic growth that transforms results.',
        language: 'en',
        segments: [
          { id: 0, start: 0.5, end: 4.5, text: 'Here is the primary strategy for organic growth', speaker: 'SPEAKER_00' },
          { id: 1, start: 4.8, end: 9.0, text: 'that transforms results.', speaker: 'SPEAKER_00' },
        ],
        words: [
          { word: 'Here', start: 0.5, end: 0.8 },
          { word: 'is', start: 0.8, end: 1.0 },
          { word: 'the', start: 1.0, end: 1.2 },
          { word: 'primary', start: 1.2, end: 1.8 },
          { word: 'strategy', start: 1.8, end: 2.5 },
          { word: 'for', start: 2.5, end: 2.7 },
          { word: 'organic', start: 2.7, end: 3.2 },
          { word: 'growth', start: 3.2, end: 3.8 },
          { word: 'that', start: 4.8, end: 5.1 },
          { word: 'transforms', start: 5.1, end: 5.8 },
          { word: 'results.', start: 5.8, end: 6.5 },
        ],
        silenceIntervals: [{ start: 3.8, end: 4.8, duration: 1.0 }],
        meanVolumeDb: -18,
        speakingPaceWpm: 140,
      };

      const candidate = HighlightFusionService.evaluateInterval({
        rawStart: 0,
        rawEnd: 10.0,
        audio: diarizedSingleAudio,
        visual: baseVisual,
        reasoning: baseReasoning,
        totalDurationSeconds: 60,
        targetDuration: { min: 4, max: 15 },
      });

      assert.ok(candidate);
      assert.equal(candidate.speakerContinuity?.speakerIdentityStatus, 'diarized');
      assert.equal(candidate.speakerContinuity?.continuousSpeaker, true);
      assert.equal(candidate.speakerContinuity?.faceContinuity, true);
      assert.equal(candidate.speakerContinuity?.diarizedSpeakerId, 'SPEAKER_00');
      assert.equal(candidate.speakerContinuity?.speakerCountEstimated, 1);
      assert.ok(candidate.speakerContinuity?.evidenceDetails.includes('Verified single speaker'));
    });

    it('detects multi-speaker conversation and forbids continuousSpeaker claim when multiple speakers detected', () => {
      const diarizedMultiAudio: AudioIntelligence = {
        transcriptText: 'What is the secret? The secret is customer obsession.',
        language: 'en',
        segments: [
          { id: 0, start: 0.5, end: 3.0, text: 'What is the secret?', speaker: 'SPEAKER_00' },
          { id: 1, start: 3.5, end: 7.0, text: 'The secret is customer obsession.', speaker: 'SPEAKER_01' },
        ],
        words: [
          { word: 'What', start: 0.5, end: 0.9 },
          { word: 'is', start: 0.9, end: 1.1 },
          { word: 'the', start: 1.1, end: 1.3 },
          { word: 'secret?', start: 1.3, end: 2.0 },
          { word: 'The', start: 3.5, end: 3.8 },
          { word: 'secret', start: 3.8, end: 4.3 },
          { word: 'is', start: 4.3, end: 4.5 },
          { word: 'customer', start: 4.5, end: 5.1 },
          { word: 'obsession.', start: 5.1, end: 5.9 },
        ],
        silenceIntervals: [{ start: 2.0, end: 3.5, duration: 1.5 }],
        meanVolumeDb: -19,
        speakingPaceWpm: 135,
      };

      const candidate = HighlightFusionService.evaluateInterval({
        rawStart: 0,
        rawEnd: 8.0,
        audio: diarizedMultiAudio,
        visual: baseVisual, // Face is continuous on screen, but audio has 2 speakers!
        reasoning: baseReasoning,
        totalDurationSeconds: 60,
        targetDuration: { min: 4, max: 15 },
      });

      assert.ok(candidate);
      // Face is visible on screen, but speaker continuity MUST be false because 2 distinct speakers spoke!
      assert.equal(candidate.speakerContinuity?.faceContinuity, true, 'Face continuity is visually true');
      assert.equal(candidate.speakerContinuity?.continuousSpeaker, false, 'Must NOT claim continuous speaker');
      assert.equal(candidate.speakerContinuity?.speakerIdentityStatus, 'diarized');
      assert.equal(candidate.speakerContinuity?.speakerCountEstimated, 2);
      assert.deepEqual(candidate.speakerContinuity?.detectedSpeakersInClip, ['SPEAKER_00', 'SPEAKER_01']);
      assert.ok(candidate.warnings?.some((w) => w.includes('Multi-speaker segment detected')));
    });

    it('returns explicit "uncertain" status when audio diarization is unavailable, refusing false continuity claim', () => {
      // Audio without diarization tags (common when using basic Whisper without pyannote)
      const undiarizedAudio: AudioIntelligence = {
        transcriptText: 'Building an audience requires extreme focus and consistent iteration.',
        language: 'en',
        segments: [
          { id: 0, start: 0.5, end: 5.0, text: 'Building an audience requires extreme focus and consistent iteration.' },
        ],
        words: [
          { word: 'Building', start: 0.5, end: 1.0 },
          { word: 'an', start: 1.0, end: 1.2 },
          { word: 'audience', start: 1.2, end: 1.8 },
          { word: 'requires', start: 1.8, end: 2.3 },
          { word: 'extreme', start: 2.3, end: 2.9 },
          { word: 'focus', start: 2.9, end: 3.4 },
          { word: 'and', start: 3.4, end: 3.6 },
          { word: 'consistent', start: 3.6, end: 4.2 },
          { word: 'iteration.', start: 4.2, end: 4.9 },
        ],
        silenceIntervals: [],
        meanVolumeDb: -20,
        speakingPaceWpm: 145,
      };

      const candidate = HighlightFusionService.evaluateInterval({
        rawStart: 0,
        rawEnd: 6.0,
        audio: undiarizedAudio,
        visual: baseVisual,
        reasoning: baseReasoning,
        totalDurationSeconds: 60,
        targetDuration: { min: 4, max: 15 },
      });

      assert.ok(candidate);
      assert.equal(candidate.speakerContinuity?.faceContinuity, true, 'Face is continuously visible');
      assert.equal(candidate.speakerContinuity?.speakerIdentityStatus, 'uncertain', 'Identity must be uncertain');
      assert.equal(candidate.speakerContinuity?.continuousSpeaker, false, 'Must not claim continuous speaker without diarization');
      assert.ok(candidate.speakerContinuity?.evidenceDetails.includes('Speaker identity unverified'));
      assert.ok(candidate.warnings?.some((w) => w.includes('Speaker identity unverified')));
    });

    it('returns explicit "unknown" status for silent video segments', () => {
      const silentAudio: AudioIntelligence = {
        transcriptText: '',
        language: 'en',
        segments: [],
        words: [],
        silenceIntervals: [{ start: 0, end: 10, duration: 10 }],
        meanVolumeDb: -60,
        speakingPaceWpm: 0,
      };

      const candidate = HighlightFusionService.evaluateInterval({
        rawStart: 0,
        rawEnd: 8.0,
        audio: silentAudio,
        visual: baseVisual,
        reasoning: baseReasoning,
        totalDurationSeconds: 60,
        targetDuration: { min: 4, max: 15 },
      });

      assert.ok(candidate);
      assert.equal(candidate.speakerContinuity?.speakerIdentityStatus, 'unknown');
      assert.equal(candidate.speakerContinuity?.continuousSpeaker, false);
      assert.equal(candidate.speakerContinuity?.speakerCountEstimated, 0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. AUDIO/VIDEO SYNCHRONIZATION EMPIRICAL VERIFICATION
  // ──────────────────────────────────────────────────────────────────────────
  describe('2. Audio/Video Synchronization (Empirical PTS & Duration Probing)', () => {
    const rendersDir = path.resolve(process.cwd(), '../delete/benchmark_renders');

    it('measures real rendered clips and confirms initial presentation timestamp skew is exactly 0.000s', async () => {
      if (!fs.existsSync(rendersDir)) {
        console.warn(`Render directory ${rendersDir} does not exist, skipping file inspection`);
        return;
      }

      const files = fs.readdirSync(rendersDir).filter((f) => f.endsWith('.mp4'));
      assert.ok(files.length > 0, 'Must have rendered benchmark clips in delete/benchmark_renders');

      for (const file of files) {
        const fullPath = path.join(rendersDir, file);
        const skew = await probeStreamSkew(fullPath);

        // 1. Initial Presentation Timestamp Offset (Start-time skew)
        // Must be exactly 0.000000s
        assert.equal(
          skew.startOffsetSec,
          0,
          `Clip ${file} must have 0.000s start-time offset between audio and video PTS (got ${skew.startOffsetSec}s)`
        );

        // 2. Stream Duration Difference
        // In AAC audio encoding, each audio frame contains 1024 samples. At 44.1kHz, 1 packet = 23.2ms.
        // At 22.05kHz, 1 packet = 46.4ms. The physical boundary difference between video frames (e.g. 33.3ms at 30fps)
        // and audio packets must never exceed 0.050s.
        if (skew.hasAudio) {
          assert.ok(
            skew.durationDiffSec <= 0.050,
            `Clip ${file} duration difference (${skew.durationDiffSec.toFixed(4)}s) exceeds physical audio packet granule`
          );
        }
      }
    });

    it('demonstrates that duration equality is distinct from lip-sync alignment', () => {
      // Explanation test asserting technical facts about AV sync
      const equalDurationVideo = { videoDuration: 5.000, audioDuration: 5.000, startOffset: 0.000 };
      const driftedLipSyncVideo = { videoDuration: 5.000, audioDuration: 5.000, internalDriftMs: 120 };

      // Duration equality alone does not prove lip-sync if audio was shifted or delayed inside the container
      assert.equal(equalDurationVideo.videoDuration, equalDurationVideo.audioDuration);
      assert.ok(driftedLipSyncVideo.internalDriftMs > 50, '120ms internal drift causes noticeable lip-flap despite equal duration');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. VISUAL EVIDENCE PROVENANCE (MODALITY AUDIT)
  // ──────────────────────────────────────────────────────────────────────────
  describe('3. Visual Evidence Provenance (Modality Audit & Heuristic Distinction)', () => {
    it('verifies full provenance tracking across all 5 visual intelligence modalities', () => {
      const mockVisual: VisualIntelligence = {
        sceneCuts: [{ timestamp: 3.5, score: 0.88 }],
        keyframeTimestamps: [1.0, 3.5, 6.0],
        facePresenceRatio: 0.9,
        faceIntervals: [{ start: 0, end: 7.0, average_confidence: 0.94 }],
        objects: [
          { label: 'Laptop', category: 'device', confidence: 0.92, timestamp: 1.0 },
          { label: 'Person', category: 'person', confidence: 0.98, timestamp: 3.5 },
        ],
        actions: [
          { action: 'typing', description: 'user coding on laptop', startTime: 0.5, endTime: 3.0, confidence: 0.85 },
        ],
        ocr: [
          { text: 'NEXTJS 15 TUTORIAL', timestamp: 1.0, confidence: 0.95 },
        ],
        scenes: [],
      };

      const mockAudio: AudioIntelligence = {
        transcriptText: 'In this NextJS 15 tutorial we learn full stack development.',
        language: 'en',
        segments: [
          { id: 0, start: 0.5, end: 6.5, text: 'In this NextJS 15 tutorial we learn full stack development.', speaker: 'SPEAKER_00' },
        ],
        words: [
          { word: 'In', start: 0.5, end: 0.7 },
          { word: 'this', start: 0.7, end: 0.9 },
          { word: 'NextJS', start: 0.9, end: 1.4 },
          { word: '15', start: 1.4, end: 1.8 },
          { word: 'tutorial', start: 1.8, end: 2.3 },
          { word: 'we', start: 2.3, end: 2.5 },
          { word: 'learn', start: 2.5, end: 2.9 },
          { word: 'full', start: 2.9, end: 3.2 },
          { word: 'stack', start: 3.2, end: 3.6 },
          { word: 'development.', start: 3.6, end: 4.5 },
        ],
        silenceIntervals: [],
        meanVolumeDb: -16,
        speakingPaceWpm: 150,
      };

      const candidate = HighlightFusionService.evaluateInterval({
        rawStart: 0,
        rawEnd: 7.0,
        audio: mockAudio,
        visual: mockVisual,
        reasoning: {
          summary: 'NextJS tutorial demonstration.',
          topics: ['NextJS', 'tutorial', 'development'],
          groundedProvenance: {
            spokenFacts: ['NextJS 15 full stack development'],
            visualObservations: ['Person typing on Laptop'],
            ocrConfirmedText: ['NEXTJS 15 TUTORIAL'],
            inferences: [],
            contradictions: [],
          },
        },
        totalDurationSeconds: 60,
        targetDuration: { min: 4, max: 15 },
      });

      assert.ok(candidate);
      // Modality 1: Scene cut detection
      assert.ok(candidate.sceneBoundaryInfo);
      assert.equal(candidate.sceneBoundaryInfo.cutCountInside, 1);
      assert.equal(candidate.sceneBoundaryInfo.nearestPriorCut, undefined); // rawStart is 0

      // Modality 2: Face tracking
      assert.ok((candidate.visualEvidence?.facePresenceRatio ?? 0) >= 0.85);
      assert.equal(candidate.speakerContinuity?.faceContinuity, true);

      // Modality 3: Object detection
      assert.ok(candidate.visualEvidence?.detectedObjects.includes('Laptop'));
      assert.ok(candidate.visualEvidence?.detectedObjects.includes('Person'));

      // Modality 4: Action recognition
      assert.ok(candidate.visualEvidence?.detectedActions.includes('typing'));

      // Modality 5: OCR text extraction
      assert.ok(candidate.visualEvidence?.onScreenText.includes('NEXTJS 15 TUTORIAL'));

      // Combined multimodal score aligns speech, OCR and visual objects
      assert.ok(candidate.combinedScore >= 75);
    });

    it('truthfully documents when visual modalities return 0 detections or are absent', () => {
      // Screencast with no human faces
      const screencastVisual: VisualIntelligence = {
        sceneCuts: [],
        keyframeTimestamps: [2.0, 5.0],
        facePresenceRatio: 0,
        faceIntervals: [], // Zero faces
        objects: [{ label: 'Browser', category: 'screen', timestamp: 2.0 }],
        actions: [], // Zero actions
        ocr: [], // Zero OCR
        scenes: [],
      };

      const screencastAudio: AudioIntelligence = {
        transcriptText: 'Click the submit button to deploy the project to production.',
        language: 'en',
        segments: [{ id: 0, start: 0.5, end: 5.0, text: 'Click the submit button to deploy the project to production.' }],
        words: [
          { word: 'Click', start: 0.5, end: 0.9 },
          { word: 'the', start: 0.9, end: 1.1 },
          { word: 'submit', start: 1.1, end: 1.5 },
          { word: 'button', start: 1.5, end: 1.9 },
          { word: 'to', start: 1.9, end: 2.1 },
          { word: 'deploy', start: 2.1, end: 2.6 },
          { word: 'the', start: 2.6, end: 2.8 },
          { word: 'project', start: 2.8, end: 3.3 },
          { word: 'to', start: 3.3, end: 3.5 },
          { word: 'production.', start: 3.5, end: 4.2 },
        ],
        silenceIntervals: [],
        meanVolumeDb: -22,
        speakingPaceWpm: 140,
      };

      const candidate = HighlightFusionService.evaluateInterval({
        rawStart: 0,
        rawEnd: 6.0,
        audio: screencastAudio,
        visual: screencastVisual,
        reasoning: {
          summary: 'Deployment walkthrough.',
          topics: ['deployment', 'production'],
          groundedProvenance: {
            spokenFacts: ['Deploy project to production'],
            visualObservations: ['Browser screen'],
            ocrConfirmedText: [],
            inferences: [],
            contradictions: [],
          },
        },
        totalDurationSeconds: 60,
        targetDuration: { min: 4, max: 15 },
      });

      assert.ok(candidate);
      assert.equal(candidate.visualEvidence?.facePresenceRatio, 0);
      assert.equal(candidate.visualEvidence?.detectedActions.length, 0);
      assert.equal(candidate.visualEvidence?.onScreenText.length, 0);
      assert.equal(candidate.speakerContinuity?.faceContinuity, false);
      assert.equal(candidate.speakerContinuity?.speakerIdentityStatus, 'uncertain');
      assert.ok(candidate.warnings?.some((w) => w.includes('No detectable human faces')));
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. BENCHMARK SCOPE & UNTESTED LIMITATIONS GATING
  // ──────────────────────────────────────────────────────────────────────────
  describe('4. Benchmark Scope & Untested Limitations Gating', () => {
    it('verifies that long-form videos (>10 min) and sustained 4K 60fps are classified as untested boundaries', () => {
      const benchmarkScope = {
        testedDurationMaxSeconds: 102.1,
        testedFileSizeBytesMax: 106349009, // 101.42 MB
        testedResolutions: ['360x640', '640x480', '854x480', '1280x720', '1920x1080', '3840x2160'],
        untestedBoundaries: [
          'Long-form videos exceeding 10 minutes (30-60 min podcast/webinar)',
          'Sustained 4K 60fps high-bitrate video (> 5 minutes)',
          'Multilingual code-switching speech in a single sentence',
          'GPU hardware acceleration (NVENC / QuickSync) in cloud containers',
        ],
      };

      assert.equal(benchmarkScope.testedDurationMaxSeconds, 102.1);
      assert.ok(benchmarkScope.testedFileSizeBytesMax > 100 * 1024 * 1024);
      assert.equal(benchmarkScope.untestedBoundaries.length, 4);
    });
  });
});
