import {
  ContentGenre,
  ContentGoal,
  ClipPreferences,
  GenreProfileConfig,
  GenreSuggestion,
  ClipAspectRatio,
  CreatorProfileData,
  CaptionStyle,
} from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface ClassifyGenreMetricsInput {
  wpm?: number;
  ocrDensityPerMin?: number;
  faceCount?: number;
  sceneCutRatePerMin?: number;
  silenceRatio?: number;
  transcriptText?: string;
  questionDensityPerMin?: number;
  durationSeconds?: number;
  audioPeakEnergyDb?: number;
  visualMotionScore?: number;
  audienceLaughterDetected?: boolean;
  screenShareDetected?: boolean;
}

export class GenreIntelligenceService {
  /**
   * The canonical 11-Genre Profile Registry.
   * Every profile specifies weights that sum strictly to 1.0,
   * narrative arc prompt directives, editorial safeguards, and producer defaults.
   */
  public static readonly GENRE_PROFILES: Record<ContentGenre, GenreProfileConfig> = {
    podcast_interview: {
      genre: 'podcast_interview',
      displayName: 'Podcast & Interview',
      description: 'Conversational exchanges, guest perspectives, debates, and Q&A dynamics.',
      defaultGoal: 'shareable_moments',
      targetDuration: { min: 30, max: 75, optimal: 45 },
      recommendedLayoutMode: 'split',
      captionSafePlacement: 'center',
      naturalLanguageKeywords: ['podcast', 'interview', 'guest', 'host', 'conversation', 'baat cheet', 'charcha', 'interviews', 'discussion', 'two people', 'talking'],
      scoringWeights: {
        hook: 0.25,
        standalone: 0.30,
        insight: 0.25,
        audio: 0.10,
        visual: 0.10,
      },
      redundancyPenalty: 0.6,
      reframeConfig: {
        maxVelocity: 1.2,
        smoothingAlpha: 0.22,
        deadZone: 0.05,
        preferTwoShot: true,
      },
      producerDefaults: {
        allowInteriorPauseCuts: true,
        pauseThresholdSec: 0.85,
        captionStyle: 'highlight',
        punchInClimax: false,
        hookBannerEnabled: false,
      },
      selectionObjective:
        'Prioritize strong opinions, back-and-forth Q&A, intellectual tension, and contrarian perspectives.',
      narrativeArcPrompt:
        'Capture a complete conversational turn: include the initiating question or premise, the core perspective, and the decisive takeaway.',
      editorialSafeguard:
        'Never start on an isolated response without the preceding question or setup. Never truncate speaker thoughts mid-exchange.',
    },

    education_tutorial: {
      genre: 'education_tutorial',
      displayName: 'Education & Tutorial',
      description: 'Tactical workflows, step-by-step guides, code demos, and conceptual breakdowns.',
      defaultGoal: 'teach_one_idea',
      targetDuration: { min: 35, max: 85, optimal: 60 },
      recommendedLayoutMode: 'screencast',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['tutorial', 'coding', 'code', 'demo', 'guide', 'sikho', 'how to', 'tips', 'tricks', 'step by step', 'lecture', 'teaching'],
      scoringWeights: {
        hook: 0.20,
        standalone: 0.35,
        insight: 0.30,
        audio: 0.05,
        visual: 0.10,
      },
      redundancyPenalty: 0.6,
      reframeConfig: {
        maxVelocity: 0.8,
        smoothingAlpha: 0.15,
        deadZone: 0.08,
        preferTwoShot: false,
      },
      producerDefaults: {
        allowInteriorPauseCuts: true,
        pauseThresholdSec: 0.35,
        captionStyle: 'clean',
        punchInClimax: false,
        hookBannerEnabled: true,
      },
      selectionObjective:
        'Identify actionable steps, frameworks, or conceptual insights that teach one clear lesson completely.',
      narrativeArcPrompt:
        'Follow an educational structure: clear problem/concept statement -> tactical breakdown or demonstration -> definitive practical takeaway.',
      editorialSafeguard:
        'Require complete setup + action + conclusion. Reject cutoffs mid-instruction, mid-clause, or on dangling explanations.',
    },

    motivation: {
      genre: 'motivation',
      displayName: 'Motivation & Mindset',
      description: 'Inspiring personal transformations, discipline philosophies, and high-conviction speeches.',
      defaultGoal: 'shareable_moments',
      targetDuration: { min: 25, max: 60, optimal: 40 },
      recommendedLayoutMode: 'track',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['motivation', 'mindset', 'inspire', 'josh', 'speech', 'discipline', 'hustle', 'life lesson', 'powerful', 'struggle', 'success'],
      scoringWeights: {
        hook: 0.35,
        standalone: 0.25,
        insight: 0.20,
        audio: 0.10,
        visual: 0.10,
      },
      redundancyPenalty: 0.6,
      reframeConfig: {
        maxVelocity: 1.0,
        smoothingAlpha: 0.18,
        deadZone: 0.04,
        preferTwoShot: false,
      },
      producerDefaults: {
        allowInteriorPauseCuts: true,
        pauseThresholdSec: 1.0,
        captionStyle: 'bold',
        punchInClimax: true,
        hookBannerEnabled: false,
      },
      selectionObjective:
        'Highlight intense emotional conviction, vulnerable triumph arcs, resilience lessons, and transformative mindsets.',
      narrativeArcPrompt:
        'Build emotional resonance: start with the struggle or hard truth -> escalate conviction and energy -> climax on the unforgettable maxim.',
      editorialSafeguard:
        'Preserve dramatic tension pauses before emotional climaxes; do not over-cut silence or rush the speaker.',
    },

    business_finance: {
      genre: 'business_finance',
      displayName: 'Business & Finance',
      description: 'Growth strategies, ROI breakdowns, financial markets, startup insights, and metrics.',
      defaultGoal: 'teach_one_idea',
      targetDuration: { min: 20, max: 60, optimal: 40 },
      recommendedLayoutMode: 'track',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['business', 'finance', 'money', 'paisa', 'investing', 'startup', 'roi', 'valuation', 'sales', 'profit', 'stock market', 'crypto'],
      scoringWeights: {
        hook: 0.30,
        standalone: 0.30,
        insight: 0.25,
        audio: 0.05,
        visual: 0.10,
      },
      redundancyPenalty: 0.6,
      reframeConfig: {
        maxVelocity: 0.9,
        smoothingAlpha: 0.16,
        deadZone: 0.06,
        preferTwoShot: false,
      },
      producerDefaults: {
        allowInteriorPauseCuts: true,
        pauseThresholdSec: 0.75,
        captionStyle: 'highlight',
        punchInClimax: false,
        hookBannerEnabled: false,
      },
      selectionObjective:
        'Prioritize specific metrics, unit economics, ROI percentages, case studies, and contrarian market insights.',
      narrativeArcPrompt:
        'Anchor around concrete value: hook with a surprising metric or business dilemma -> explain the underlying mechanism -> summarize the financial ROI or lesson.',
      editorialSafeguard:
        'Preserve financial context and qualifiers (e.g., "in our best year", "pre-tax", "with 50 staff"). Prevent misleading out-of-context claims.',
    },

    gaming: {
      genre: 'gaming',
      displayName: 'Gaming & Streams',
      description: 'High-octane clutch moments, hilarious fails, unexpected bugs, and streamer reactions.',
      defaultGoal: 'shareable_moments',
      targetDuration: { min: 15, max: 45, optimal: 28 },
      recommendedLayoutMode: 'screencast',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['gaming', 'game', 'stream', 'clutch', 'fail', 'bgmi', 'minecraft', 'gta', 'valorant', 'kill', 'gameplay', 'streamer'],
      scoringWeights: {
        hook: 0.40,
        standalone: 0.15,
        insight: 0.10,
        audio: 0.20,
        visual: 0.15,
      },
      redundancyPenalty: 0.3,
      reframeConfig: {
        maxVelocity: 1.6,
        smoothingAlpha: 0.30,
        deadZone: 0.03,
        preferTwoShot: false,
      },
      producerDefaults: {
        allowInteriorPauseCuts: true,
        pauseThresholdSec: 0.50,
        captionStyle: 'karaoke',
        punchInClimax: true,
        hookBannerEnabled: false,
      },
      selectionObjective:
        'Detect sudden gameplay spikes, clutch triumphs, hilarious blunders, and loud authentic streamer reactions.',
      narrativeArcPrompt:
        'Fast-paced sequence: the stakes or challenge -> the sudden chaotic climax or clutch execution -> the unfiltered reaction and laugh.',
      editorialSafeguard:
        'Avoid selecting pure high noise without gameplay resolution or emotional payoff. Require both the action and the reaction.',
    },

    sports: {
      genre: 'sports',
      displayName: 'Sports & Athletics',
      description: 'Decisive athletic plays, match highlights, tactical commentary, and competitive drama.',
      defaultGoal: 'shareable_moments',
      targetDuration: { min: 15, max: 50, optimal: 30 },
      recommendedLayoutMode: 'blur',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['sports', 'match', 'cricket', 'football', 'athletic', 'goal', 'six', 'wicket', 'highlight', 'khel', 'play'],
      scoringWeights: {
        hook: 0.35,
        standalone: 0.20,
        insight: 0.10,
        audio: 0.20,
        visual: 0.15,
      },
      redundancyPenalty: 0.3,
      reframeConfig: {
        maxVelocity: 1.8,
        smoothingAlpha: 0.35,
        deadZone: 0.04,
        preferTwoShot: false,
      },
      producerDefaults: {
        allowInteriorPauseCuts: false,
        pauseThresholdSec: 1.5,
        captionStyle: 'bold',
        punchInClimax: false,
        hookBannerEnabled: false,
      },
      selectionObjective:
        'Spot key athletic plays, game-winning moments, controversial referee calls, and commentary excitement.',
      narrativeArcPrompt:
        'Athletic sequence: setup of the play -> continuous athletic execution -> the goal/score/finish -> player and crowd celebration.',
      editorialSafeguard:
        'CRITICAL: NEVER jump-cut continuous athletic action. Start before play setup; end after celebration/whistle. allowInteriorPauseCuts must remain FALSE.',
    },

    news_politics: {
      genre: 'news_politics',
      displayName: 'News & Current Affairs',
      description: 'Policy announcements, debate clashes, investigative exposés, and global events.',
      defaultGoal: 'teach_one_idea',
      targetDuration: { min: 25, max: 75, optimal: 45 },
      recommendedLayoutMode: 'track',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['news', 'politics', 'debate', 'samachar', 'policy', 'minister', 'current affairs', 'breaking', 'election'],
      scoringWeights: {
        hook: 0.25,
        standalone: 0.40,
        insight: 0.25,
        audio: 0.05,
        visual: 0.05,
      },
      redundancyPenalty: 0.7,
      reframeConfig: {
        maxVelocity: 0.8,
        smoothingAlpha: 0.14,
        deadZone: 0.06,
        preferTwoShot: false,
      },
      producerDefaults: {
        allowInteriorPauseCuts: true,
        pauseThresholdSec: 0.80,
        captionStyle: 'clean',
        punchInClimax: false,
        hookBannerEnabled: false,
      },
      selectionObjective:
        'Identify significant policy claims, sharp debate rebuttals, investigative findings, and breaking revelations.',
      narrativeArcPrompt:
        'Journalistic clarity: lead with the core claim or event -> present the evidence or contrasting view -> conclude with the civic/economic implication.',
      editorialSafeguard:
        'Strict context integrity: Never truncate counter-arguments, modifying clauses, or factual nuances. Disallow misleading selective quotes.',
    },

    comedy_entertainment: {
      genre: 'comedy_entertainment',
      displayName: 'Comedy & Entertainment',
      description: 'Stand-up comedy, witty banter, humorous storytelling, comedic sketches, and roasts.',
      defaultGoal: 'shareable_moments',
      targetDuration: { min: 15, max: 60, optimal: 35 },
      recommendedLayoutMode: 'track',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['comedy', 'funny', 'joke', 'haso', 'laugh', 'humor', 'roast', 'fun', 'meme', 'mast joke', 'standup'],
      scoringWeights: {
        hook: 0.35,
        standalone: 0.30,
        insight: 0.10,
        audio: 0.10,
        visual: 0.15,
      },
      redundancyPenalty: 0.4,
      reframeConfig: {
        maxVelocity: 1.2,
        smoothingAlpha: 0.24,
        deadZone: 0.04,
        preferTwoShot: true,
      },
      producerDefaults: {
        allowInteriorPauseCuts: false,
        pauseThresholdSec: 1.5,
        captionStyle: 'karaoke',
        punchInClimax: true,
        hookBannerEnabled: false,
      },
      selectionObjective:
        'Isolate comedic setups, escalations, absurd observations, and explosive punchlines with full timing intact.',
      narrativeArcPrompt:
        'Classic comedic structure: premise/setup -> comedic escalation or callback -> decisive punchline and laughter payoff.',
      editorialSafeguard:
        'CRITICAL: Comedic timing relies on pauses before punchlines. allowInteriorPauseCuts MUST remain FALSE so pauses are never cut.',
    },

    storytelling: {
      genre: 'storytelling',
      displayName: 'Storytelling & Lore',
      description: 'Personal anecdotes, true crime, historical tales, founder journeys, and narrative arcs.',
      defaultGoal: 'mini_story',
      targetDuration: { min: 45, max: 90, optimal: 60 },
      recommendedLayoutMode: 'track',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['story', 'kahani', 'narrative', 'experience', 'kissa', 'incident', 'what happened', 'plot', 'mystery'],
      scoringWeights: {
        hook: 0.30,
        standalone: 0.30,
        insight: 0.25,
        audio: 0.05,
        visual: 0.10,
      },
      redundancyPenalty: 0.8,
      reframeConfig: {
        maxVelocity: 0.9,
        smoothingAlpha: 0.15,
        deadZone: 0.05,
        preferTwoShot: false,
      },
      producerDefaults: {
        allowInteriorPauseCuts: true,
        pauseThresholdSec: 0.85,
        captionStyle: 'minimal',
        punchInClimax: false,
        hookBannerEnabled: false,
      },
      selectionObjective:
        'Capture a complete 3-act narrative arc: hook premise -> escalating journey or crisis -> surprising reveal or lesson.',
      narrativeArcPrompt:
        'Narrative arc: hook the listener into the scene -> build tension or suspense through the central struggle -> deliver the resolution and personal realization.',
      editorialSafeguard:
        'Require narrative closure. Never cut off before the resolution or the moral/takeaway of the story.',
    },

    product_marketing: {
      genre: 'product_marketing',
      displayName: 'Product & Marketing',
      description: 'Product launches, feature demonstrations, SaaS walkthroughs, and customer transformation stories.',
      defaultGoal: 'teach_one_idea',
      targetDuration: { min: 20, max: 60, optimal: 35 },
      recommendedLayoutMode: 'screencast',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['product', 'unboxing', 'review', 'ad', 'launch', 'feature', 'demo', 'gadget', 'phone', 'hardware'],
      scoringWeights: {
        hook: 0.35,
        standalone: 0.30,
        insight: 0.20,
        audio: 0.05,
        visual: 0.10,
      },
      redundancyPenalty: 0.5,
      reframeConfig: {
        maxVelocity: 0.9,
        smoothingAlpha: 0.18,
        deadZone: 0.05,
        preferTwoShot: false,
      },
      producerDefaults: {
        allowInteriorPauseCuts: true,
        pauseThresholdSec: 0.65,
        captionStyle: 'highlight',
        punchInClimax: false,
        hookBannerEnabled: true,
      },
      selectionObjective:
        'Highlight clear problem agitation, product reveal, workflow demonstration, and undeniable proof of outcome.',
      narrativeArcPrompt:
        'Marketing framework: agitate the existing painful friction -> show the instant product solution -> prove the result or ROI.',
      editorialSafeguard:
        'Highlight genuine customer friction and proof. Do not fabricate claims or cut before the demo is clear.',
    },

    general: {
      genre: 'general',
      displayName: 'General Short-Form',
      description: 'Balanced baseline profile suited for any broad short-form video content.',
      defaultGoal: 'shareable_moments',
      targetDuration: { min: 20, max: 60, optimal: 40 },
      recommendedLayoutMode: 'track',
      captionSafePlacement: 'bottom',
      naturalLanguageKeywords: ['general', 'all', 'clip', 'shorts', 'reel', 'video', 'highlight'],
      scoringWeights: {
        hook: 0.25,
        standalone: 0.25,
        insight: 0.25,
        audio: 0.10,
        visual: 0.15,
      },
      redundancyPenalty: 0.5,
      reframeConfig: {
        maxVelocity: 1.0,
        smoothingAlpha: 0.20,
        deadZone: 0.05,
        preferTwoShot: false,
      },
      producerDefaults: {
        allowInteriorPauseCuts: true,
        pauseThresholdSec: 0.75,
        captionStyle: 'clean',
        punchInClimax: false,
        hookBannerEnabled: false,
      },
      selectionObjective:
        'Locate high-value standalone moments with compelling hooks, clear thoughts, and decisive endings.',
      narrativeArcPrompt:
        'Balanced structure: strong opening hook line -> engaging core discussion -> complete resolution.',
      editorialSafeguard:
        'Ensure clean sentence boundaries, high standalone clarity, and engaging opening without rambling.',
    },
  };

