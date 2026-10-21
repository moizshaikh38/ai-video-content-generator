import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Sliders,
  Clock,
  Crop,
  Target,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ShieldCheck,
  Tag,
  FileText,
} from 'lucide-react';
import {
  ContentGenre,
  ContentGoal,
  ClipPreferences,
  ClipAspectRatio,
} from '../../types';

export const CLIP_PREFERENCES_STORAGE_KEY = 'vireo_last_clip_preferences_v1';

export const GENRE_OPTIONS: Array<{
  id: ContentGenre | 'auto';
  label: string;
  icon: string;
  badge: string;
  layoutBadge?: string;
  defaultGoal: ContentGoal;
  safeguardBadge: string;
  sweetSpot: string;
}> = [
  {
    id: 'auto',
    label: 'Auto-Detect',
    icon: '✨',
    badge: 'AI Classifier',
    layoutBadge: 'Adaptive',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'AI analyzes transcript signals and visual tempo to apply the best genre rubric',
    sweetSpot: 'Adaptive',
  },
  {
    id: 'podcast_interview',
    label: 'Podcast / Interview',
    icon: '🎙️',
    badge: 'Active Speaker',
    layoutBadge: 'Split Dual-Stack',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Preserves conversational Q&A context • Two-shot active speaker tracking',
    sweetSpot: '30–75s',
  },
  {
    id: 'education_tutorial',
    label: 'Education / Tutorial',
    icon: '📚',
    badge: 'OCR & Slides',
    defaultGoal: 'teach_one_idea',
    safeguardBadge: 'Preserves setup and conclusion • Retains on-screen slides and steps',
    sweetSpot: '40–90s',
  },
  {
    id: 'motivation',
    label: 'Motivation',
    icon: '🔥',
    badge: 'Dramatic Arc',
    defaultGoal: 'quotes_soundbites',
    safeguardBadge: 'Preserves dramatic oratorical pauses • Emotional transformation arc',
    sweetSpot: '20–60s',
  },
  {
    id: 'business_finance',
    label: 'Business / Finance',
    icon: '💼',
    badge: 'Metrics & ROI',
    defaultGoal: 'teach_one_idea',
    safeguardBadge: 'Preserves financial context & qualifiers • Highlights key metrics',
    sweetSpot: '30–70s',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    icon: '🎮',
    badge: 'Clutch Plays',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Prioritizes clutch plays & genuine reactions over pure noise',
    sweetSpot: '15–45s',
  },
  {
    id: 'sports',
    label: 'Sports',
    icon: '🏆',
    badge: 'Pause Cuts OFF',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Continuous game momentum • NEVER jump-cuts continuous play action',
    sweetSpot: '15–50s',
  },
  {
    id: 'news_politics',
    label: 'News / Politics',
    icon: '📰',
    badge: 'Context Protection',
    defaultGoal: 'quotes_soundbites',
    safeguardBadge: 'Strict safeguard against out-of-context quote truncations',
    sweetSpot: '30–75s',
  },
  {
    id: 'comedy_entertainment',
    label: 'Comedy / Standup',
    icon: '😂',
    badge: 'Pause Cuts OFF',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Protects comedic timing pauses • Punchline delivery and laugh payoff',
    sweetSpot: '20–60s',
  },
  {
    id: 'storytelling',
    label: 'Storytelling',
    icon: '🎬',
    badge: '3-Act Arc',
    defaultGoal: 'mini_story',
    safeguardBadge: 'Hook -> rising journey -> payoff • Coherent narrative arc',
    sweetSpot: '45–90s',
  },
  {
    id: 'product_marketing',
    label: 'Product / Marketing',
    icon: '📣',
    badge: 'Demo & Proof',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Problem -> demo -> benefit -> proof • Zero fabricated claims',
    sweetSpot: '20–60s',
  },
  {
    id: 'general',
    label: 'General / Variety',
    icon: '⚡',
    badge: 'Balanced Baseline',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Balanced virality, hook strength, and standalone clarity',
    sweetSpot: '30–60s',
  },
];

export const GOAL_OPTIONS: Array<{
  id: ContentGoal;
  label: string;
  desc: string;
  icon: string;
}> = [
  { id: 'shareable_moments', label: 'Shareable Moments', desc: 'Viral hooks & punchy takeaways designed for sharing', icon: '🔥' },
  { id: 'teach_one_idea', label: 'Teach One Idea', desc: 'Isolates one atomic concept with clear explanation', icon: '💡' },
  { id: 'quotes_soundbites', label: 'Quotes & Soundbites', desc: 'Memorable conviction, concise punchy wisdom (15–35s)', icon: '💬' },
  { id: 'mini_story', label: 'Mini Story', desc: 'Full 3-act narrative arc (hook → escalation → reveal)', icon: '📖' },
  { id: 'custom_instructions', label: 'Custom Focus', desc: 'Prioritizes clips strictly adhering to your custom prompt', icon: '🎯' },
];

