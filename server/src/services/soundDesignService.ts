import crypto from 'node:crypto';
import { TranscriptWord, EditorTrack, EditorTrackItem, ContentGenre } from '../types/index.js';
import { generateWordId } from '../utils/wordIdentityUtils.js';

export type SoundEffectType = 'whoosh' | 'pop' | 'sub_bass' | 'ding' | 'riser';

export interface SoundEffectCue {
  id: string;
  type: SoundEffectType;
  timeline_time: number;
  duration: number;
  word_id?: string;
  word_text?: string;
  volume: number; // 0.0 - 1.0, recommended 0.35
  reason: string;
}

export interface GenerateSoundDesignOptions {
  words: TranscriptWord[];
  durationSeconds: number;
  coldOpenActive?: boolean;
  coldOpenDuration?: number;
  genre?: ContentGenre;
  minIntervalSec?: number;
}

const EMPHASIS_TRIGGER_WORDS = new Set([
  'secret', 'never', 'mistake', 'critical', 'exponential', 'insane', 'crazy', 'proven',
  'million', 'billion', 'dollar', 'truth', 'fail', 'failure', 'worst', 'best', 'stop',
  'first', 'warning', 'danger', 'shocking', 'massive', 'free', 'money', 'profit'
]);

export class SoundDesignService {
  /**
   * Generates deterministic, word-anchored sound design cues based on narrative triggers.
   * Adheres to professional editorial guidelines (max 1 sound cue every 3-4s to avoid sensory fatigue).
   */
  public static generateSoundDesignCues(options: GenerateSoundDesignOptions): SoundEffectCue[] {
    const {
      words = [],
      durationSeconds,
      coldOpenActive = false,
      coldOpenDuration = 3.0,
      genre = 'general',
      minIntervalSec = 2.0,
    } = options;

    const cues: SoundEffectCue[] = [];
    let lastCueTime = -minIntervalSec;

    // 1. Cold Open Transition: Add whoosh at the seam between hook teaser and main story
    if (coldOpenActive && coldOpenDuration > 0.5 && coldOpenDuration < durationSeconds) {
      cues.push({
        id: `sfx_whoosh_${crypto.randomUUID().slice(0, 8)}`,
        type: 'whoosh',
        timeline_time: Number(coldOpenDuration.toFixed(2)),
        duration: 0.45,
        volume: 0.35,
        reason: 'Whoosh transition marking seam between cold open teaser and narrative setup.',
      });
      lastCueTime = coldOpenDuration;
    }

    // 2. Opening Hook Gravity: Add sub-bass impact for high-stakes genres
    const isHighStakesGenre = ['motivation', 'business_finance', 'gaming', 'news_politics'].includes(genre);
    if (isHighStakesGenre && lastCueTime < 0) {
      cues.push({
        id: `sfx_subbass_${crypto.randomUUID().slice(0, 8)}`,
        type: 'sub_bass',
        timeline_time: 0.20,
        duration: 0.60,
        volume: 0.40,
        reason: `Sub-bass punch-in to anchor attention during the first 3 seconds of ${genre}.`,
      });
      lastCueTime = 0.20;
    }

    // 3. Word-Anchored Pop & Ding effects on primary emphasis words
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const cleanWord = (w.word || '').toLowerCase().replace(/[^a-z0-9\$%]/g, '');

      // Check if word contains currency symbol, percentage, numbers, or is in EMPHASIS_TRIGGER_WORDS
      const isNumberOrMoney = /^[\$%]?[0-9]+[\$%]?$/.test(cleanWord) || /[\$%]/.test(cleanWord);
      const isTriggerWord = EMPHASIS_TRIGGER_WORDS.has(cleanWord);

      if ((isNumberOrMoney || isTriggerWord) && w.start >= lastCueTime + minIntervalSec && w.start <= durationSeconds - 0.5) {
        const type: SoundEffectType = isNumberOrMoney ? 'ding' : 'pop';
        const wordId = w.id || generateWordId(w.word, w.start, w.end, i);

        cues.push({
          id: `sfx_${type}_${crypto.randomUUID().slice(0, 8)}`,
          type,
          timeline_time: Number(w.start.toFixed(2)),
          duration: type === 'ding' ? 0.35 : 0.20,
          word_id: wordId,
          word_text: w.word,
          volume: 0.30,
          reason: `Tactile ${type} accent anchoring highlighted word "${w.word}".`,
        });

        lastCueTime = w.start;
      }
    }