  /**
   * Retrieves the profile configuration for a given genre, falling back to 'general'.
   * Unknown/misspelled genres are logged so silent quality degradation is diagnosable.
   */
  public static getGenreProfile(genre?: ContentGenre | string | null): GenreProfileConfig {
    if (genre && genre in this.GENRE_PROFILES) {
      return this.GENRE_PROFILES[genre as ContentGenre];
    }
    if (genre) {
      logger.warn(`[GenreIntelligence] Unknown genre "${genre}" requested; falling back to 'general'.`);
    }
    return this.GENRE_PROFILES.general;
  }

  /**
   * Returns all supported genre profile configurations
   */
  public static getAllGenreProfiles(): GenreProfileConfig[] {
    return Object.values(this.GENRE_PROFILES);
  }

  /**
   * Parses natural language, colloquial and Hinglish user curation queries (e.g. from Opus ClipAnything equivalent)
   * into a detected genre, focus keywords, and dynamic prompt directives.
   */
  public static parseNaturalLanguageSearchIntent(userQuery: string): {
    detectedGenre?: ContentGenre;
    focusKeywords: string[];
    editorialDirective?: string;
  } {
    if (!userQuery || typeof userQuery !== 'string' || !userQuery.trim()) {
      return { focusKeywords: [] };
    }

    const clean = userQuery.toLowerCase().trim();
    const tokens = clean.split(/[\s,.;:!?\-]+/).filter(Boolean);

    // 1. Check against genre natural language keywords and Hinglish aliases
    let matchedGenre: ContentGenre | undefined;
    let highestMatchScore = 0;

    for (const [gKey, profile] of Object.entries(this.GENRE_PROFILES) as [ContentGenre, GenreProfileConfig][]) {
      const keywords = profile.naturalLanguageKeywords || [];
      let score = 0;
      for (const kw of keywords) {
        if (clean.includes(kw)) {
          score += (kw.includes(' ') ? 3 : 1);
        }
      }
      if (score > highestMatchScore) {
        highestMatchScore = score;
        matchedGenre = gKey;
      }
    }

    // 2. Build focused editorial directive based on user's query
    let editorialDirective: string | undefined;
    if (highestMatchScore > 0 && matchedGenre) {
      const prof = this.GENRE_PROFILES[matchedGenre];
      editorialDirective = `User explicitly requested: "${userQuery}". Prioritize moments matching ${prof.displayName}: ${prof.selectionObjective}`;
    } else {
      editorialDirective = `User explicitly requested: "${userQuery}". Search transcript specifically for discussions, scenes, and moments addressing this topic.`;
    }

    // 3. Extract key non-stopword tokens as search focus keywords
    const stopWords = new Set(['find', 'me', 'the', 'part', 'where', 'they', 'talk', 'about', 'and', 'with', 'for', 'show', 'all', 'moments', 'bhai', 'wala', 'nikalo', 'karo', 'video', 'clip', 'shorts', 'reel']);
    const focusKeywords = tokens.filter((t) => t.length > 2 && !stopWords.has(t));

    return {
      detectedGenre: matchedGenre,
      focusKeywords,
      editorialDirective,
    };
  }