export const DURATION_OPTIONS = [
  { id: 'auto', label: 'Auto (Sweet Spot)', sub: 'Genre optimal' },
  { id: '15-30', label: '15 – 30s', sub: 'Shorts & TikTok' },
  { id: '30-60', label: '30 – 60s', sub: 'Standard Reels' },
  { id: '60-90', label: '60 – 90s', sub: 'Deep dive' },
] as const;

export const ASPECT_RATIO_OPTIONS = [
  { id: '9:16', label: '9:16 Vertical', sub: 'TikTok, Shorts, Reels', recommended: true },
  { id: '1:1', label: '1:1 Square', sub: 'LinkedIn & IG Feed', recommended: false },
  { id: '16:9', label: '16:9 Landscape', sub: 'YouTube & X', recommended: false },
] as const;

export function getDefaultClipPreferences(): ClipPreferences {
  return {
    genre: 'general',
    genreSelectionMode: 'auto',
    contentGoal: 'shareable_moments',
    preferredDurations: 'auto',
    aspectRatio: '9:16',
    topicKeywords: [],
    customInstructions: '',
    allowInteriorPauseCuts: true,
    profileVersion: 1,
  };
}

export function loadSavedClipPreferences(): ClipPreferences {
  try {
    const raw = localStorage.getItem(CLIP_PREFERENCES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...getDefaultClipPreferences(),
          ...parsed,
          profileVersion: 1,
        };
      }
    }
  } catch {
    // ignore parse error
  }
  return getDefaultClipPreferences();
}

