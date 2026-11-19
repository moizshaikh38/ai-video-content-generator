import {workLifecycle} from '../queue/workLifecycle.js';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { getRenderFfmpeg } from '../../utils/drawtextFfmpeg.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import {
  VideoIntelligenceRecord,
  AnalyzeVideoOptions,
  SourceIdentity,
  VideoContainerMetadata,
  AudioIntelligence,
  VisualIntelligence,
  MultimodalReasoning,
  ClippingHighlightRecommendation,
  SubtitleHandoffData,
  GroundedScene,
} from '../../types/index.js';
import {
  VideoIntelligenceRepository,
  CURRENT_ENGINE_VERSION,
} from '../../db/repositories/videoIntelligenceRepository.js';
import { VideoSceneService } from '../multimodal/videoSceneService.js';
import { AudioFeatureService } from '../multimodal/audioFeatureService.js';
import { FaceFeatureService } from '../multimodal/faceFeatureService.js';
import { OpenRouterTranscriptionProvider } from '../transcription/openRouterTranscriptionProvider.js';
import { assertStandaloneTranscriptionAllowed } from '../transcription/tierTranscriptionPolicy.js';
import { GroqTranscriptionProvider } from '../transcription/groqTranscriptionProvider.js';
import { HighlightFusionService } from './highlightFusionService.js';
import { extractAudioFromVideo } from '../audioExtractionService.js';

// fluent-ffmpeg's setFfmpegPath writes a process-wide module cache; use the
// shared drawtext-aware resolution so import order cannot leave the render
// paths on the drawtext-lacking bundled binary.
ffmpeg.setFfmpegPath(getRenderFfmpeg());
const probeBinary = (ffprobeStatic as any)?.path || (ffprobeStatic as any)?.default?.path || ffprobeStatic;
if (probeBinary && typeof probeBinary === 'string') {
  ffmpeg.setFfprobePath(probeBinary);
}

