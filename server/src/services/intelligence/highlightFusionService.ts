import {
  AudioIntelligence,
  VisualIntelligence,
  MultimodalReasoning,
  GroundedScene,
  ClippingHighlightRecommendation,
  FramingSuitability,
  TranscriptEvidence,
  VisualEvidence,
  SceneBoundaryInfo,
  SpeakerContinuity,
  SpeakerIdentityStatus,
} from '../../types/index.js';
import { ShotBoundaryFusionService } from './shotBoundaryFusionService.js';

export interface HighlightFusionInput {
  audio: AudioIntelligence;
  visual: VisualIntelligence;
  reasoning: MultimodalReasoning;
  totalDurationSeconds: number;
  targetDuration?: { min: number; max: number; optimal?: number };
  maxCandidates?: number;
}

export class HighlightFusionService {
  private static readonly HOOK_PATTERNS = [
    /\b(how to|secret|truth|never|always|mistake|why you|stop doing|best way|key|hack|proven|warning|revealed)\b/i,
    /\?$/,
    /!$/,
  ];

  /**
   * Main fusion method: Evaluates multimodal intelligence across audio, visual,
   * scene transitions, and OCR to generate explainable, boundary-optimized highlight candidates.
   */
  public static generateHighlightCandidates(
    input: HighlightFusionInput
  ): ClippingHighlightRecommendation[] {
    const {
      audio,
      visual,
      reasoning,
      totalDurationSeconds,
      targetDuration = { min: 15, max: 60, optimal: 30 },
      maxCandidates = 5,
    } = input;

    const scenes = visual.scenes || [];
    const segments = audio.segments || [];
    const words = audio.words || [];
    const sceneCuts = visual.sceneCuts || [];
    const faceIntervals = visual.faceIntervals || [];
    const objects = visual.objects || [];
    const actions = visual.actions || [];
    const ocrItems = visual.ocr || [];
    const topics = reasoning.topics || [];

    const candidates: ClippingHighlightRecommendation[] = [];

    // Strategy 1: Scene-driven moments (from GroundedScene analysis)
    for (const sc of scenes) {
      if (sc.duration >= 8 && sc.duration <= targetDuration.max * 1.5) {
        const candidate = this.evaluateInterval({
          rawStart: sc.startTime,
          rawEnd: sc.endTime,
          audio,
          visual,
          reasoning,
          totalDurationSeconds,
          targetDuration,
          defaultTitle: `Scene: ${sc.dominantObjects[0] || sc.onScreenText[0] || 'Key Moment'}`,
        });
        if (candidate) candidates.push(candidate);
      }
    }

    // Strategy 2: Transcript-driven narrative moments (grouped by sentence / segment clusters)
    if (segments.length > 0) {
      let clusterStart = segments[0].start;
      let clusterText = '';
      let clusterStartIndex = 0;

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        clusterText += (clusterText ? ' ' : '') + seg.text;
        const currentDur = seg.end - clusterStart;

        const isSentenceEnd = /[.!?]+$/.test(seg.text.trim());
        const reachedTargetLength = currentDur >= targetDuration.min;

        if ((isSentenceEnd && reachedTargetLength) || currentDur >= targetDuration.max) {
          const candidate = this.evaluateInterval({
            rawStart: clusterStart,
            rawEnd: seg.end,
            audio,
            visual,
            reasoning,
            totalDurationSeconds,
            targetDuration,
            defaultTitle: this.deriveTitleFromText(clusterText, topics),
          });
          if (candidate) candidates.push(candidate);

          // Advance to next cluster
          if (i + 1 < segments.length) {
            clusterStart = segments[i + 1].start;
            clusterText = '';
            clusterStartIndex = i + 1;
          }
        }
      }
    }