export function saveClipPreferencesToStorage(prefs: ClipPreferences): void {
  try {
    localStorage.setItem(CLIP_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export interface ClipPreferencesControlProps {
  preferences: ClipPreferences;
  onChange: (prefs: ClipPreferences) => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

export const ClipPreferencesControl: React.FC<ClipPreferencesControlProps> = ({
  preferences,
  onChange,
  disabled = false,
  className = '',
  compact = false,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [keywordInput, setKeywordInput] = useState(
    Array.isArray(preferences.topicKeywords) ? preferences.topicKeywords.join(', ') : ''
  );
  const [userManuallySetGoal, setUserManuallySetGoal] = useState(false);

  // Sync keyword input if topicKeywords changes externally
  useEffect(() => {
    if (Array.isArray(preferences.topicKeywords)) {
      setKeywordInput(preferences.topicKeywords.join(', '));
    }
  }, [preferences.topicKeywords]);

  const activeGenreOption =
    preferences.genreSelectionMode === 'auto'
      ? GENRE_OPTIONS[0]
      : GENRE_OPTIONS.find((g) => g.id === preferences.genre) || GENRE_OPTIONS[0];

  const handleGenreSelect = (genreId: ContentGenre | 'auto') => {
    if (disabled) return;
    if (genreId === 'auto') {
      const updated: ClipPreferences = {
        ...preferences,
        genre: 'general',
        genreSelectionMode: 'auto',
      };
      if (!userManuallySetGoal) {
        updated.contentGoal = 'shareable_moments';
      }
      onChange(updated);
      saveClipPreferencesToStorage(updated);
      return;
    }

    const matchedGenre = GENRE_OPTIONS.find((g) => g.id === genreId);
    const updated: ClipPreferences = {
      ...preferences,
      genre: genreId as ContentGenre,
      genreSelectionMode: 'manual',
    };
    if (!userManuallySetGoal && matchedGenre) {
      updated.contentGoal = matchedGenre.defaultGoal;
    }
    onChange(updated);
    saveClipPreferencesToStorage(updated);
  };

  const handleGoalSelect = (goal: ContentGoal) => {
    if (disabled) return;
    setUserManuallySetGoal(true);
    const updated: ClipPreferences = { ...preferences, contentGoal: goal };
    onChange(updated);
    saveClipPreferencesToStorage(updated);
  };

  const handleDurationSelect = (dur: 'auto' | '15-30' | '30-60' | '60-90') => {
    if (disabled) return;
    const updated: ClipPreferences = { ...preferences, preferredDurations: dur };
    onChange(updated);
    saveClipPreferencesToStorage(updated);
  };

  const handleAspectRatioSelect = (ratio: ClipAspectRatio) => {
    if (disabled) return;
    const updated: ClipPreferences = { ...preferences, aspectRatio: ratio };
    onChange(updated);
    saveClipPreferencesToStorage(updated);
  };

  const handleKeywordsChange = (value: string) => {
    setKeywordInput(value);
    const keywords = value
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const updated: ClipPreferences = { ...preferences, topicKeywords: keywords };
    onChange(updated);
    saveClipPreferencesToStorage(updated);
  };

  const handleCustomInstructionsChange = (value: string) => {
    const updated: ClipPreferences = { ...preferences, customInstructions: value };
    onChange(updated);
    saveClipPreferencesToStorage(updated);
  };

  const handleResetDefaults = () => {
    if (disabled) return;
    const defaults = getDefaultClipPreferences();
    setUserManuallySetGoal(false);
    setKeywordInput('');
    onChange(defaults);
    saveClipPreferencesToStorage(defaults);
  };

  return (
    <div className={`${compact ? 'space-y-2.5' : 'space-y-4'} ${className}`}>
      {/* ── 1. Content Genre Selection ── */}
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-[#DDD6FE] flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-[#22D3EE]" />
            <span>Content Genre & Narrative Rubric</span>
          </label>
          <span className="text-[10px] text-[#8E9AB4] font-mono">
            {activeGenreOption.id === 'auto' ? '✨ Auto-Detect' : activeGenreOption.label}
          </span>
        </div>

        {/* Genre Pills Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {GENRE_OPTIONS.map((g) => {
            const isSelected =
              g.id === 'auto'
                ? preferences.genreSelectionMode === 'auto'
                : preferences.genreSelectionMode === 'manual' && preferences.genre === g.id;

            return (
              <button
                key={g.id}
                type="button"
                disabled={disabled}
                onClick={() => handleGenreSelect(g.id)}
                className={`relative p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#8B5CF6]/20 border-[#22D3EE] text-white shadow-[0_0_15px_rgba(34,211,238,0.15)] ring-1 ring-[#22D3EE]/30'
                    : 'bg-[#080B12]/60 border-white/[0.06] text-[#8E9AB4] hover:border-white/20 hover:text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-base">{g.icon}</span>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-1 py-0.2 rounded bg-white/5 text-[#22D3EE]">
                      {g.badge}
                    </span>
                  </div>
                  <div className="font-semibold text-xs text-[#F4F6FB] mt-1.5 leading-snug">
                    {g.label}
                  </div>
                  {g.layoutBadge && (
                    <div className="text-[9px] text-violet-300/80 font-mono mt-0.5">
                      📐 {g.layoutBadge}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-[#8E9AB4] font-mono mt-1">
                  {g.sweetSpot}
                </div>
              </button>
            );
          })}
        </div>

        {/* Active Genre Safeguard Badge */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#22D3EE]/10 border border-[#22D3EE]/20 text-[11px] text-[#C9D2E6]">
          <ShieldCheck className="size-3.5 text-[#22D3EE] shrink-0" />
          <span className="font-medium">
            <strong className="text-[#22D3EE] font-semibold">Active Safeguard: </strong>
            {activeGenreOption.safeguardBadge}
          </span>
        </div>
      </div>

      {/* ── 2. Content Goal Selector ── */}
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[#DDD6FE] flex items-center gap-1.5">
            <Target className="size-3.5 text-[#8B5CF6]" />
            <span>Content Goal</span>
          </label>
          <span className="text-[10px] text-[#8E9AB4]">Clip selection objective</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {GOAL_OPTIONS.map((goal) => {
            const isSelected = preferences.contentGoal === goal.id;
            return (
              <button
                key={goal.id}
                type="button"
                disabled={disabled}
                onClick={() => handleGoalSelect(goal.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-[#8B5CF6]/20 border-[#8B5CF6] text-white ring-1 ring-[#8B5CF6]/30'
                    : 'bg-[#080B12]/60 border-white/[0.06] text-[#8E9AB4] hover:border-white/20 hover:text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#F4F6FB]">
                    <span>{goal.icon}</span>
                    <span>{goal.label}</span>
                  </div>
                  <p className="text-[10px] text-[#8E9AB4] mt-1 leading-tight line-clamp-2">
                    {goal.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 3. Duration & Aspect Ratio ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Preferred Clip Length */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#DDD6FE] flex items-center gap-1.5">
              <Clock className="size-3.5 text-[#22D3EE]" />
              <span>Preferred Clip Length</span>
            </label>
            <span className="text-[10px] text-[#8E9AB4]">Hook to resolution</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DURATION_OPTIONS.map((item) => {
              const isSelected = preferences.preferredDurations === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDurationSelect(item.id)}
                  className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#22D3EE]/20 border-[#22D3EE] text-white ring-1 ring-[#22D3EE]/30'
                      : 'bg-[#080B12]/60 border-white/[0.06] text-[#8E9AB4] hover:border-white/20 hover:text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="font-semibold text-xs text-[#F4F6FB]">{item.label}</div>
                  <div className="text-[10px] text-[#8E9AB4] mt-0.5">{item.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Output Aspect Ratio */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-[#DDD6FE] flex items-center gap-1.5">
              <Crop className="size-3.5 text-[#C4B5FD]" />
              <span>Output Aspect Ratio</span>
            </label>
            <span className="text-[10px] text-[#8E9AB4]">Smart Reframe target</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {ASPECT_RATIO_OPTIONS.map((item) => {
              const isSelected = preferences.aspectRatio === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleAspectRatioSelect(item.id as ClipAspectRatio)}
                  className={`relative p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#8B5CF6]/25 border-[#8B5CF6] text-white ring-1 ring-[#8B5CF6]/30'
                      : 'bg-[#080B12]/60 border-white/[0.06] text-[#8E9AB4] hover:border-white/20 hover:text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {item.recommended && (
                    <span className="absolute -top-2 right-2 px-1.5 py-0.2 rounded-full bg-[#22D3EE] text-[#080B12] text-[8px] font-extrabold uppercase">
                      Best
                    </span>
                  )}
                  <div className="font-semibold text-xs text-[#F4F6FB]">{item.label}</div>
                  <div className="text-[10px] text-[#8E9AB4] leading-tight mt-0.5">{item.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── 4. Collapsible Advanced / Focus Instructions ── */}
      <div className="border border-white/[0.08] rounded-2xl overflow-hidden bg-white/[0.01]">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full p-3.5 flex items-center justify-between text-xs font-medium text-[#C4B5FD] hover:text-white transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Sliders className="size-3.5 text-[#22D3EE]" />
            <span>Advanced / Focus Instructions (Topic Keywords & Prompt)</span>
          </span>
          {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showAdvanced && (
          <div className="p-4 pt-1 space-y-4 border-t border-white/[0.06]">
            {/* Topic Keywords Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#DDD6FE] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Tag className="size-3.5 text-[#22D3EE]" />
                  <span>Topic Keywords (Comma-separated)</span>
                </span>
                <span className="text-[10px] text-[#8E9AB4]">e.g. AI agents, pricing, revenue model</span>
              </label>
              <input
                type="text"
                disabled={disabled}
                placeholder="e.g. artificial intelligence, marketing, customer acquisition"
                value={keywordInput}
                onChange={(e) => handleKeywordsChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#080B12] border border-white/[0.12] text-xs text-[#F4F6FB] placeholder-[#8E9AB4]/50 focus:border-[#22D3EE] outline-none disabled:opacity-50"
              />
              {Array.isArray(preferences.topicKeywords) && preferences.topicKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {preferences.topicKeywords.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-full bg-[#22D3EE]/15 border border-[#22D3EE]/30 text-[10px] font-mono text-[#22D3EE]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Instructions Textarea */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#DDD6FE] flex items-center gap-1.5">
                <FileText className="size-3.5 text-[#8B5CF6]" />
                <span>Custom AI Focus Instructions</span>
              </label>
              <textarea
                rows={3}
                disabled={disabled}
                placeholder="Give the AI specific instructions (e.g. 'Focus on our customer case study in the middle', 'Find the moment where we discuss churn rates')..."
                value={preferences.customInstructions || ''}
                onChange={(e) => handleCustomInstructionsChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#080B12] border border-white/[0.12] text-xs text-[#F4F6FB] placeholder-[#8E9AB4]/50 focus:border-[#8B5CF6] outline-none resize-none disabled:opacity-50"
              />
            </div>

            {/* Reset to Defaults button */}
            <div className="flex justify-end pt-2 border-t border-white/[0.04]">
              <button
                type="button"
                disabled={disabled}
                onClick={handleResetDefaults}
                className="inline-flex items-center gap-1.5 text-xs text-[#8E9AB4] hover:text-[#DDD6FE] transition-colors cursor-pointer"
              >
                <RotateCcw className="size-3" />
                <span>Reset to Defaults</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
