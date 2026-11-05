/**
 * Vireo AI Video Content Generator — Shared Video Intelligence Engine
 * Phase 2 Canonical Domain Types & Database Schemas
 */

export type VideoIntelligenceStatus = 'queued' | 'processing' | 'completed' | 'failed';

export type SourceVerificationLevel =
  | 'FULL_CONTENT_SHA256'
  | 'AUTHORITATIVE_VERIFIED'
  | 'MULTI_SECTOR_COMPOSITE'; // Deprecated legacy level; strictly barred from authorizing cache reuse

export type SourceHashStrategy = 'full_stream' | 'multi_sector_composite';

export type FramingSuitability = 'face_centered' | 'action_centered' | 'wide';

export type ClaimVerificationStatus =
  | 'TRANSCRIPT_SUPPORTED'
  | 'OCR_SUPPORTED'
  | 'VISUAL_SUPPORTED'
  | 'UNVERIFIED'
  | 'CONTRADICTED';

export interface VideoContainerMetadata {
  durationSeconds: number;
  width: number;
  height: number;
  aspectRatio: string;
  fps: number;
  hasAudio: boolean;
  audioCodec?: string;
  audioSampleRate?: number;
  videoCodec?: string;
  bitrateKbps?: number;
}

export interface SectorHashes {
  headSectorHash?: string;
  midSectorHash?: string;
  tailSectorHash?: string;
}

export interface SourceIdentity {
  sourceHash: string; // Primary tenant-isolated lookup key
  rawContentHash?: string; // Full-file cryptographic hash (when available)
  verificationLevel: SourceVerificationLevel;
  strategy: SourceHashStrategy;
  fileSizeBytes: number;
  sectorHashes?: SectorHashes;
  containerSignature: VideoContainerMetadata;
  engineVersion: string;
  verifiedAt: Date;
}