    // Strategy 3: Fallback for short or silent footage if no moments met thresholds
    if (candidates.length === 0 && totalDurationSeconds >= 2.0) {
      const fallbackStart = 0;
      const fallbackEnd = Math.min(totalDurationSeconds, Math.max(targetDuration.min, 15));
      const fallbackCandidate = this.evaluateInterval({
        rawStart: fallbackStart,
        rawEnd: fallbackEnd,
        audio,
        visual,
        reasoning,
        totalDurationSeconds,
        targetDuration,
        defaultTitle: reasoning.summary?.slice(0, 40) || 'Video Highlight',
      });
      if (fallbackCandidate) candidates.push(fallbackCandidate);
    }

    // Deduplicate overlapping moments (favoring higher combinedScore)
    const deduped = this.deduplicateCandidates(candidates, 0.35);

    // Sort by combinedScore descending and take top N
    deduped.sort((a, b) => b.combinedScore - a.combinedScore);
    return deduped.slice(0, maxCandidates);
  }

  /**
   * Evaluates an interval against all 7 multimodal signals and applies shot-aware boundary fusion.
   */
  public static evaluateInterval(params: {
    rawStart: number;
    rawEnd: number;
    audio: AudioIntelligence;
    visual: VisualIntelligence;
    reasoning: MultimodalReasoning;
    totalDurationSeconds: number;
    targetDuration: { min: number; max: number; optimal?: number };
    defaultTitle?: string;
  }): ClippingHighlightRecommendation | null {
    const {
      rawStart,
      rawEnd,
      audio,
      visual,
      reasoning,
      totalDurationSeconds,
      targetDuration,
      defaultTitle = 'Key Highlight',
    } = params;

    const warnings: string[] = [];

    // ──────────────────────────────────────────────────────────────────────────
    // 1. SHOT-AWARE BOUNDARY FUSION (Part C)
    // ──────────────────────────────────────────────────────────────────────────
    const boundaryResult = ShotBoundaryFusionService.optimizeBoundaries({
      rawStart,
      rawEnd,
      words: audio.words,
      segments: audio.segments,
      sceneCuts: visual.sceneCuts,
      silenceIntervals: audio.silenceIntervals,
      faceIntervals: visual.faceIntervals,
      totalVideoDuration: totalDurationSeconds,
      targetDuration,
      preferShotCutAlignment: true,
    });

    if (boundaryResult.boundaryOptimization.wordBoundarySafe === false) return null;

    const start = boundaryResult.start;
    const end = boundaryResult.end;
    const duration = boundaryResult.duration;
    warnings.push(...boundaryResult.warnings);

    // ──────────────────────────────────────────────────────────────────────────
    // 2. SIGNAL 1 & 2: TRANSCRIPT MEANING, RELEVANCE & DELIVERY
    // ──────────────────────────────────────────────────────────────────────────
    const intervalSegments = (audio.segments || []).filter(
      (s) => s.start < end && s.end > start
    );
    const intervalWords = (audio.words || []).filter(
      (w) => w.start < end && w.end > start
    );
    const dialogue = intervalSegments.map((s) => s.text).join(' ').trim();
    const wordCount = intervalWords.length || dialogue.split(/\s+/).filter(Boolean).length;

    let transcriptScore = 50;
    let hookScore = 50;
    let spokenEmphasis = 'Standard conversational pace';
    let completeThought = boundaryResult.boundaryOptimization.wasSentencePreserved;
    if (!completeThought && intervalWords.length === 0 && dialogue.length > 0) {
      if (/[.!?]+$/.test(dialogue.trim())) {
        completeThought = true;
      }
    }

    if (dialogue.length > 0) {
      // Check hook patterns
      const hasHook = this.HOOK_PATTERNS.some((p) => p.test(dialogue));
      if (hasHook) hookScore += 25;

      // Check topic alignment
      const topicMatches = (reasoning.topics || []).filter((t) =>
        dialogue.toLowerCase().includes(t.toLowerCase())
      );
      if (topicMatches.length > 0) transcriptScore += 20;

      // Check delivery pacing (WPM)
      const wpm = duration > 0 ? (wordCount / (duration / 60)) : 0;
      if (wpm >= 120 && wpm <= 175) {
        transcriptScore += 15;
        spokenEmphasis = `Optimal conversational pace (~${Math.round(wpm)} WPM)`;
      } else if (wpm > 0 && wpm < 100) {
        spokenEmphasis = `Deliberate, slow pace (~${Math.round(wpm)} WPM)`;
      } else if (wpm > 200) {
        spokenEmphasis = `Rapid energetic delivery (~${Math.round(wpm)} WPM)`;
      }

      // Check volume stability
      if (audio.meanVolumeDb >= -28 && audio.meanVolumeDb <= -14) {
        transcriptScore += 10;
      }
    } else {
      transcriptScore = 30;
      hookScore = 30;
      warnings.push('Silent footage or absence of spoken dialogue in this segment.');
    }

    transcriptScore = Math.min(100, Math.max(20, transcriptScore));
    hookScore = Math.min(100, Math.max(20, hookScore));

    // ──────────────────────────────────────────────────────────────────────────
    // 3. SIGNAL 3, 4, 5, 6: VISUAL SIGNALS (Faces, Objects, Actions, OCR)
    // ──────────────────────────────────────────────────────────────────────────
    // Face Presence & Visual Engagement
    const overlappingFaces = (visual.faceIntervals || []).filter(
      (fi) => fi.start < end && fi.end > start
    );
    const faceTimeSec = overlappingFaces.reduce(
      (acc, fi) => acc + (Math.min(end, fi.end) - Math.max(start, fi.start)),
      0
    );
    const facePresenceRatio = duration > 0 ? Math.min(1.0, faceTimeSec / duration) : 0;
    const faceContinuity = facePresenceRatio >= 0.6 && overlappingFaces.length <= 2;

    let visualScore = 50;
    let framingSuitability: FramingSuitability = 'wide';

    if (facePresenceRatio >= 0.6) {
      framingSuitability = 'face_centered';
      visualScore += 25;
    } else if (facePresenceRatio > 0.2) {
      framingSuitability = 'wide';
      visualScore += 10;
    } else {
      warnings.push('No detectable human faces in this segment.');
    }

    // Objects in interval
    const intervalObjects = (visual.objects || []).filter(
      (obj) => obj.timestamp >= start && obj.timestamp <= end
    );
    const dominantObjects = Array.from(new Set(intervalObjects.map((o) => o.label)));
    if (dominantObjects.length > 0) visualScore += 10;

    // Actions in interval
    const intervalActions = (visual.actions || []).filter(
      (act) => act.startTime < end && act.endTime > start
    );
    const dominantActions = Array.from(new Set(intervalActions.map((a) => a.action)));
    if (dominantActions.length > 0) {
      visualScore += 10;
      if (framingSuitability === 'wide') framingSuitability = 'action_centered';
    }

    // OCR text in interval
    const intervalOcr = (visual.ocr || []).filter(
      (item) => item.timestamp >= start && item.timestamp <= end
    );
    const onScreenText = Array.from(new Set(intervalOcr.map((o) => o.text))).slice(0, 3);
    if (onScreenText.length > 0) visualScore += 5;

    visualScore = Math.min(100, Math.max(25, visualScore));

    // ──────────────────────────────────────────────────────────────────────────
    // 4. SIGNAL 7: AUDIO-VISUAL ALIGNMENT & COMBINED HIGHLIGHT SCORE
    // ──────────────────────────────────────────────────────────────────────────
    let alignmentScore = 50;
    if (dialogue.length > 0 && facePresenceRatio >= 0.5) {
      // Direct speech while face is framed
      alignmentScore += 25;
    }
    if (dominantObjects.some((o) => dialogue.toLowerCase().includes(o.toLowerCase()))) {
      // Spoken words reference visible objects
      alignmentScore += 15;
    }
    if (onScreenText.some((t) => dialogue.toLowerCase().includes(t.toLowerCase()))) {
      // Spoken words match on-screen headings
      alignmentScore += 10;
    }
    alignmentScore = Math.min(100, Math.max(30, alignmentScore));

    // Weighted Multimodal Fusion Formula:
    // 35% Hook & Delivery + 30% Visual + 20% Transcript Depth + 15% Alignment
    const combinedScore = Math.round(
      hookScore * 0.35 +
      visualScore * 0.30 +
      transcriptScore * 0.20 +
      alignmentScore * 0.15
    );

    // Compute Confidence (0.0 to 1.0)
    let confidence = 0.85;
    if (facePresenceRatio < 0.1 && dialogue.length === 0) confidence -= 0.3;
    if (boundaryResult.warnings.length > 0) confidence -= 0.1;
    confidence = Math.max(0.4, Math.min(0.98, Number(confidence.toFixed(2))));

    // Construct Evidence Structures
    const transcriptEvidence: TranscriptEvidence = {
      quotes: intervalSegments.slice(0, 2).map((s) => s.text),
      topics: (reasoning.topics || []).filter((t) => dialogue.toLowerCase().includes(t.toLowerCase())),
      spokenEmphasis,
      completeThought,
    };

    const visualEvidence: VisualEvidence = {
      detectedObjects: dominantObjects,
      detectedActions: dominantActions,
      onScreenText,
      facePresenceRatio: Number(facePresenceRatio.toFixed(2)),
    };

    const sceneBoundaryInfo: SceneBoundaryInfo = {
      nearestPriorCut: boundaryResult.nearestPriorCut,
      nearestPosteriorCut: boundaryResult.nearestPosteriorCut,
      startsOnCut: boundaryResult.startsOnCut,
      endsOnCut: boundaryResult.endsOnCut,
      cutCountInside: (visual.sceneCuts || []).filter((c) => c.timestamp >= start && c.timestamp <= end).length,
    };

    // Speaker Identity vs Face Continuity (Strict Separation)
    const diarizedSegments = intervalSegments.filter(
      (s) => typeof s.speaker === 'string' && s.speaker.trim().length > 0
    );
    const distinctDiarizedSpeakers = Array.from(
      new Set(diarizedSegments.map((s) => (s.speaker as string).trim()))
    );

    let speakerIdentityStatus: SpeakerIdentityStatus;
    let continuousSpeaker = false;
    let diarizedSpeakerId: string | undefined = undefined;
    let detectedSpeakersInClip: string[] | undefined = undefined;
    let speakerCountEstimated = 0;
    let evidenceDetails = '';

    if (distinctDiarizedSpeakers.length > 0) {
      detectedSpeakersInClip = distinctDiarizedSpeakers;
      speakerCountEstimated = distinctDiarizedSpeakers.length;
      if (distinctDiarizedSpeakers.length === 1) {
        speakerIdentityStatus = 'diarized';
        continuousSpeaker = true;
        diarizedSpeakerId = distinctDiarizedSpeakers[0];
        evidenceDetails = `Verified single speaker (${distinctDiarizedSpeakers[0]}) via audio diarization evidence.`;
      } else {
        speakerIdentityStatus = 'diarized';
        continuousSpeaker = false;
        evidenceDetails = `Multiple distinct speakers detected (${distinctDiarizedSpeakers.join(', ')}) via audio diarization.`;
        warnings.push(
          `Multi-speaker segment detected: ${distinctDiarizedSpeakers.length} distinct speakers (${distinctDiarizedSpeakers.join(', ')}).`
        );
      }
    } else if (intervalSegments.length > 0) {
      // Speech occurs, but diarization labels are not present
      speakerIdentityStatus = 'uncertain';
      continuousSpeaker = false; // Strictly do not assert single-speaker continuity without diarization evidence
      speakerCountEstimated = overlappingFaces.length > 1 ? overlappingFaces.length : 1;
      evidenceDetails =
        'Speaker identity unverified: audio diarization not available; single-speaker continuity cannot be established from face presence alone.';
      warnings.push('Speaker identity unverified: audio diarization not available for this source.');
    } else {
      // Silent footage or no speech in interval
      speakerIdentityStatus = 'unknown';
      continuousSpeaker = false;
      speakerCountEstimated = 0;
      evidenceDetails = 'No spoken audio in clip interval; speaker identity is unknown.';
    }

    const speakerContinuity: SpeakerContinuity = {
      continuousSpeaker,
      faceIntervalOverlaps: overlappingFaces.length,
      faceContinuity,
      facePresenceRatio: Number(facePresenceRatio.toFixed(2)),
      speakerIdentityStatus,
      diarizedSpeakerId,
      detectedSpeakersInClip,
      speakerCountEstimated,
      evidenceDetails,
      speakerCountHint: speakerCountEstimated,
    };

    // Explainable rationale
    const reasonParts: string[] = [];
    if (hookScore >= 70) reasonParts.push('compelling opening hook');
    if (facePresenceRatio >= 0.7) reasonParts.push('strong direct-to-camera presenter engagement');
    if (dominantActions.length > 0) reasonParts.push(`active visual demonstration (${dominantActions[0]})`);
    if (onScreenText.length > 0) reasonParts.push(`clear on-screen visual anchor ("${onScreenText[0]}")`);
    if (boundaryResult.startsOnCut) reasonParts.push('clean shot-boundary start');

    const reason = reasonParts.length > 0
      ? `High-retention segment featuring ${reasonParts.join(', ')}.`
      : `Cohesive moment with balanced pacing and complete narrative thought.`;

    const title = this.deriveTitleFromEvidence(dialogue, dominantObjects, onScreenText, defaultTitle);

    return {
      id: `highlight_${Math.round(start)}_${Math.round(end)}`,
      title,
      start,
      end,
      duration,
      hookScore,
      visualScore,
      combinedScore,
      highlightScore: combinedScore,
      framingSuitability,
      reason,
      confidence,
      warnings: Array.from(new Set(warnings)),
      transcriptEvidence,
      visualEvidence,
      sceneBoundaryInfo,
      speakerContinuity,
      boundaryOptimization: boundaryResult.boundaryOptimization,
    };
  }

  private static deriveTitleFromText(text: string, topics: string[]): string {
    const clean = text.replace(/[^a-zA-Z0-9\s]/g, '').trim();
    const words = clean.split(/\s+/).filter(Boolean);
    if (topics.length > 0) {
      return `${topics[0]}: ${words.slice(0, 5).join(' ')}`;
    }
    return words.slice(0, 6).join(' ') || 'Key Moment';
  }

  private static deriveTitleFromEvidence(
    dialogue: string,
    objects: string[],
    ocr: string[],
    defaultTitle: string
  ): string {
    if (ocr.length > 0 && ocr[0].length >= 4 && ocr[0].length <= 35) {
      return ocr[0];
    }
    if (dialogue.length > 0) {
      const firstSentence = dialogue.split(/[.!?]/)[0].trim();
      const words = firstSentence.split(/\s+/).slice(0, 5).join(' ');
      if (words.length >= 8) return words;
    }
    if (objects.length > 0) {
      return `Highlight: ${objects[0]}`;
    }
    return defaultTitle;
  }

  private static deduplicateCandidates(
    candidates: ClippingHighlightRecommendation[],
    maxOverlapRatio = 0.35
  ): ClippingHighlightRecommendation[] {
    const sorted = [...candidates].sort((a, b) => b.combinedScore - a.combinedScore);
    const kept: ClippingHighlightRecommendation[] = [];

    for (const cand of sorted) {
      const hasSignificantOverlap = kept.some((existing) => {
        const overlapStart = Math.max(cand.start, existing.start);
        const overlapEnd = Math.min(cand.end, existing.end);
        const overlapDur = Math.max(0, overlapEnd - overlapStart);
        const minDur = Math.min(cand.duration, existing.duration);
        return minDur > 0 && (overlapDur / minDur) > maxOverlapRatio;
      });

      if (!hasSignificantOverlap) {
        kept.push(cand);
      }
    }

    return kept;
  }
}