export class VideoIntelligenceService {
  /**
   * Computes video container metadata using FFprobe.
   */
  public static async probeMetadata(videoPath: string): Promise<VideoContainerMetadata> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) return reject(new Error(`FFprobe inspection failed: ${err.message}`));

        const vs = metadata.streams.find((s) => s.codec_type === 'video');
        const as = metadata.streams.find((s) => s.codec_type === 'audio');

        const duration = Number(metadata.format.duration) || 0;
        const width = vs?.width || 1920;
        const height = vs?.height || 1080;
        const aspectRatio = vs?.display_aspect_ratio || (width && height ? `${width}:${height}` : '16:9');
        let fps = 30;
        if (vs?.r_frame_rate) {
          const parts = vs.r_frame_rate.split('/');
          if (parts.length === 2 && Number(parts[1]) > 0) {
            fps = Math.round(Number(parts[0]) / Number(parts[1]));
          }
        }

        resolve({
          durationSeconds: duration,
          width,
          height,
          aspectRatio,
          fps,
          hasAudio: Boolean(as),
          audioCodec: as?.codec_name,
          audioSampleRate: as?.sample_rate ? Number(as.sample_rate) : undefined,
          videoCodec: vs?.codec_name,
          bitrateKbps: metadata.format.bit_rate ? Math.round(Number(metadata.format.bit_rate) / 1000) : undefined,
        });
      });
    });
  }

  /**
   * Helper to compute full-content SHA-256 using chunked streaming read.
   * Reads in 4MB chunks via fs.readSync so memory overhead is capped at 4MB even for gigabyte files.
   */
  public static computeFullContentSha256(videoPath: string): string {
    const stat = fs.statSync(videoPath);
    const size = stat.size;
    const hasher = crypto.createHash('sha256');
    const fd = fs.openSync(videoPath, 'r');
    try {
      const chunkSize = 4 * 1024 * 1024; // 4MB chunk
      const buf = Buffer.alloc(Math.min(size, chunkSize));
      let pos = 0;
      let bytesRead = 0;
      while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, pos)) > 0) {
        hasher.update(buf.subarray(0, bytesRead));
        pos += bytesRead;
      }
    } finally {
      fs.closeSync(fd);
    }
    return hasher.digest('hex');
  }

  /**
   * Computes authoritative cryptographic source identity based on 100% of the complete file content.
   * - If precomputed fullContentSha256 is provided (from Cloudflare R2 upload/download ingestion stream),
   *   uses it directly with ZERO additional file reads.
   * - Otherwise, computes full-content SHA-256 via chunked streaming read.
   * - Verification level is ALWAYS 'FULL_CONTENT_SHA256'. Sampled fingerprints are strictly barred
   *   from authorizing transcript reuse or cache reuse.
   */
  public static computeSourceIdentity(
    videoPath: string,
    options: {
      userId: string;
      engineVersion?: string;
      metadata: VideoContainerMetadata;
      fullContentSha256?: string;
      strictFullStreamHash?: boolean;
    }
  ): SourceIdentity {
    const stat = fs.statSync(videoPath);
    const size = stat.size;
    const engineVersion = options.engineVersion || CURRENT_ENGINE_VERSION;
    const userId = options.userId;

    // Use precomputed full-content SHA-256 from R2 stream if available, else compute via chunked stream
    const rawContentHash = options.fullContentSha256 || this.computeFullContentSha256(videoPath);

    const tenantHash = crypto
      .createHash('sha256')
      .update(`tenant:${userId}|engine:${engineVersion}|full_sha256:${rawContentHash}`)
      .digest('hex');

    return {
      sourceHash: tenantHash,
      rawContentHash,
      verificationLevel: 'FULL_CONTENT_SHA256',
      strategy: 'full_stream',
      fileSizeBytes: size,
      containerSignature: options.metadata,
      engineVersion,
      verifiedAt: new Date(),
    };
  }

  /**
   * Performs Authoritative Source Verification before allowing cached intelligence reuse.
   * Enforces 100% full-content cryptographic verification:
   * 1. File size must match exactly.
   * 2. Container duration and resolution must match.
   * 3. Stored verificationLevel must be 'FULL_CONTENT_SHA256' (sampled fingerprints are NEVER permitted).
   * 4. Complete full-content SHA-256 must match byte-for-byte.
   */
  public static async verifyAuthoritativeSourceMatch(
    videoPath: string,
    existingRecord: VideoIntelligenceRecord,
    currentMetadata?: VideoContainerMetadata,
    candidateFullSha256?: string
  ): Promise<{ isMatch: boolean; reason?: string }> {
    if (!fs.existsSync(videoPath)) {
      return { isMatch: false, reason: 'Source video file does not exist on disk' };
    }

    const stat = fs.statSync(videoPath);
    if (stat.size !== existingRecord.source_identity.fileSizeBytes) {
      return {
        isMatch: false,
        reason: `File size mismatch: current ${stat.size} vs recorded ${existingRecord.source_identity.fileSizeBytes}`,
      };
    }

    const meta = currentMetadata || (await this.probeMetadata(videoPath));
    const recMeta = existingRecord.metadata;

    // Check duration tolerance (< 0.05s)
    if (Math.abs(meta.durationSeconds - recMeta.durationSeconds) > 0.05) {
      return {
        isMatch: false,
        reason: `Duration mismatch: current ${meta.durationSeconds.toFixed(2)}s vs recorded ${recMeta.durationSeconds.toFixed(2)}s`,
      };
    }

    // Check dimensions
    if (meta.width !== recMeta.width || meta.height !== recMeta.height) {
      return {
        isMatch: false,
        reason: `Resolution mismatch: current ${meta.width}x${meta.height} vs recorded ${recMeta.width}x${recMeta.height}`,
      };
    }

    // Mandatory gate: Sampled fingerprints must NEVER authorize transcript reuse or cache reuse
    if (existingRecord.source_identity.verificationLevel !== 'FULL_CONTENT_SHA256') {
      return {
        isMatch: false,
        reason: 'Sampled fingerprints cannot authorize reuse. Complete full-content SHA-256 required.',
      };
    }

    // Cryptographic full-content verification
    const currentSha256 = candidateFullSha256 || this.computeFullContentSha256(videoPath);
    if (currentSha256 !== existingRecord.source_identity.rawContentHash) {
      return {
        isMatch: false,
        reason: 'Full-content SHA-256 hash mismatch: file content altered.',
      };
    }

    return { isMatch: true };
  }

  /**
   * Main entry point: Gets existing valid intelligence or runs a single-pass analysis.
   * Completely decoupled from any controller or specific consumer feature.
   */
  public static async getOrAnalyzeVideo(
    options: AnalyzeVideoOptions
  ): Promise<VideoIntelligenceRecord> {
    const { userId, videoPath, forceRefresh } = options;
    const workerId = `worker_${process.pid}_${Date.now()}`;

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    // Step 1: Probe container metadata
    const metadata = await this.probeMetadata(videoPath);

    // Step 2: Compute cryptographic source identity (100% full content SHA-256)
    const identity = this.computeSourceIdentity(videoPath, {
      userId,
      metadata,
      fullContentSha256: options.fullContentSha256,
      strictFullStreamHash: options.strictFullStreamHash,
    });

    // Step 3: Check cache if not force refresh
    if (!forceRefresh) {
      const existing = await VideoIntelligenceRepository.findBySourceHash(userId, identity.sourceHash);

      if (existing && existing.status === 'completed') {
        // Authoritative verification check
        const verifyCheck = await this.verifyAuthoritativeSourceMatch(videoPath, existing, metadata);
        if (verifyCheck.isMatch) {
          logger.info(`[VideoIntelligenceService] Cache hit: Authoritative source verified for ${identity.sourceHash.slice(0, 16)}...`);
          return existing;
        } else {
          logger.warn(`[VideoIntelligenceService] Cache mismatch rejected (${verifyCheck.reason}). Invalidating stale cache.`);
          await VideoIntelligenceRepository.invalidateCache(userId, identity.sourceHash);
        }
      }
    }

    // Step 4: Acquire atomic lease
    const lease = await VideoIntelligenceRepository.acquireLease(
      userId,
      identity.sourceHash,
      workerId,
      {
        source_video_url: options.sourceUrl,
        source_identity: identity,
        metadata,
      }
    );

    if (!lease.acquired) {
      if (lease.isExistingCompleted) {
        return lease.record;
      }
      logger.info(`[VideoIntelligenceService] Another worker currently processing job ${lease.record.id}`);
      return lease.record;
    }

    const jobRecord = lease.record;
    const leaseToken = lease.leaseToken || lease.record.lease_token || workerId;
    let leaseLost = false;

    // Automatic worker heartbeat renewal (every 60 seconds in production, configurable for testing)
    const heartbeatIntervalMs = options.heartbeatIntervalMs || 60_000;
    const heartbeatTimer = setInterval(() => {void workLifecycle.run('intelligence-heartbeat',async()=>{
      try {
        const renewed = await VideoIntelligenceRepository.renewLease(
          jobRecord.id,
          userId,
          workerId,
          leaseToken
        );
        if (!renewed) {
          logger.warn(`[VideoIntelligenceService] Heartbeat renewal failed for worker ${workerId}: lease expired or overtaken.`);
          leaseLost = true;
          clearInterval(heartbeatTimer);
        }
      } catch (hbErr: any) {
        logger.warn(`[VideoIntelligenceService] Heartbeat renewal error: ${hbErr.message}`);
      }
    }).catch(error=>logger.warn('Heartbeat stopped before admission',{error:String(error)}));}, heartbeatIntervalMs);
    heartbeatTimer.unref?.();

    // Step 5: Execute Single-Pass Intelligence Analysis
    try {
      logger.info(`[VideoIntelligenceService] Executing single-pass analysis for job ${jobRecord.id}`);

      // 5A: Audio Intelligence
      let audioResult: AudioIntelligence = {
        transcriptText: options.existingTranscript?.text || '',
        language: options.existingTranscript?.language || 'en',
        segments: options.existingTranscript?.segments || [],
        words: [],
        silenceIntervals: [],
        meanVolumeDb: -24,
        speakingPaceWpm: 0,
      };

      if (metadata.hasAudio) {
        // Run audio silence and volume analysis in parallel
        const [silences, volStats] = await Promise.all([
          AudioFeatureService.detectSilenceIntervals(videoPath, -30, 0.3).catch(() => []),
          AudioFeatureService.detectAudioVolume(videoPath).catch(() => ({ mean_volume_db: -24, max_volume_db: 0 })),
        ]);

        audioResult.silenceIntervals = silences;
        audioResult.meanVolumeDb = volStats.mean_volume_db;

        // If no existing transcript provided, transcribe audio
        if (!audioResult.transcriptText) {
          // Outside the legacy catch: never silently skip this policy failure
          // and mark a transcript-less intelligence result complete.
          assertStandaloneTranscriptionAllowed(config.tieredTranscriptionEnabled);
          try {
            const extracted = await extractAudioFromVideo(videoPath, 'source.mp4', {
              durationHintSec: metadata.durationSeconds,
            });
            try {
              const provider = config.transcriptionProvider === 'groq' && config.groqApiKey
                ? new GroqTranscriptionProvider()
                : new OpenRouterTranscriptionProvider();

              const trResult = await provider.transcribeAudio(extracted.audioBuffer, 'source_audio.mp3', 'audio/mp3');
              audioResult.transcriptText = trResult.text;
              audioResult.language = trResult.language;
              audioResult.segments = trResult.segments.map((s, idx) => ({
                id: idx,
                start: s.start,
                end: s.end,
                text: s.text,
                words: (s.words || []).map((w) => ({ word: w.word, start: w.start, end: w.end })),
              }));
              audioResult.words = (trResult.words || trResult.segments.flatMap((s) => s.words || [])).map((w) => ({
                word: w.word,
                start: w.start,
                end: w.end,
              }));
            } finally {
              extracted.cleanup();
            }
          } catch (trErr: any) {
            logger.warn(`[VideoIntelligenceService] Audio transcription fallback: ${trErr.message}`);
          }
        }
      }

      const wordCount = audioResult.transcriptText.trim().split(/\s+/).filter(Boolean).length;
      audioResult.speakingPaceWpm = metadata.durationSeconds > 0 ? Math.round((wordCount / (metadata.durationSeconds / 60))) : 0;

      // 5B: Visual Scene Cuts & Keyframes (duration-aware timeout scaling)
      const sceneTimeoutMs = Math.max(90000, Math.ceil(metadata.durationSeconds * 300));
      const sceneCuts = await VideoSceneService.detectSceneCuts(videoPath, 0.25, sceneTimeoutMs).catch(() => []);
      const cutTimestamps = sceneCuts.map((c) => c.timestamp);
      const keyframeLimit = options.maxKeyframes || 4;

      const { keyframes, cleanup } = await VideoSceneService.extractKeyframes({
        videoPath,
        timestamps: cutTimestamps,
        maxKeyframes: keyframeLimit,
        videoDuration: metadata.durationSeconds,
        width: 640,
        height: 360,
      });

      // 5C: Face Detection
      let faceRatio = 0;
      let faceIntervals: any[] = [];
      try {
        const faceTimeoutMs = Math.max(90000, Math.ceil(metadata.durationSeconds * 600));
        const faceResult = await FaceFeatureService.analyzeFacePresence(videoPath, metadata.durationSeconds, 1.0, faceTimeoutMs);
        faceRatio = faceResult.face_presence_ratio;
        faceIntervals = faceResult.intervals || [];
      } catch (faceErr: any) {
        logger.warn(`[VideoIntelligenceService] Face detection notice: ${faceErr.message}`);
      }

      // 5D: Multimodal Vision & OCR Reasoning
      let multimodalReasoning: MultimodalReasoning;
      let detectedObjects: any[] = [];
      let detectedActions: any[] = [];
      let detectedOcr: any[] = [];

      try {
        const visionResult = await this.executeVisionReasoning({
          keyframes: keyframes.filter((k) => !!k.storage_path).map((k) => ({ timestamp: k.timestamp, filePath: k.storage_path! })),
          transcript: audioResult.transcriptText,
          metadata,
          visionModel: options.visionModel || config.openrouterTextModel || 'openai/gpt-4o-mini',
        });

        multimodalReasoning = {
          summary: visionResult.summary || 'Video content analysis',
          topics: visionResult.topics || [],
          groundedProvenance: {
            spokenFacts: visionResult.provenance?.spokenFacts || visionResult.provenance?.spoken_facts || [],
            visualObservations: visionResult.provenance?.visualObservations || visionResult.provenance?.visual_facts || [],
            ocrConfirmedText: visionResult.provenance?.ocrConfirmedText || visionResult.provenance?.ocr_facts || [],
            inferences: visionResult.provenance?.inferences || [],
            contradictions: visionResult.provenance?.contradictions || [],
          },
          suggestedThumbnailDirections: visionResult.thumbnail_directions || [],
        };
        detectedObjects = visionResult.objects || [];
        detectedActions = visionResult.actions || [];
        detectedOcr = visionResult.ocr || [];
      } catch (visErr: any) {
        logger.warn(`[VideoIntelligenceService] Vision reasoning fallback: ${visErr.message}`);
        multimodalReasoning = {
          summary: audioResult.transcriptText ? audioResult.transcriptText.slice(0, 150) : 'Visual recording',
          topics: ['general_content'],
          groundedProvenance: {
            spokenFacts: audioResult.transcriptText ? [audioResult.transcriptText.slice(0, 100)] : [],
            visualObservations: [],
            ocrConfirmedText: [],
            inferences: [],
            contradictions: [],
          },
        };
      } finally {
        cleanup();
      }

      // 5E: Construct Grounded Scenes
      const boundaries = [0, ...sceneCuts.map((c) => c.timestamp), metadata.durationSeconds]
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort((a, b) => a - b);

      const groundedScenes: GroundedScene[] = [];
      for (let i = 0; i < boundaries.length - 1; i++) {
        const sStart = boundaries[i];
        const sEnd = boundaries[i + 1];
        const sDur = sEnd - sStart;
        if (sDur < 0.2) continue;

        const sceneDialogue = audioResult.segments
          .filter((seg) => seg.start < sEnd && seg.end > sStart)
          .map((seg) => seg.text)
          .join(' ');

        const sceneObjects = detectedObjects
          .filter((obj) => obj.timestamp >= sStart && obj.timestamp <= sEnd)
          .map((obj) => obj.label);

        const sceneOcr = detectedOcr
          .filter((o) => o.timestamp >= sStart && o.timestamp <= sEnd)
          .map((o) => o.text);

        const hasFaceInScene = faceIntervals.some((fi) => fi.start < sEnd && fi.end > sStart);

        groundedScenes.push({
          index: i,
          startTime: sStart,
          endTime: sEnd,
          duration: sDur,
          hasFace: hasFaceInScene,
          dominantObjects: Array.from(new Set(sceneObjects)),
          onScreenText: Array.from(new Set(sceneOcr)),
          transcriptDialogue: sceneDialogue,
          isActionHeavy: sDur < 3.0,
        });
      }

      const visualResult: VisualIntelligence = {
        sceneCuts: sceneCuts.map((c) => ({ timestamp: c.timestamp, score: c.score })),
        keyframeTimestamps: keyframes.map((k) => k.timestamp),
        facePresenceRatio: faceRatio,
        faceIntervals,
        objects: detectedObjects,
        actions: detectedActions,
        ocr: detectedOcr,
        scenes: groundedScenes,
      };

      // 5F: Construct Downstream Adapters with Multimodal Highlight & Shot-Boundary Fusion
      const clippingRecs = this.buildClippingRecommendations(
        visualResult,
        audioResult,
        multimodalReasoning,
        metadata.durationSeconds
      );
      const subtitleHandoff = this.buildSubtitleHandoff(visualResult, audioResult, Boolean(options.existingTranscript));

      // Step 6: Mark Completed in MongoDB with lease ownership fencing
      if (leaseLost) {
        throw new Error(`LEASE_LOST: Worker ${workerId} lease expired or was taken over by another worker.`);
      }

      const updatedRecord = await VideoIntelligenceRepository.markCompleted(
        jobRecord.id,
        userId,
        {
          audio_intelligence: audioResult,
          visual_intelligence: visualResult,
          multimodal_reasoning: multimodalReasoning,
          clipping_recommendations: clippingRecs,
          subtitle_handoff: subtitleHandoff,
          metadata,
        },
        { workerId, leaseToken }
      );

      if (!updatedRecord) {
        throw new Error(`LEASE_LOST: Stale completion blocked. Worker ${workerId} lost lease token ownership.`);
      }

      return updatedRecord;
    } catch (err: any) {
      if (leaseLost || err.message?.includes('LEASE_LOST')) {
        logger.warn(`[VideoIntelligenceService] Job ${jobRecord.id} abandoned by worker ${workerId}: lease was lost. Abandoning safely without state mutation.`);
        throw err;
      }
      logger.error(`[VideoIntelligenceService] Job ${jobRecord.id} failed: ${err.message}`);
      await VideoIntelligenceRepository.markFailed(jobRecord.id, userId, err.message, { workerId, leaseToken });
      throw err;
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  /**
   * Subtitle Studio Consumer Handoff:
   * Returns transcript and visual safe margins. Instant reuse with 0 extra charges.
   */
  public static async getSubtitleStudioHandoff(
    userId: string,
    videoPath: string,
    options?: Partial<AnalyzeVideoOptions>
  ): Promise<{
    transcriptText: string;
    segments: any[];
    words: any[];
    handoff: SubtitleHandoffData;
    metadata: VideoContainerMetadata;
  }> {
    const record = await this.getOrAnalyzeVideo({
      userId,
      videoPath,
      priorityModality: 'audio_first',
      ...options,
    });

    return {
      transcriptText: record.audio_intelligence?.transcriptText || '',
      segments: record.audio_intelligence?.segments || [],
      words: record.audio_intelligence?.words || [],
      handoff: record.subtitle_handoff
        ? { ...record.subtitle_handoff, transcriptReused: true }
        : {
            recommendedPosition: 'bottom',
            safeMarginPercent: 12,
            detectedOcclusions: [],
            transcriptReused: true,
            language: record.audio_intelligence?.language || 'en',
          },
      metadata: record.metadata,
    };
  }

  /**
   * AI Content Studio Consumer Handoff:
   * Returns grounded provenance, OCR, topics, and visual thumbnail briefs.
   */
  public static async getContentStudioHandoff(
    userId: string,
    videoPath: string,
    options?: Partial<AnalyzeVideoOptions>
  ): Promise<{
    summary: string;
    topics: string[];
    groundedProvenance: any;
    ocrHeadings: string[];
    dominantObjects: string[];
    metadata: VideoContainerMetadata;
  }> {
    const record = await this.getOrAnalyzeVideo({
      userId,
      videoPath,
      ...options,
    });

    const ocrHeadings = record.visual_intelligence?.ocr?.map((o) => o.text) || [];
    const dominantObjects = record.visual_intelligence?.objects?.map((obj) => obj.label) || [];

    return {
      summary: record.multimodal_reasoning?.summary || '',
      topics: record.multimodal_reasoning?.topics || [],
      groundedProvenance: record.multimodal_reasoning?.groundedProvenance || {
        spokenFacts: [],
        visualObservations: [],
        ocrConfirmedText: [],
        inferences: [],
        contradictions: [],
      },
      ocrHeadings: Array.from(new Set(ocrHeadings)),
      dominantObjects: Array.from(new Set(dominantObjects)),
      metadata: record.metadata,
    };
  }

  /**
   * AI Video Clipping Consumer Handoff:
   * Returns scene highlights, shot cuts, and active-speaker framing recommendations.
   */
  public static async getClippingHandoff(
    userId: string,
    videoPath: string,
    options?: Partial<AnalyzeVideoOptions>
  ): Promise<{
    recommendations: ClippingHighlightRecommendation[];
    scenes: GroundedScene[];
    facePresenceRatio: number;
    metadata: VideoContainerMetadata;
  }> {
    const record = await this.getOrAnalyzeVideo({
      userId,
      videoPath,
      ...options,
    });

    return {
      recommendations: record.clipping_recommendations || [],
      scenes: record.visual_intelligence?.scenes || [],
      facePresenceRatio: record.visual_intelligence?.facePresenceRatio || 0,
      metadata: record.metadata,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // INTERNAL REASONING & ADAPTER HELPERS
  // ─────────────────────────────────────────────────────────────

  private static async executeVisionReasoning(params: {
    keyframes: Array<{ timestamp: number; filePath: string }>;
    transcript: string;
    metadata: VideoContainerMetadata;
    visionModel: string;
  }): Promise<any> {
    const apiKey = config.openrouterApiKey?.trim();
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured on the server.');
    }

    const contentParts: any[] = [
      {
        type: 'text',
        text: `You are the Vireo Video Intelligence multimodal vision engine.
Analyze the video keyframes and spoken dialogue.

METADATA:
Duration: ${params.metadata.durationSeconds.toFixed(1)}s, Resolution: ${params.metadata.width}x${params.metadata.height}

SPOKEN TRANSCRIPT:
${params.transcript ? `"""${params.transcript}"""` : 'No spoken audio / silent video.'}

Respond strictly with valid JSON conforming to this schema:
{
  "summary": "Concise 2-sentence summary",
  "topics": ["topic1", "topic2"],
  "objects": [{ "label": "Person", "category": "person", "confidence": 0.95, "timestamp": 0.0 }],
  "actions": [{ "action": "Demonstration", "description": "Presenter showing software", "startTime": 0.0, "endTime": 10.0, "confidence": 0.9 }],
  "ocr": [{ "text": "Exact Visible Heading", "timestamp": 5.0, "confidence": 0.9, "category": "heading" }],
  "provenance": {
    "spoken_facts": ["Facts strictly confirmed by dialogue"],
    "visual_facts": ["Things strictly observed in keyframes"],
    "ocr_facts": ["Text read from screen"],
    "inferences": ["Logical deductions"],
    "contradictions": []
  },
  "thumbnail_directions": ["High-contrast creator portrait with bold heading in top-left"]
}`,
      },
    ];

    for (const kf of params.keyframes) {
      if (fs.existsSync(kf.filePath)) {
        const imgBuffer = fs.readFileSync(kf.filePath);
        const b64 = imgBuffer.toString('base64');
        contentParts.push({
          type: 'text',
          text: `[Keyframe at timestamp: ${kf.timestamp.toFixed(1)}s]`,
        });
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${b64}`,
          },
        });
      }
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.appUrl || 'http://localhost:5173',
        'X-Title': 'Vireo Video Intelligence Engine',
      },
      body: JSON.stringify({
        model: params.visionModel,
        messages: [{ role: 'user', content: contentParts }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Vision model failed (${response.status}): ${errText}`);
    }

    const json = (await response.json()) as any;
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Vision model returned empty choices.');

    return JSON.parse(raw);
  }

  private static buildClippingRecommendations(
    visual: VisualIntelligence,
    audio: AudioIntelligence,
    reasoning: MultimodalReasoning,
    totalDuration: number
  ): ClippingHighlightRecommendation[] {
    return HighlightFusionService.generateHighlightCandidates({
      audio,
      visual,
      reasoning,
      totalDurationSeconds: totalDuration,
      targetDuration: { min: 10, max: 60, optimal: 30 },
      maxCandidates: 5,
    });
  }

  private static buildSubtitleHandoff(
    visual: VisualIntelligence,
    audio: AudioIntelligence,
    transcriptReused: boolean
  ): SubtitleHandoffData {
    const hasLowerThirds = visual.ocr.some((o) => {
      const lowerText = o.text.toLowerCase();
      return (
        lowerText.includes('subscribe') ||
        lowerText.includes('follow') ||
        lowerText.includes('episode') ||
        lowerText.includes('presented by')
      );
    });

    return {
      recommendedPosition: hasLowerThirds ? 'top' : 'bottom',
      safeMarginPercent: hasLowerThirds ? 18 : 12,
      detectedOcclusions: visual.ocr.map((o) => o.text).slice(0, 3),
      transcriptReused,
      language: audio.language || 'en',
    };
  }
}