  /**
   * Lexicons for heuristic genre classification
   */
  private static readonly GENRE_LEXICONS: Record<ContentGenre, string[]> = {
    podcast_interview: [
      'welcome to the podcast', 'welcome to the show', 'thanks for having me', 'my guest today',
      'talk about', 'interview', 'tell me about', 'episode', 'conversation', 'what do you think',
      'host', 'guest', 'exactly', 'i agree', 'listener', 'listeners', 'show notes',
    ],
    education_tutorial: [
      'how to', 'tutorial', 'step by step', 'guide', 'lesson', 'in this video', 'let us look at',
      'let me show you', 'example', 'learn', 'course', 'documentation', 'workflow', 'concept',
      'explanation', 'method', 'technique', 'tips and tricks', 'walkthrough',
    ],
    motivation: [
      'discipline', 'mindset', 'success', 'failure', 'grind', 'hustle', 'greatness', 'sacrifice',
      'never give up', 'believe in yourself', 'pain', 'dream', 'focus', 'wake up', 'passion',
      'unstoppable', 'champion', 'struggle', 'transform', 'potential',
    ],
    business_finance: [
      'revenue', 'profit', 'margin', 'arr', 'mrr', 'valuation', 'roi', 'investor', 'equity',
      'cash flow', 'capital', 'startup', 'market cap', 'ebitda', 'stocks', 'portfolio', 'fund',
      'customer acquisition', 'growth rate', 'saas', 'sales funnel', 'pricing', 'dividend',
    ],
    gaming: [
      'gameplay', 'clutch', 'boss fight', 'respawn', 'fps', 'streamer', 'loot', 'glitch', 'mod',
      'multiplayer', 'esports', 'quest', 'level up', 'npc', 'speedrun', 'nerf', 'buff', 'co-op',
      'headshot', 'discord', 'minecraft', 'fortnite', 'roblox', 'valorant',
    ],
    sports: [
      'touchdown', 'goal', 'penalty', 'championship', 'quarterback', 'referee', 'halftime', 'match',
      'tournament', 'league', 'coach', 'stadium', 'offense', 'defense', 'striker', 'slam dunk',
      'home run', 'pitcher', 'formula 1', 'ufc', 'knockout', 'round 1',
    ],
    news_politics: [
      'government', 'policy', 'minister', 'president', 'senate', 'congress', 'parliament', 'election',
      'voters', 'legislation', 'official', 'investigation', 'spokesperson', 'breaking news',
      'court', 'supreme court', 'reform', 'foreign policy', 'treaty', 'sanctions',
    ],
    comedy_entertainment: [
      'standup', 'joke', 'hilarious', 'laugh', 'punchline', 'funny', 'comedy', 'prank', 'awkward',
      'ridiculous', 'humor', 'comedian', 'laughter', 'sketch', 'satire', 'roast', 'parody',
    ],
    storytelling: [
      'once upon a time', 'years ago', 'back in', 'i will never forget', 'that was the day',
      'suddenly', 'the truth is', 'what happened next', 'in the end', 'looking back', 'chapter',
      'incident', 'journey', 'remember when', 'and then i realized',
    ],
    product_marketing: [
      'introducing', 'features', 'product launch', 'pricing plan', 'free trial', 'demo', 'sign up',
      'discount code', 'link in bio', 'limited offer', 'customer review', 'testimonial', 'best tool',
      'our platform', 'checkout', 'buy now', 'preorder', 'solution',
    ],
    general: [],
  };