export interface AudioIntelligenceWord {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface AudioIntelligenceSegment {
  id?: number;
  start: number;
  end: number;
  text: string;
  speaker?: string; // Diarized speaker ID (e.g. 'SPEAKER_00', 'SPEAKER_01')
  words?: AudioIntelligenceWord[];
}

export interface AudioSilenceInterval {
  start: number;
  end: number;
  duration: number;
}

export interface AudioIntelligence {
  transcriptText: string;
  language: string;
  segments: AudioIntelligenceSegment[];
  words: AudioIntelligenceWord[];
  silenceIntervals: AudioSilenceInterval[];
  meanVolumeDb: number;
  speakingPaceWpm: number;
}

export interface DetectedVisualObject {
  label: string;
  category: 'person' | 'device' | 'screen' | 'product' | 'vehicle' | 'environment' | 'other';
  confidence?: number;
  timestamp: number;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface DetectedVisualAction {
  action: string;
  description: string;
  startTime: number;
  endTime: number;
  confidence?: number;
}

export interface DetectedOcrTextItem {
  text: string;
  timestamp: number;
  confidence?: number;
  category?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface SceneCutPoint {
  timestamp: number;
  score: number;
}

export interface FacePresenceInterval {
  start: number;
  end: number;
  dominant_face_ratio?: number;
  average_confidence: number;
}

export interface GroundedScene {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  hasFace: boolean;
  dominantObjects: string[];
  onScreenText: string[];
  transcriptDialogue: string;
  isActionHeavy: boolean;
}

export interface VisualIntelligence {
  sceneCuts: SceneCutPoint[];
  keyframeTimestamps: number[];
  facePresenceRatio: number;
  faceIntervals: FacePresenceInterval[];
  objects: DetectedVisualObject[];
  actions: DetectedVisualAction[];
  ocr: DetectedOcrTextItem[];
  scenes: GroundedScene[];
}

export interface GroundedProvenance {
  spokenFacts: string[];
  visualObservations: string[];
  ocrConfirmedText: string[];
  inferences: string[];
  contradictions: string[];
}

export interface MultimodalReasoning {
  summary: string;
  topics: string[];
  groundedProvenance: GroundedProvenance;
  suggestedThumbnailDirections?: string[];
}

export interface TranscriptEvidence {
  quotes: string[];
  topics: string[];
  spokenEmphasis?: string;
  completeThought: boolean;
}

export interface VisualEvidence {
  detectedObjects: string[];
  detectedActions: string[];
  onScreenText: string[];
  facePresenceRatio: number;
}

export interface SceneBoundaryInfo {
  nearestPriorCut?: number;
  nearestPosteriorCut?: number;
  startsOnCut: boolean;
  endsOnCut: boolean;
  cutCountInside: number;
}

export type SpeakerIdentityStatus = 'diarized' | 'inferred' | 'uncertain' | 'unknown';

export interface SpeakerContinuity {
  continuousSpeaker: boolean;
  faceIntervalOverlaps: number;
  faceContinuity: boolean;
  facePresenceRatio: number;
  speakerIdentityStatus: SpeakerIdentityStatus;
  diarizedSpeakerId?: string;
  detectedSpeakersInClip?: string[];
  speakerCountEstimated: number;
  evidenceDetails: string;
  speakerCountHint?: number; // Backward-compatible alias for speakerCountEstimated
}

export interface BoundaryOptimizationInfo {
  originalStart: number;
  originalEnd: number;
  snappedStart: number;
  snappedEnd: number;
  wasShotBoundarySnapped: boolean;
  wasSentencePreserved: boolean;
  leadingSilenceTrimmedSec: number;
  trailingSilenceTrimmedSec: number;
}

export interface ClippingHighlightRecommendation {
  id: string;
  title: string;
  start: number;
  end: number;
  duration: number;
  hookScore: number;
  visualScore: number;
  combinedScore: number;
  highlightScore?: number;
  framingSuitability: FramingSuitability;
  reason: string;
  confidence?: number;
  warnings?: string[];
  transcriptEvidence?: TranscriptEvidence;
  visualEvidence?: VisualEvidence;
  sceneBoundaryInfo?: SceneBoundaryInfo;
  speakerContinuity?: SpeakerContinuity;
  boundaryOptimization?: BoundaryOptimizationInfo;
}

export interface SubtitleHandoffData {
  recommendedPosition: 'bottom' | 'top' | 'middle';
  safeMarginPercent: number;
  detectedOcclusions: string[];
  transcriptReused: boolean;
  language: string;
}

export interface VideoIntelligenceRecord {
  id: string;
  user_id: string;
  source_hash: string;
  source_video_url?: string;
  status: VideoIntelligenceStatus;
  engine_version: string;
  source_identity: SourceIdentity;
  metadata: VideoContainerMetadata;
  audio_intelligence?: AudioIntelligence;
  visual_intelligence?: VisualIntelligence;
  multimodal_reasoning?: MultimodalReasoning;
  clipping_recommendations?: ClippingHighlightRecommendation[];
  subtitle_handoff?: SubtitleHandoffData;
  error_message?: string;
  locked_at?: Date;
  locked_by?: string;
  lease_token?: string; // Fencing token to protect against stale worker updates
  attempt_count: number;
  max_attempts: number;
  created_at: Date;
  updated_at: Date;
}

export interface AnalyzeVideoOptions {
  userId: string;
  videoPath: string;
  sourceUrl?: string;
  existingTranscript?: {
    text: string;
    language?: string;
    segments?: AudioIntelligenceSegment[];
  };
  priorityModality?: 'full' | 'audio_first' | 'visual_first';
  maxKeyframes?: number;
  visionModel?: string;
  forceRefresh?: boolean;
  strictFullStreamHash?: boolean;
  fullContentSha256?: string; // Precomputed full-content SHA-256 (e.g. from R2 stream)
  heartbeatIntervalMs?: number; // Override default 60,000ms heartbeat interval (e.g. in tests)
}
