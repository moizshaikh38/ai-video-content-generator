import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SmartReframeService } from '../services/smartReframeService.js';
import { ClipAnalysisService } from '../services/clipAnalysisService.js';
import { ViralCloneService } from '../services/viralCloneService.js';
import { VireoMcpServer } from '../mcp/vireoMcpServer.js';
import { GenreIntelligenceService } from '../services/genreIntelligenceService.js';
import { ClipPromptService } from '../services/clipPromptService.js';
import { ProEditorService } from '../services/proEditorService.js';
import { ProducerPlanningService } from '../services/producerPlanningService.js';
import { SoundDesignService } from '../services/soundDesignService.js';
import type { ReframeSample, TranscriptWord, ContentGenre, ClipRecord } from '../types/index.js';

describe('Safe Integration of OpenShorts, AutoClip, and Hypit Architectures into VireoClip', () => {

  describe('1. OpenShorts Multi-Layout Vertical Reframing', () => {
    test('buildSplitPodcastFilter generates valid FFmpeg dual-stack layout for 9:16', () => {
      const filter = SmartReframeService.buildSplitPodcastFilter({
        speaker1X: 0.25,
        speaker2X: 0.75,
        canvasWidth: 1080,
        canvasHeight: 1920,
      });

      assert.ok(filter.includes('split=2[spk1][spk2]'), 'Must split source video into two streams');
      assert.ok(filter.includes('crop=1080:960'), 'Must crop each speaker into half-height 9:8 box');
      assert.ok(filter.includes('vstack[out]'), 'Must stack speakers vertically into 9:16');
    });

    test('buildBlurBackgroundFilter generates valid blurred backdrop layout for B-roll / no-face shots', () => {
      const filter = SmartReframeService.buildBlurBackgroundFilter({
        canvasWidth: 1080,
        canvasHeight: 1920,
        blurRadius: 25,
      });

      assert.ok(filter.includes('split=2[bg][fg]'), 'Must split into background and foreground');
      assert.ok(filter.includes('boxblur=25:5'), 'Must apply boxblur to background');
      assert.ok(filter.includes('overlay=(W-w)/2:(H-h)/2'), 'Must center sharp foreground over blurred backdrop');
    });

    test('determineOptimalLayoutMode chooses blur for clips with no detected faces (>= 70%)', () => {
      const samplesWithNoFaces: ReframeSample[] = [
        { time: 0.0, faces: [] },
        { time: 0.5, faces: [] },
        { time: 1.0, faces: [] },
        { time: 1.5, faces: [{ x: 0.4, y: 0.3, width: 0.2, height: 0.2, center_x: 0.5, center_y: 0.4, area: 0.04, confidence: 0.8 }] },
        { time: 2.0, faces: [] },
      ];

      const { layoutMode } = SmartReframeService.determineOptimalLayoutMode(samplesWithNoFaces);
      assert.equal(layoutMode, 'blur', 'Should choose blur layout when faces are absent');
    });

    test('determineOptimalLayoutMode chooses split for two persistent side-by-side conversationalists', () => {
      const samplesWithTwoSpeakers: ReframeSample[] = Array.from({ length: 10 }, (_, i) => ({
        time: i * 0.5,
        faces: [
          { x: 0.15, y: 0.3, width: 0.2, height: 0.2, center_x: 0.25, center_y: 0.4, area: 0.04, confidence: 0.9 },
          { x: 0.65, y: 0.3, width: 0.2, height: 0.2, center_x: 0.75, center_y: 0.4, area: 0.04, confidence: 0.9 },
        ],
      }));

      const { layoutMode, speaker1X, speaker2X } = SmartReframeService.determineOptimalLayoutMode(samplesWithTwoSpeakers);
      assert.equal(layoutMode, 'split', 'Should detect two-speaker podcast format');
      assert.equal(speaker1X, 0.25, 'Should identify speaker 1 on left');
      assert.equal(speaker2X, 0.75, 'Should identify speaker 2 on right');
    });

    test('buildLayoutCropFilter dispatches cleanly to selected layout mode', () => {
      const splitFilter = SmartReframeService.buildLayoutCropFilter({
        layoutMode: 'split',
        aspectRatio: '9:16',
        sourceWidth: 1920,
        sourceHeight: 1080,
        duration: 30,
        speaker1X: 0.25,
        speaker2X: 0.75,
      });
      assert.ok(splitFilter.includes('vstack'), 'Split filter must contain vstack');

      const blurFilter = SmartReframeService.buildLayoutCropFilter({
        layoutMode: 'blur',
        aspectRatio: '9:16',
        sourceWidth: 1920,
        sourceHeight: 1080,
        duration: 30,
      });
      assert.ok(blurFilter.includes('boxblur'), 'Blur filter must contain boxblur');
    });
  });

  describe('2. OpenShorts & AutoClip Selection Intelligence', () => {
    test('calculateDynamicClipTargets scales targets dynamically with video duration', () => {
      const shortVideo = ClipAnalysisService.calculateDynamicClipTargets(180); // 3 minutes
      assert.equal(shortVideo.targetClips, 2);

      const mediumVideo = ClipAnalysisService.calculateDynamicClipTargets(900); // 15 minutes
      assert.equal(mediumVideo.targetClips, 4);

      const hourVideo = ClipAnalysisService.calculateDynamicClipTargets(3600); // 60 minutes
      assert.equal(hourVideo.targetClips, 8);

      const podcast = ClipAnalysisService.calculateDynamicClipTargets(7200); // 2 hours
      assert.ok(podcast.targetClips >= 14 && podcast.targetClips <= 18);
    });

    test('deduplicateCandidates enforces strict 25% overlap threshold', () => {
      const candidates = [
        { id: 'c1', start_seconds: 10, end_seconds: 40, engagement_score: 95 }, // dur 30s
        { id: 'c2', start_seconds: 20, end_seconds: 50, engagement_score: 85 }, // overlaps 20s (20/30 = 66% >= 25%) -> should be dropped
        { id: 'c3', start_seconds: 60, end_seconds: 90, engagement_score: 90 }, // distinct -> kept
      ];

      const deduped = ClipAnalysisService.deduplicateCandidates(candidates, 0.25);
      assert.equal(deduped.length, 2);
      assert.equal(deduped[0].id, 'c1');
      assert.equal(deduped[1].id, 'c3');
    });

    test('filterWithAutoRelaxation prevents zero-clip project failures', () => {
      const lowScoringCandidates = [
        { id: 'c1', engagement_score: 62 },
        { id: 'c2', engagement_score: 58 },
        { id: 'c3', engagement_score: 54 },
      ];

      // Initial strict threshold 75 would normally reject all 3
      const result = ClipAnalysisService.filterWithAutoRelaxation(lowScoringCandidates, 75, 2);
      assert.equal(result.wasRelaxed, true, 'Should indicate threshold was relaxed');
      assert.equal(result.effectiveThreshold, 55, 'Should step down to threshold that captures candidates');
      assert.equal(result.filtered.length, 2, 'Should return at least minExpected candidates');
    });
  });

  describe('3. Hypit Viral Video Cloning & Word-Anchored Effects', () => {
    test('generateHookVariants outputs 5 distinct high-converting viral hooks', () => {
      const variants = ViralCloneService.generateHookVariants('The fastest way to grow on YouTube');
      assert.equal(variants.length, 5);

      const types = variants.map((v) => v.hook_type);
      assert.ok(types.includes('contrarian'));
      assert.ok(types.includes('question'));
      assert.ok(types.includes('shocking_stat'));
      assert.ok(types.includes('story'));
      assert.ok(types.includes('curiosity_gap'));

      for (const v of variants) {
        assert.ok(v.hook_text.length > 10);
        assert.ok(Array.isArray(v.suggested_caption_burst) && v.suggested_caption_burst.length > 0);
      }
    });

    test('anchorEffectToWord binds effect to deterministic word_id rather than absolute timestamp', () => {
      const sampleWord: TranscriptWord = {
        word: 'exponential',
        start: 14.28,
        end: 14.92,
      };

      const effect = ViralCloneService.anchorEffectToWord('zoom_punch_in', sampleWord, 42);
      assert.ok(effect.word_id.startsWith('w_42_'), 'Must generate deterministic word ID');
      assert.equal(effect.word_text, 'exponential');
      assert.equal(effect.effect_type, 'zoom_punch_in');
    });

    test('decompileReferenceStructure extracts pacing and recommended caption preset from words', () => {
      const words: TranscriptWord[] = Array.from({ length: 60 }, (_, i) => ({
        word: `token${i}`,
        start: i * 0.3,
        end: (i + 1) * 0.3,
      })); // 60 words in 18 seconds = 200 WPM (rapid fire)

      const recipe = ViralCloneService.decompileReferenceStructure(words, 18);
      assert.equal(recipe.pacing, 'rapid_fire');
      assert.equal(recipe.caption_style_recommended, 'beasty');
      assert.equal(recipe.average_burst_word_count, 2);
    });
  });

  describe('4. VireoClip Model Context Protocol (MCP) Server', () => {
    test('listTools exposes comprehensive agent tools', () => {
      const tools = VireoMcpServer.listTools();
      assert.ok(tools.length >= 5);

      const toolNames = tools.map((t) => t.name);
      assert.ok(toolNames.includes('vireoclip_get_system_status'));
      assert.ok(toolNames.includes('vireoclip_calculate_clip_targets'));
      assert.ok(toolNames.includes('vireoclip_generate_hook_variants'));
      assert.ok(toolNames.includes('vireoclip_get_layout_filter'));
      assert.ok(toolNames.includes('vireoclip_deduplicate_candidates'));
    });

    test('callTool executes vireoclip_get_system_status', async () => {
      const res = await VireoMcpServer.callTool({ name: 'vireoclip_get_system_status' });
      assert.equal(res.isError, undefined);
      const parsed = JSON.parse(res.content[0].text);
      assert.equal(parsed.status, 'ready');
      assert.ok(parsed.supported_layouts.includes('split'));
      assert.ok(parsed.supported_layouts.includes('blur'));
    });

    test('callTool executes vireoclip_calculate_clip_targets', async () => {
      const res = await VireoMcpServer.callTool({
        name: 'vireoclip_calculate_clip_targets',
        arguments: { durationSeconds: 600 }, // 10 minutes
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.equal(parsed.targetClips, 4);
    });

    test('callTool executes vireoclip_generate_hook_variants', async () => {
      const res = await VireoMcpServer.callTool({
        name: 'vireoclip_generate_hook_variants',
        arguments: { topic: 'Coding with AI tools' },
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.equal(parsed.variants.length, 5);
    });

    test('callTool executes vireoclip_get_layout_filter', async () => {
      const res = await VireoMcpServer.callTool({
        name: 'vireoclip_get_layout_filter',
        arguments: { layoutMode: 'split', speaker1X: 0.3, speaker2X: 0.7 },
      });
      const parsed = JSON.parse(res.content[0].text);
      assert.equal(parsed.layoutMode, 'split');
      assert.ok(parsed.filter.includes('vstack'));
    });
  });

  describe('5. Genre-Aware Framing & ClipAnything 2.0 Natural Language Discovery', () => {
    test('All 11 canonical genre profiles specify layout mode and caption safe zone', () => {
      const genres: ContentGenre[] = [
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

      for (const g of genres) {
        const profile = GenreIntelligenceService.GENRE_PROFILES[g];
        assert.ok(profile, `Profile must exist for ${g}`);
        assert.ok(profile.recommendedLayoutMode, `Profile ${g} must recommend a layout mode`);
        assert.ok(
          ['split', 'screencast', 'blur', 'track'].includes(profile.recommendedLayoutMode),
          `Layout mode for ${g} must be split, screencast, blur, or track`
        );
        assert.ok(profile.captionSafePlacement, `Profile ${g} must specify caption safe placement`);
        assert.ok(
          ['top', 'center', 'bottom'].includes(profile.captionSafePlacement),
          `Caption placement for ${g} must be top, center, or bottom`
        );
      }

      // Check specific tailored mappings
      assert.equal(GenreIntelligenceService.GENRE_PROFILES.podcast_interview.recommendedLayoutMode, 'split');
      assert.equal(GenreIntelligenceService.GENRE_PROFILES.podcast_interview.captionSafePlacement, 'center');
      assert.equal(GenreIntelligenceService.GENRE_PROFILES.education_tutorial.recommendedLayoutMode, 'screencast');
      assert.equal(GenreIntelligenceService.GENRE_PROFILES.education_tutorial.captionSafePlacement, 'bottom');
    });

    test('parseNaturalLanguageSearchIntent resolves English and Hinglish queries accurately', () => {
      // English podcast query
      const engPodcast = GenreIntelligenceService.parseNaturalLanguageSearchIntent(
        'Find the best moments from this podcast interview where they debate the future'
      );
      assert.equal(engPodcast.detectedGenre, 'podcast_interview');
      assert.ok(engPodcast.focusKeywords.includes('debate'));
      assert.ok(engPodcast.editorialDirective?.includes('User explicitly requested'));

      // Hinglish comedy query
      const hinglishComedy = GenreIntelligenceService.parseNaturalLanguageSearchIntent(
        'bhai mast funny aur comedy part nikalo with best jokes'
      );
      assert.equal(hinglishComedy.detectedGenre, 'comedy_entertainment');
      assert.ok(hinglishComedy.focusKeywords.includes('funny') || hinglishComedy.focusKeywords.includes('jokes'));

      // Gaming query
      const gaming = GenreIntelligenceService.parseNaturalLanguageSearchIntent(
        'sick clutch highlights in gameplay stream'
      );
      assert.equal(gaming.detectedGenre, 'gaming');

      // Education query
      const edu = GenreIntelligenceService.parseNaturalLanguageSearchIntent(
        'how to tutorial for beginners step by step guide'
      );
      assert.equal(edu.detectedGenre, 'education_tutorial');
    });

    test('ClipPromptService injects recommended layout mode and safe zone rules into prompts', () => {
      const systemPrompt = ClipPromptService.getSystemPrompt(
        GenreIntelligenceService.getGenreProfile('podcast_interview')
      );
      assert.ok(
        systemPrompt.includes('Recommended 9:16 Framing: SPLIT'),
        'System prompt must instruct LLM on layout mode assignment'
      );
      assert.ok(
        systemPrompt.includes('Caption Safe Zone: CENTER'),
        'System prompt must instruct LLM on caption placement'
      );

      const userPrompt = ClipPromptService.buildClipAnalysisPrompt({
        segments: [
          { text: 'Hello and welcome to our podcast.', start: 0, end: 5 },
          { text: 'Glad to be here! Let us debate.', start: 5, end: 10 },
        ],
        genreProfile: GenreIntelligenceService.getGenreProfile('podcast_interview'),
        customInstructions: 'show me their opening debate',
      });

      assert.ok(userPrompt.includes('GENRE INTELLIGENCE (Podcast & Interview)'), 'User prompt must include genre');
      assert.ok(userPrompt.includes('Recommended 9:16 Framing: SPLIT'), 'User prompt must specify recommended split layout');
      assert.ok(userPrompt.includes('show me their opening debate'), 'User prompt must include natural language query');
    });
  });

  describe('6. Multi-Modal Saliency Classification & Cold Open Inversion Engine', () => {
    test('classifyVideoGenreLocally boosts education_tutorial when screenShareDetected is true', () => {
      const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
        wpm: 140,
        ocrDensityPerMin: 1.5,
        faceCount: 1,
        sceneCutRatePerMin: 2.0,
        silenceRatio: 0.10,
        transcriptText: 'In this tutorial let me show you step by step how to code this function.',
        screenShareDetected: true,
      });

      assert.equal(suggestion.genre, 'education_tutorial');
      assert.ok(suggestion.confidence >= 0.70);
      assert.ok(suggestion.reasons.some((r) => r.includes('presentation') || r.includes('editor')));
    });

    test('classifyVideoGenreLocally boosts comedy_entertainment when audienceLaughterDetected is true', () => {
      const suggestion = GenreIntelligenceService.classifyVideoGenreLocally({
        wpm: 125,
        faceCount: 1,
        sceneCutRatePerMin: 3.0,
        silenceRatio: 0.20,
        transcriptText: 'So my friend told me this hilarious standup joke and the comedy punchline was insane.',
        audienceLaughterDetected: true,
      });

      assert.equal(suggestion.genre, 'comedy_entertainment');
      assert.ok(suggestion.confidence >= 0.70);
      assert.ok(suggestion.reasons.some((r) => r.includes('laughter')));
    });

    test('parseAIResponse correctly parses cold_open_segment_index', () => {
      const mockLlmResponse = {
        clips: [
          {
            start_segment_index: 10,
            end_segment_index: 25,
            cold_open_segment_index: 24,
            title: 'How I lost $50k in 3 seconds',
            hook: 'And that is how I lost $50,000!',
            reason: 'Insane viral financial punchline',
            category: 'controversial',
            hook_score: 95,
            standalone_score: 90,
            insight_score: 85,
            emotion_score: 98,
            platform_score: 92,
          },
        ],
      };

      const parsed = ClipAnalysisService.parseAIResponse(mockLlmResponse);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].cold_open_segment_index, 24);
      assert.equal(parsed[0].title, 'How I lost $50k in 3 seconds');
    });

    test('buildInitialProject generates non-linear multi-slice video track when cold_open is present', () => {
      const mockClip: ClipRecord = {
        id: 'clip_cold_open_test',
        project_id: 'proj_123',
        user_id: 'user_123',
        title: 'Cold Open Test Clip',
        start_seconds: 100,
        end_seconds: 140, // 40s duration
        duration_seconds: 40,
        aspect_ratio: '9:16',
        crop_mode: 'center',
        render_status: 'draft',
        source_storage_path: '/path/to/source.mp4',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        cold_open: {
          enabled: true,
          start_seconds: 136,
          end_seconds: 139,
          duration_seconds: 3.0,
          teaser_text: 'The biggest mistake of my life.',
          transition_effect: 'whoosh',
        },
      };

      const project = (ProEditorService as any).buildInitialProject(
        mockClip,
        'user_123',
        null,
        null,
        { clip_id: mockClip.id }
      );

      assert.ok(project);
      assert.equal(project.canvas.duration, 43.0, 'Canvas duration must be main duration (40s) + teaser (3s)');

      const videoTrack = project.tracks.find((t: any) => t.type === 'VIDEO');
      assert.ok(videoTrack);
      assert.equal(videoTrack.items.length, 2, 'Video track must contain 2 slices: teaser slice + main story slice');

      // Teaser slice assertions
      const teaserItem = videoTrack.items[0];
      assert.equal(teaserItem.timeline_start, 0);
      assert.equal(teaserItem.timeline_end, 3.0);
      assert.equal(teaserItem.source_start, 136);
      assert.equal(teaserItem.source_end, 139);

      // Main story slice assertions
      const storyItem = videoTrack.items[1];
      assert.equal(storyItem.timeline_start, 3.0);
      assert.equal(storyItem.timeline_end, 43.0);
      assert.equal(storyItem.source_start, 100);
      assert.equal(storyItem.source_end, 140);
    });
  });

  describe('7. Genre-Adaptive Silence Trimming & Word-Anchored SFX Engine', () => {
    const sampleWords: TranscriptWord[] = [
      { word: 'Hello', start: 0.1, end: 0.4 },
      { word: 'world,', start: 0.5, end: 0.8 },
      // 0.4s pause between 0.8 and 1.2
      { word: 'this', start: 1.2, end: 1.5 },
      { word: 'is', start: 1.6, end: 1.8 },
      { word: 'critical.', start: 1.9, end: 2.3 },
      // 0.7s pause between 2.3 and 3.0
      { word: 'We', start: 3.0, end: 3.2 },
      { word: 'made', start: 3.3, end: 3.5 },
      { word: '$50,000', start: 3.6, end: 4.1 },
    ];

    test('evaluateDeadSpaceCuts aggressively jump-cuts 0.4s pauses for education_tutorial', () => {
      const op = (ProducerPlanningService as any).evaluateDeadSpaceCuts(
        0.0,
        5.0,
        sampleWords,
        null,
        'AGGRESSIVE',
        'education_tutorial'
      );

      assert.ok(op, 'Should generate pause cut operation for education_tutorial');
      assert.equal(op.type, 'REMOVE_RANGE');
      assert.ok(op.parameters.cut_ranges.length >= 1, 'Must cut pauses >= 0.28s in aggressive mode');
      assert.ok(op.reason.includes('Education & Tutorial'));
    });

    test('evaluateDeadSpaceCuts preserves comedic pauses for comedy_entertainment and sports', () => {
      const comedyOp = (ProducerPlanningService as any).evaluateDeadSpaceCuts(
        0.0,
        5.0,
        sampleWords,
        null,
        'AGGRESSIVE',
        'comedy_entertainment'
      );
      assert.equal(comedyOp, null, 'Must preserve comedic pauses and punchline anticipation');

      const sportsOp = (ProducerPlanningService as any).evaluateDeadSpaceCuts(
        0.0,
        5.0,
        sampleWords,
        null,
        'AGGRESSIVE',
        'sports'
      );
      assert.equal(sportsOp, null, 'Must preserve continuous athletic flow');
    });

    test('SoundDesignService generates deterministic, word-anchored cues', () => {
      const cues = SoundDesignService.generateSoundDesignCues({
        words: sampleWords,
        durationSeconds: 15.0,
        coldOpenActive: true,
        coldOpenDuration: 2.0,
        genre: 'business_finance',
        minIntervalSec: 1.2,
      });

      assert.ok(cues.length >= 2, 'Must generate multiple SFX cues');

      // Check cold open whoosh
      const whooshCue = cues.find((c) => c.type === 'whoosh');
      assert.ok(whooshCue, 'Must generate whoosh at cold open boundary');
      assert.equal(whooshCue.timeline_time, 2.0);

      // Check number/currency ding
      const dingCue = cues.find((c) => c.type === 'ding');
      assert.ok(dingCue, 'Must generate ding on currency word ($50,000)');
      assert.equal(dingCue.word_text, '$50,000');

      // Check track conversion
      const sfxTrack = SoundDesignService.createSfxTrack(cues, 15.0);
      assert.equal(sfxTrack.type, 'AUDIO');
      assert.equal(sfxTrack.name, 'Sound Design (SFX)');
      assert.equal(sfxTrack.items.length, cues.length);

      // Check FFmpeg synthesis filter compilation
      const filterRes = SoundDesignService.compileSfxSynthesisFilter(cues, '[0:a]', '[out_a]');
      assert.ok(filterRes.filterLines.length > 0);
      assert.ok(filterRes.filterLines.some((l) => l.includes('sine=') || l.includes('anoisesrc')));
      assert.ok(filterRes.filterLines.some((l) => l.includes('amix=')));
      assert.equal(filterRes.finalTag, '[out_a]');
    });
  });

});