  /**
   * Deterministic local auto-genre heuristic classifier.
   * Runs in sub-millisecond local time with 0 API calls and 0 costs.
   */
  public static classifyVideoGenreLocally(input: ClassifyGenreMetricsInput): GenreSuggestion {
    const {
      wpm = 135,
      ocrDensityPerMin = 0,
      faceCount = 1,
      sceneCutRatePerMin = 3.5,
      silenceRatio = 0.12,
      transcriptText = '',
      questionDensityPerMin = 0,
    } = input;

    const lowerText = transcriptText.toLowerCase();
    const scores: Record<ContentGenre, number> = {
      podcast_interview: 0,
      education_tutorial: 0,
      motivation: 0,
      business_finance: 0,
      gaming: 0,
      sports: 0,
      news_politics: 0,
      comedy_entertainment: 0,
      storytelling: 0,
      product_marketing: 0,
      general: 0.25,
    };

    const reasons: Record<ContentGenre, string[]> = {
      podcast_interview: [],
      education_tutorial: [],
      motivation: [],
      business_finance: [],
      gaming: [],
      sports: [],
      news_politics: [],
      comedy_entertainment: [],
      storytelling: [],
      product_marketing: [],
      general: ['Default balanced baseline.'],
    };

    // 1. Keyword Lexicon Frequency Analysis
    for (const [genre, keywords] of Object.entries(this.GENRE_LEXICONS) as [ContentGenre, string[]][]) {
      if (keywords.length === 0) continue;
      let matches = 0;
      for (const kw of keywords) {
        if (lowerText.includes(kw)) {
          matches++;
        }
      }
      if (matches > 0) {
        const boost = Math.min(0.75, matches * 0.15);
        scores[genre] += boost;
        reasons[genre].push(`Matched ${matches} domain keyword(s) for ${genre}.`);
      }
    }

    // Currency and Financial Symbols
    const financialSymbols = (lowerText.match(/[\$€£¥₹%]/g) || []).length;
    if (financialSymbols >= 2) {
      scores.business_finance += 0.30;
      reasons.business_finance.push(`Detected ${financialSymbols} financial metric/currency symbol(s).`);
    }

    // 2. Multimodal Signal Heuristics
    // Sports: fast scene cuts, low speech pause ratio, rapid camera action
    if (sceneCutRatePerMin >= 10.0 && silenceRatio <= 0.16) {
      scores.sports += 0.35;
      reasons.sports.push(`High visual tempo (${sceneCutRatePerMin.toFixed(1)} cuts/min) and continuous audio.`);
    }

    // Education / Tutorial: High OCR slide density, moderate WPM
    if (ocrDensityPerMin >= 2.0) {
      scores.education_tutorial += 0.35;
      reasons.education_tutorial.push(`High on-screen slide/text density (${ocrDensityPerMin.toFixed(1)} OCR detections/min).`);
    }

    // Podcast / Interview: Multiple faces detected, elevated question mark density
    if (faceCount >= 2) {
      scores.podcast_interview += 0.30;
      reasons.podcast_interview.push(`Multiple subjects detected in frame (${faceCount} active face tracks).`);
    }
    if (questionDensityPerMin >= 2.5) {
      scores.podcast_interview += 0.20;
      reasons.podcast_interview.push(`Elevated conversational inquiry rate (${questionDensityPerMin.toFixed(1)} questions/min).`);
    }

    // Gaming: Very high visual activity with gamer keywords or fast pacing
    if (sceneCutRatePerMin >= 8.0 && scores.gaming > 0.1) {
      scores.gaming += 0.25;
      reasons.gaming.push('High visual gameplay cut frequency with active gamer terminology.');
    }

    // Comedy: Setup and timing pause silence ratio > 0.18 with laughter or comedic markers
    if (silenceRatio >= 0.18 && scores.comedy_entertainment > 0.15) {
      scores.comedy_entertainment += 0.25;
      reasons.comedy_entertainment.push('Measured pauses characteristic of comedic timing setups.');
    }

    // Storytelling: High WPM flow, low scene cuts (monologue focus)
    if (wpm >= 140 && sceneCutRatePerMin <= 4.0 && scores.storytelling > 0.15) {
      scores.storytelling += 0.20;
      reasons.storytelling.push('Continuous narrative speech cadence with stable single-camera framing.');
    }

    // Screen share detection: Definitive signal for Education / Coding Tutorial
    if (input.screenShareDetected) {
      scores.education_tutorial += 0.55;
      reasons.education_tutorial.push('Detected on-screen desktop presentation, code editor, or application window.');
    }

    // Audience laughter: Definitive signal for Comedy & Entertainment
    if (input.audienceLaughterDetected) {
      scores.comedy_entertainment += 0.55;
      reasons.comedy_entertainment.push('Acoustic audience laughter track or chuckles detected.');
    }

    // Audio peak energy + visual motion: Gaming or Sports reaction
    if (input.audioPeakEnergyDb !== undefined && input.audioPeakEnergyDb >= -18) {
      if (sceneCutRatePerMin >= 6.0 || (input.visualMotionScore && input.visualMotionScore >= 60)) {
        scores.gaming += 0.20;
        reasons.gaming.push('High-amplitude audio reaction spikes matched with rapid visual motion.');
      }
    }

    // High visual motion score: Sports & Action
    if (input.visualMotionScore && input.visualMotionScore >= 70) {
      scores.sports += 0.25;
      reasons.sports.push(`High dynamic camera/subject motion index (${input.visualMotionScore}/100).`);
    }

    // 3. Find top winning genre
    let bestGenre: ContentGenre = 'general';
    let bestScore = 0.28;

    for (const [genre, score] of Object.entries(scores) as [ContentGenre, number][]) {
      if (score > bestScore) {
        bestScore = score;
        bestGenre = genre;
      }
    }

    const confidence = Math.min(0.96, Math.max(0.50, Number(bestScore.toFixed(2))));
    const winningReasons = reasons[bestGenre].length > 0 ? reasons[bestGenre] : ['Default general recommendation based on balanced signals.'];

    return {
      genre: bestGenre,
      confidence,
      reasons: winningReasons,
      metrics: {
        wpm: Math.round(wpm),
        ocrDensity: Number(ocrDensityPerMin.toFixed(2)),
        faceCount,
        sceneCutRatePerMin: Number(sceneCutRatePerMin.toFixed(2)),
        silenceRatio: Number(silenceRatio.toFixed(2)),
      },
    };
  }