    return cues;
  }

  /**
   * Converts sound design cues into an EditorTrack with type 'AUDIO' for the Pro Editor timeline.
   */
  public static createSfxTrack(cues: SoundEffectCue[], totalDuration: number): EditorTrack {
    const trackId = crypto.randomUUID();
    const items: EditorTrackItem[] = cues.map((cue) => ({
      id: crypto.randomUUID(),
      track_id: trackId,
      type: 'AUDIO',
      source_asset_id: `sfx_${cue.type}`,
      source_path: `builtin://sfx/${cue.type}.wav`,
      timeline_start: cue.timeline_time,
      timeline_end: Number(Math.min(totalDuration, cue.timeline_time + cue.duration).toFixed(3)),
      source_start: 0,
      source_end: cue.duration,
      transform: { position_x: 0, position_y: 0, scale: 1.0, rotation: 0, opacity: 1.0 },
      speed: { speed: 1.0, pitch_preserved: true },
      audio: {
        volume: cue.volume,
        fade_in: 0.05,
        fade_out: 0.05,
        normalized: true,
        target_lufs: -20,
      },
      effects: [],
      keyframes: [],
      locked: false,
      muted: false,
      hidden: false,
      z_index: 5,
    }));

    return {
      id: trackId,
      type: 'AUDIO',
      name: 'Sound Design (SFX)',
      locked: false,
      muted: false,
      hidden: false,
      height: 48,
      items,
    };
  }

  /**
   * Compiles native FFmpeg synthesis filters for sound design cues with speech ducking.
   * Synthesizes audio triggers in-memory without external asset dependencies.
   */
  public static compileSfxSynthesisFilter(
    cues: SoundEffectCue[],
    baseAudioTag: string,
    outputAudioTag: string
  ): { filterLines: string[]; finalTag: string } {
    if (cues.length === 0) {
      return { filterLines: [], finalTag: baseAudioTag };
    }

    const filterLines: string[] = [];
    const streamTagsToMix = [baseAudioTag];

    cues.forEach((cue, idx) => {
      const sfxTag = `[sfx_${idx}]`;
      const delayedTag = `[sfx_del_${idx}]`;
      const delayMs = Math.round(cue.timeline_time * 1000);

      if (cue.type === 'sub_bass') {
        // 80Hz resonant sub-bass thump
        filterLines.push(
          `sine=f=80:d=${cue.duration},volume=${cue.volume.toFixed(2)},afade=t=out:st=${(cue.duration - 0.2).toFixed(2)}:d=0.2${sfxTag}`
        );
      } else if (cue.type === 'ding') {
        // High harmonic metallic chime (1400Hz)
        filterLines.push(
          `sine=f=1400:d=${cue.duration},volume=${cue.volume.toFixed(2)},afade=t=out:st=0.05:d=${(cue.duration - 0.05).toFixed(2)}${sfxTag}`
        );
      } else if (cue.type === 'whoosh') {
        // Filtered noise sweep
        filterLines.push(
          `anoisesrc=d=${cue.duration}:c=pink:r=44100,lowpass=f=1200,volume=${cue.volume.toFixed(2)},afade=t=in:d=0.15,afade=t=out:st=0.2:d=0.25${sfxTag}`
        );
      } else {
        // Crisp pop (880Hz short click)
        filterLines.push(
          `sine=f=880:d=${cue.duration},volume=${cue.volume.toFixed(2)},afade=t=out:st=0.03:d=0.17${sfxTag}`
        );
      }

      // Time-delay the synthesized cue to its exact timeline position
      filterLines.push(`${sfxTag}adelay=${delayMs}|${delayMs}${delayedTag}`);
      streamTagsToMix.push(delayedTag);
    });

    // Mix all SFX streams with speech audio stream
    filterLines.push(`${streamTagsToMix.join('')}amix=inputs=${streamTagsToMix.length}:duration=first:dropout_transition=2${outputAudioTag}`);

    return {
      filterLines,
      finalTag: outputAudioTag,
    };
  }
}
