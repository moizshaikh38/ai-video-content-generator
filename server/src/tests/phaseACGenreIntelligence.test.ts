import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GenreIntelligenceService,
  ClassifyGenreMetricsInput,
} from '../services/genreIntelligenceService.js';
import { MultimodalScoringService } from '../services/multimodal/multimodalScoringService.js';
import { ClipPromptService } from '../services/clipPromptService.js';
import {
  ContentGenre,
  ContentGoal,
  ClipPreferences,
  MultimodalTimeline,
  CreatorProfileData,
  TranscriptSegment,
} from '../types/index.js';

describe('Phase A & C — Genre Intelligence & Scoring Verification', () => {
  const EXPECTED_GENRES: ContentGenre[] = [
    'podcast_interview',
    'education_tutorial',
    'motivation',
    'business_finance',
    'gaming',
    'sports',
    'news_politics',
    'comedy_entertainment',
    'storytelling',
    'product_marketing',
    'general',
  ];

  // ─────────────────────────────────────────────────────────────
  // 1. Registry Integrity & Scoring Weights Sum to 1.0
  // ─────────────────────────────────────────────────────────────
  describe('1. Genre Registry & Safeguards', () => {
    it('defines all 11 canonical genres with valid configuration', () => {
      const registered = Object.keys(GenreIntelligenceService.GENRE_PROFILES) as ContentGenre[];
      assert.equal(registered.length, 11, 'Should define exactly 11 canonical genres');

      for (const g of EXPECTED_GENRES) {
        const profile = GenreIntelligenceService.GENRE_PROFILES[g];
        assert.ok(profile, `Profile for genre '${g}' must exist`);
        assert.equal(profile.genre, g);
        assert.ok(profile.displayName.length > 0);
        assert.ok(profile.editorialSafeguard.length > 0);
        assert.ok(profile.selectionObjective.length > 0);
        assert.ok(profile.narrativeArcPrompt.length > 0);

        // Duration validation
        assert.ok(profile.targetDuration.min > 0);
        assert.ok(profile.targetDuration.optimal >= profile.targetDuration.min);
        assert.ok(profile.targetDuration.max >= profile.targetDuration.optimal);

        // Scoring weights must sum strictly to 1.0
        const weights = profile.scoringWeights;
        const sum = weights.hook + weights.standalone + weights.insight + weights.audio + weights.visual;
        assert.ok(
          Math.abs(sum - 1.0) < 1e-6,
          `Scoring weights for '${g}' must sum to 1.0, got ${sum}`
        );
      }
    });

    it('enforces mandatory pause-cut safeguards for comedy and sports', () => {
      const comedy = GenreIntelligenceService.GENRE_PROFILES['comedy_entertainment'];
      assert.equal(
        comedy.producerDefaults.allowInteriorPauseCuts,
        false,
        'Comedy must forbid interior pause cuts to preserve comedic timing'
      );

      const sports = GenreIntelligenceService.GENRE_PROFILES['sports'];
      assert.equal(
        sports.producerDefaults.allowInteriorPauseCuts,
        false,
        'Sports must forbid interior pause cuts to preserve live game momentum'
      );

      const podcast = GenreIntelligenceService.GENRE_PROFILES['podcast_interview'];
      assert.equal(
        podcast.reframeConfig.preferTwoShot,
        true,
        'Podcast interview must prefer two-shot reframe mode'
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 2. Deterministic Local Auto-Genre Classification
  // ─────────────────────────────────────────────────────────────
  describe('2. Local Auto-Genre Classification', () => {
    it('classifies gaming content based on gameplay keywords and fast scene cuts', () => {
      const input: ClassifyGenreMetricsInput = {
        transcriptText: 'What a clutch headshot! Watch this gameplay clip, insane boss fight combo and respawn.',
        sceneCutRatePerMin: 18,
        wpm: 160,
        faceCount: 1,
        silenceRatio: 0.1,
      };

      const result = GenreIntelligenceService.classifyVideoGenreLocally(input);
      assert.equal(result.genre, 'gaming');
      assert.ok(result.confidence >= 0.6);
      assert.ok(result.reasons.some((r) => r.toLowerCase().includes('game') || r.toLowerCase().includes('keyword')));
    });

    it('classifies business/finance content based on financial metrics and keywords', () => {
      const input: ClassifyGenreMetricsInput = {
        transcriptText: 'Let us examine our revenue, profit margin, CAC, and ROI metrics across Q3 quarterly earnings with $5M in cash flow.',
        ocrDensityPerMin: 1.0,
        wpm: 140,
        faceCount: 1,
      };

      const result = GenreIntelligenceService.classifyVideoGenreLocally(input);
      assert.equal(result.genre, 'business_finance');
      assert.ok(result.confidence >= 0.6);
    });

    it('classifies education/tutorial with high OCR density and step-by-step guidance', () => {
      const input: ClassifyGenreMetricsInput = {
        transcriptText: 'In this tutorial, step 1 is installing Node. Step 2 teaches you how to configure the compiler with this walkthrough.',
        ocrDensityPerMin: 5,
        wpm: 130,
        faceCount: 1,
      };

      const result = GenreIntelligenceService.classifyVideoGenreLocally(input);
      assert.equal(result.genre, 'education_tutorial');
      assert.ok(result.confidence >= 0.6);
    });

    it('classifies sports from game action keywords and fast cuts', () => {
      const input: ClassifyGenreMetricsInput = {
        transcriptText: 'Unbelievable touchdown in the final quarter! What an interception and championship tournament victory.',
        sceneCutRatePerMin: 14,
        silenceRatio: 0.08,
        wpm: 155,
      };

      const result = GenreIntelligenceService.classifyVideoGenreLocally(input);
      assert.equal(result.genre, 'sports');
      assert.ok(result.confidence >= 0.6);
    });

    it('falls back gracefully to general when no distinctive signals are present', () => {
      const input: ClassifyGenreMetricsInput = {
        transcriptText: 'Hello everyone, welcome back today. We are going to chat for a while about several random things.',
        sceneCutRatePerMin: 2,
        wpm: 120,
        faceCount: 0,
      };

      const result = GenreIntelligenceService.classifyVideoGenreLocally(input);
      assert.equal(result.genre, 'general');
      assert.ok(result.confidence <= 0.6);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 3. Preferences Normalization & Strict Override Hierarchy
  // ─────────────────────────────────────────────────────────────
  describe('3. Preferences Normalization & Hierarchy', () => {
    it('normalizes legacy bracketed project notes into structured preferences', () => {
      const legacyNotes = '[Aspect: 16:9] [Duration: 30-60s] [Topics: AI, Machine Learning, Robotics]';
      const prefs = GenreIntelligenceService.normalizePreferences({}, legacyNotes);

      assert.equal(prefs.aspectRatio, '16:9');
      assert.equal(prefs.preferredDurations, '30-60');
      assert.ok(prefs.topicKeywords?.includes('AI'));
      assert.ok(prefs.topicKeywords?.includes('Machine Learning'));
      assert.ok(prefs.topicKeywords?.includes('Robotics'));
    });

    it('enforces strict precedence: User Setting > Creator Profile Preset > Genre Default > General Fallback', () => {
      // 1. Creator preset overrides captionStyle to 'minimal'
      const creatorPreset: Partial<CreatorProfileData> & { caption_style_preset?: any } = {
        niche: 'Standup',
        target_audience: 'General',
        brand_name: 'Test Creator',
        caption_style_preset: 'minimal',
      };

      // 2. Effective config with no explicit user override inherits creator preset
      const configWithCreator = GenreIntelligenceService.resolveEffectiveConfig({
        userPreferences: {
          genre: 'comedy_entertainment',
          genreSelectionMode: 'manual',
          contentGoal: 'shareable_moments',
          aspectRatio: '9:16',
          preferredDurations: '30-60',
          topicKeywords: [],
          customInstructions: '',
          profileVersion: 1,
        },
        creatorProfile: creatorPreset,
      });
      assert.equal(
        configWithCreator.captionStyle,
        'minimal',
        'Should inherit creator profile preset when user did not explicitly set one'
      );

      // 3. If user explicitly specifies captionStyle in preferences, user setting strictly wins
      const configWithUserOverride = GenreIntelligenceService.resolveEffectiveConfig({
        userPreferences: {
          genre: 'comedy_entertainment',
          genreSelectionMode: 'manual',
          contentGoal: 'shareable_moments',
          aspectRatio: '1:1', // user explicit
          preferredDurations: '30-60',
          topicKeywords: [],
          customInstructions: '',
          captionStyle: 'karaoke', // user explicit
          profileVersion: 1,
        },
        creatorProfile: creatorPreset,
      });
      assert.equal(
        configWithUserOverride.captionStyle,
        'karaoke',
        'Explicit user setting must override creator preset'
      );
      assert.equal(
        configWithUserOverride.aspectRatio,
        '1:1',
        'Explicit user aspect ratio must override creator preset'
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 4. Dynamic Audio Energy Scoring (replacing hardcoded 78)
  // ─────────────────────────────────────────────────────────────
  describe('4. Dynamic Multimodal Audio Energy Scoring', () => {
    it('dynamically computes audioEnergyScore from timeline audio and silence signals (never hardcoded to 78)', () => {
      // Scenario A: High energy audio (loud broadcast dB, high active speech ratio, no opening silence)
      const highEnergyTimeline: MultimodalTimeline = {
        project_id: 'test_proj',
        duration_seconds: 60,
        scene_cuts: [],
        face_intervals: [],
        keyframes: [],
        segments: [
          {
            start: 10,
            end: 20,
            visual_activity_score: 80,
            has_face_presence: true,
            audio_energy_db: -16, // loud and clear
            scene_cut_count: 2,
          },
          {
            start: 20,
            end: 35,
            visual_activity_score: 75,
            has_face_presence: true,
            audio_energy_db: -18,
            scene_cut_count: 1,
          },
        ] as unknown as any[],
        silence_intervals: [
          // Silence far outside candidate window [10, 35]
          { start: 40, end: 45, duration: 5 },
        ],
        summary_metadata: {
          total_scene_cuts: 3,
          average_visual_activity: 77.5,
          silence_ratio: 0.08,
          face_presence_ratio: 0.9,
          ocr_status: 'none',
        },
      };

      const highEnergyScore = MultimodalScoringService.scoreCandidate({
        start_seconds: 10,
        end_seconds: 35,
        title: 'High energy candidate',
        hook: 'This changes everything we know about artificial intelligence!',
        timeline: highEnergyTimeline,
        genreProfile: GenreIntelligenceService.getGenreProfile('podcast_interview'),
        contentGoal: 'shareable_moments',
      });

      // Scenario B: Low energy audio (whispering/quiet ambient dB, mostly silence)
      const lowEnergyTimeline: MultimodalTimeline = {
        project_id: 'test_proj',
        duration_seconds: 60,
        scene_cuts: [],
        face_intervals: [],
        keyframes: [],
        segments: [
          {
            start: 10,
            end: 20,
            visual_activity_score: 30,
            has_face_presence: false,
            audio_energy_db: -48, // very quiet
            scene_cut_count: 0,
          },
          {
            start: 20,
            end: 35,
            visual_activity_score: 30,
            has_face_presence: false,
            audio_energy_db: -46, // very quiet
            scene_cut_count: 0,
          },
        ] as unknown as any[],
        silence_intervals: [
          // Silence during the opening and majority of the window
          { start: 10, end: 12, duration: 2 },
          { start: 15, end: 32, duration: 17 },
        ],
        summary_metadata: {
          total_scene_cuts: 0,
          average_visual_activity: 30,
          silence_ratio: 0.7,
          face_presence_ratio: 0,
          ocr_status: 'none',
        },
      };

      const lowEnergyScore = MultimodalScoringService.scoreCandidate({
        start_seconds: 10,
        end_seconds: 35,
        title: 'Low energy candidate',
        hook: 'Quiet whisper hook',
        timeline: lowEnergyTimeline,
        genreProfile: GenreIntelligenceService.getGenreProfile('podcast_interview'),
        contentGoal: 'shareable_moments',
      });

      // Assertions
      assert.notEqual(
        highEnergyScore.explanation.audio_energy_score,
        78,
        'High energy candidate should not be fixed at legacy 78'
      );
      assert.notEqual(
        lowEnergyScore.explanation.audio_energy_score,
        78,
        'Low energy candidate should not be fixed at legacy 78'
      );
      assert.ok(
        highEnergyScore.explanation.audio_energy_score >= 80,
        `High energy score should be >= 80, got ${highEnergyScore.explanation.audio_energy_score}`
      );
      assert.ok(
        lowEnergyScore.explanation.audio_energy_score <= 55,
        `Low energy score should be <= 55, got ${lowEnergyScore.explanation.audio_energy_score}`
      );
      assert.ok(
        highEnergyScore.explanation.audio_energy_score > lowEnergyScore.explanation.audio_energy_score + 25,
        'High energy candidate must score significantly higher than low energy candidate'
      );

      // Check explainability reasons
      assert.ok(
        highEnergyScore.explanation.reasons.some((r) => /audio energy/i.test(r)),
        'Score explanation must include audio energy breakdown'
      );
    });
  });

  // ─────────────────────────────────────────────────────────────
  // 5. Prompt Service Genre & Goal Directives
  // ─────────────────────────────────────────────────────────────
  describe('5. Prompt Service Genre Directives', () => {
    it('injects genre objectives, safeguards, and content goals into analysis prompts', () => {
      const comedyProfile = GenreIntelligenceService.getGenreProfile('comedy_entertainment');
      const sysPrompt = ClipPromptService.getSystemPrompt(comedyProfile);

      assert.ok(sysPrompt.includes('GENRE RULES (COMEDY & ENTERTAINMENT):'));
      assert.ok(sysPrompt.includes('Comedic timing relies on pauses'));

      const analysisPrompt = ClipPromptService.buildClipAnalysisPrompt({
        segments: [{ start: 0, end: 10, text: 'Hello world' }],
        durationSeconds: 300,
        genreProfile: comedyProfile,
        contentGoal: 'mini_story',
        customInstructions: 'Focus on backstage rehearsal moments.',
        topicKeywords: ['standup', 'rehearsal'],
      });

      assert.ok(analysisPrompt.includes('GENRE INTELLIGENCE (Comedy & Entertainment):'));
      assert.ok(analysisPrompt.includes('CONTENT GOAL DIRECTIVE:'));
      assert.ok(analysisPrompt.includes('GOAL (Mini Story)'));
      assert.ok(analysisPrompt.includes('Focus on backstage rehearsal moments.'));
      assert.ok(analysisPrompt.includes('standup, rehearsal'));
    });

    it('injects inline multimodal markers in formatted transcripts', () => {
      const segments: TranscriptSegment[] = [
        {
          start: 0,
          end: 15,
          text: 'Welcome to the presentation. Here is our main point.',
        },
      ];

      const timeline: MultimodalTimeline = {
        project_id: 'test_markers',
        duration_seconds: 60,
        scene_cuts: [{ timestamp: 5.2, score: 0.9 }],
        silence_intervals: [],
        face_intervals: [],
        segments: [],
        keyframes: [
          {
            timestamp: 6.0,
            frame_path: '/tmp/kf1.jpg',
            visual_activity_score: 85,
            ocr_text: 'BREAKING NEWS',
          },
        ],
        summary_metadata: {
          total_scene_cuts: 1,
          average_visual_activity: 85,
          silence_ratio: 0,
          face_presence_ratio: 1,
          ocr_status: 'completed',
        },
      };

      const formatted = ClipPromptService.formatIndexedTranscript(segments, timeline);

      assert.ok(
        formatted.includes('[SCENE_CUT]'),
        'Transcript should include inline scene cut marker'
      );
      assert.ok(
        formatted.includes('[HIGH_VISUAL]'),
        'Transcript should include visual activity marker'
      );
      assert.ok(
        formatted.includes('[OCR: "BREAKING NEWS"]'),
        'Transcript should include inline OCR marker'
      );
    });
  });
});