  /**
   * Normalizes incoming preferences, reconciling explicit input, legacy bracketed notes, and default fallbacks.
   */
  public static normalizePreferences(
    input?: Partial<ClipPreferences>,
    legacyNotes?: string | null
  ): ClipPreferences {
    let parsedAspect: ClipAspectRatio = '9:16';
    let parsedDuration: 'auto' | '15-30' | '30-60' | '60-90' = 'auto';
    let parsedGenre: ContentGenre | undefined = undefined;
    let parsedGoal: ContentGoal | undefined = undefined;
    let parsedTopics: string[] | undefined = undefined;

    // Parse legacy bracketed notes format if present (e.g. "[Aspect: 9:16] [Duration: 30-60] [Topics: AI, Tech]")
    if (legacyNotes) {
      const aspectMatch = legacyNotes.match(/\[Aspect:\s*([0-9:]+)\]/i);
      if (aspectMatch && ['9:16', '1:1', '16:9'].includes(aspectMatch[1])) {
        parsedAspect = aspectMatch[1] as ClipAspectRatio;
      }

      const durMatch = legacyNotes.match(/\[Duration:\s*([^\]]+)\]/i);
      if (durMatch) {
        const cleanDur = durMatch[1].trim().replace(/s$/i, '');
        if (['auto', '15-30', '30-60', '60-90'].includes(cleanDur)) {
          parsedDuration = cleanDur as any;
        } else if (cleanDur.includes('15') || cleanDur.includes('30')) {
          parsedDuration = '15-30';
        } else if (cleanDur.includes('60') && (cleanDur.includes('30') || cleanDur.includes('45'))) {
          parsedDuration = '30-60';
        } else if (cleanDur.includes('90') || cleanDur.includes('60')) {
          parsedDuration = '60-90';
        }
      }

      const genreMatch = legacyNotes.match(/\[Genre:\s*([^\]]+)\]/i);
      if (genreMatch && genreMatch[1] in this.GENRE_PROFILES) {
        parsedGenre = genreMatch[1] as ContentGenre;
      }

      const goalMatch = legacyNotes.match(/\[Goal:\s*([^\]]+)\]/i);
      if (
        goalMatch &&
        ['shareable_moments', 'teach_one_idea', 'quotes_soundbites', 'mini_story', 'custom_instructions'].includes(
          goalMatch[1]
        )
      ) {
        parsedGoal = goalMatch[1] as ContentGoal;
      }

      const topicMatch = legacyNotes.match(/\[Topics?:\s*([^\]]+)\]/i);
      if (topicMatch) {
        parsedTopics = topicMatch[1]
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }

    const resolvedGenre: ContentGenre =
      input?.genre && input.genre in this.GENRE_PROFILES
        ? input.genre
        : parsedGenre || 'general';

    if (input?.genre && !(input.genre in this.GENRE_PROFILES)) {
      logger.warn(
        `[GenreIntelligence] Unrecognized genre "${input.genre}" in clip preferences; coerced to '${resolvedGenre}'.`
      );
    }

    const defaultProfile = this.getGenreProfile(resolvedGenre);

    const resolvedGoal: ContentGoal =
      input?.contentGoal &&
      ['shareable_moments', 'teach_one_idea', 'quotes_soundbites', 'mini_story', 'custom_instructions'].includes(
        input.contentGoal
      )
        ? input.contentGoal
        : parsedGoal || defaultProfile.defaultGoal;

    return {
      genre: resolvedGenre,
      // Selection-mode default follows the UI: 'auto' when no genre was chosen
      // (enables classification), 'manual' when a client set an explicit genre
      // but omitted the mode (preserves explicit intent).
      genreSelectionMode: input?.genreSelectionMode || (input?.genre ? 'manual' : 'auto'),
      suggestedGenre: input?.suggestedGenre,
      genreConfidence: input?.genreConfidence,
      contentGoal: resolvedGoal,
      preferredDurations: input?.preferredDurations || parsedDuration,
      aspectRatio: input?.aspectRatio || parsedAspect,
      topicKeywords: Array.isArray(input?.topicKeywords)
        ? input.topicKeywords
        : parsedTopics,
      customInstructions: input?.customInstructions?.trim() || undefined,
      allowInteriorPauseCuts:
        input?.allowInteriorPauseCuts !== undefined
          ? input.allowInteriorPauseCuts
          : defaultProfile.producerDefaults.allowInteriorPauseCuts,
      captionStyle: input?.captionStyle,
      profileVersion: input?.profileVersion || 1,
    };
  }

  /**
   * Resolves effective configuration upholding strict precedence:
   * Explicit User Edit > Creator Profile Preset > Genre Default > General Fallback
   */
  public static resolveEffectiveConfig(params: {
    userPreferences?: Partial<ClipPreferences>;
    creatorProfile?: (Partial<CreatorProfileData> & {
      caption_style_preset?: CaptionStyle;
      preferred_aspect_ratio?: ClipAspectRatio;
      preferred_clip_duration?: string;
    }) | null;
    explicitOverrides?: {
      captionStyle?: CaptionStyle;
      allowInteriorPauseCuts?: boolean;
      aspectRatio?: ClipAspectRatio;
    };
  }): {
    genreProfile: GenreProfileConfig;
    contentGoal: ContentGoal;
    aspectRatio: ClipAspectRatio;
    captionStyle: CaptionStyle;
    allowInteriorPauseCuts: boolean;
    scoringWeights: GenreProfileConfig['scoringWeights'];
    targetDuration: GenreProfileConfig['targetDuration'];
  } {
    const { userPreferences, creatorProfile, explicitOverrides } = params;
    const normalized = this.normalizePreferences(userPreferences);
    const genreProfile = this.getGenreProfile(normalized.genre);

    // 1. Target Duration resolution
    let targetDuration = { ...genreProfile.targetDuration };
    if (normalized.preferredDurations === '15-30') {
      targetDuration = { min: 15, max: 30, optimal: 24 };
    } else if (normalized.preferredDurations === '30-60') {
      targetDuration = { min: 30, max: 60, optimal: 45 };
    } else if (normalized.preferredDurations === '60-90') {
      targetDuration = { min: 60, max: 90, optimal: 75 };
    }

    // 2. Caption Style precedence: Explicit Override > User Preference > Creator Profile > Genre Profile
    let captionStyle: CaptionStyle = genreProfile.producerDefaults.captionStyle;
    if (creatorProfile?.caption_style_preset) {
      captionStyle = creatorProfile.caption_style_preset;
    } else if (creatorProfile?.preferred_hook_style === 'bold') {
      captionStyle = 'bold';
    }
    if (normalized.captionStyle) {
      captionStyle = normalized.captionStyle;
    }
    if (explicitOverrides?.captionStyle) {
      captionStyle = explicitOverrides.captionStyle;
    }

    // 3. Pause Cuts precedence: Explicit Override > User Prefs > Genre Default (Enforcing comedy/sports safety)
    let allowInteriorPauseCuts = genreProfile.producerDefaults.allowInteriorPauseCuts;
    if (normalized.allowInteriorPauseCuts !== undefined) {
      allowInteriorPauseCuts = normalized.allowInteriorPauseCuts;
    }
    if (explicitOverrides?.allowInteriorPauseCuts !== undefined) {
      allowInteriorPauseCuts = explicitOverrides.allowInteriorPauseCuts;
    }

    // 4. Aspect Ratio precedence: Explicit Override > User Prefs > Creator Preset > 9:16
    const aspectRatio: ClipAspectRatio =
      explicitOverrides?.aspectRatio ||
      userPreferences?.aspectRatio ||
      creatorProfile?.preferred_aspect_ratio ||
      normalized.aspectRatio ||
      '9:16';

    return {
      genreProfile,
      contentGoal: normalized.contentGoal,
      aspectRatio,
      captionStyle,
      allowInteriorPauseCuts,
      scoringWeights: genreProfile.scoringWeights,
      targetDuration,
    };
  }

  /**
   * Generates prompt guidance string tailored to the selected ContentGoal
   */
  public static getContentGoalPromptModifier(goal: ContentGoal): string {
    switch (goal) {
      case 'shareable_moments':
        return 'GOAL (Shareable Moments): Prioritize high-velocity viral hooks, surprising counter-intuitive points, and relatable emotional peaks designed for instant social sharing.';
      case 'teach_one_idea':
        return 'GOAL (Teach One Idea): Focus strictly on isolating a single atomic concept. The clip must provide a clear beginning concept definition, practical elaboration, and decisive takeaway.';
      case 'quotes_soundbites':
        return 'GOAL (Quotes & Soundbites): Target compact, highly quotable philosophical or strategic soundbites (15–35 seconds) that deliver intense conviction or memorable wisdom.';
      case 'mini_story':
        return 'GOAL (Mini Story): Find a complete three-act micro-narrative: opening dilemma/hook -> rising journey/complication -> satisfying resolution or revelation.';
      case 'custom_instructions':
        return 'GOAL (Custom Instructions): Prioritize candidate selection strictly matching the custom topic and criteria specified by the creator.';
      default:
        return 'GOAL: Identify high-performing standalone moments that captivate audience attention.';
    }
  }
}
