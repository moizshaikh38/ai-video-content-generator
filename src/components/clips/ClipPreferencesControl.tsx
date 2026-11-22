import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Languages,
  Sliders,
  Clock,
  Crop,
  Target,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Tag,
  FileText,
  Mic,
  GraduationCap,
  Flame,
  Briefcase,
  Gamepad2,
  Trophy,
  Newspaper,
  Laugh,
  Clapperboard,
  Megaphone,
  Zap,
  TrendingUp,
  Lightbulb,
  Quote,
  BookOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
  icon: LucideIcon;
  badge: string;
  layoutBadge?: string;
  defaultGoal: ContentGoal;
  safeguardBadge: string;
  sweetSpot: string;
}> = [
  {
    id: 'auto',
    label: 'Auto-Detect',
    icon: Sparkles,
    badge: 'AI Classifier',
    layoutBadge: 'Adaptive',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'AI analyzes transcript signals and visual tempo to apply the best genre rubric',
    sweetSpot: 'Adaptive',
  },
  {
    id: 'podcast_interview',
    label: 'Podcast / Interview',
    icon: Mic,
    badge: 'Active Speaker',
    layoutBadge: 'Split Dual-Stack',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Preserves conversational Q&A context • Two-shot active speaker tracking',
    sweetSpot: '30–75s',
  },
  {
    id: 'education_tutorial',
    label: 'Education / Tutorial',
    icon: GraduationCap,
    badge: 'OCR & Slides',
    defaultGoal: 'teach_one_idea',
    safeguardBadge: 'Preserves setup and conclusion • Retains on-screen slides and steps',
    sweetSpot: '40–90s',
  },
  {
    id: 'motivation',
    label: 'Motivation',
    icon: Flame,
    badge: 'Dramatic Arc',
    defaultGoal: 'quotes_soundbites',
    safeguardBadge: 'Preserves dramatic oratorical pauses • Emotional transformation arc',
    sweetSpot: '20–60s',
  },
  {
    id: 'business_finance',
    label: 'Business / Finance',
    icon: Briefcase,
    badge: 'Metrics & ROI',
    defaultGoal: 'teach_one_idea',
    safeguardBadge: 'Preserves financial context & qualifiers • Highlights key metrics',
    sweetSpot: '30–70s',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    icon: Gamepad2,
    badge: 'Clutch Plays',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Prioritizes clutch plays & genuine reactions over pure noise',
    sweetSpot: '15–45s',
  },
  {
    id: 'watch_party', label: 'Watch Party', icon: Clapperboard,
    badge: 'Shared Context', defaultGoal: 'shareable_moments',
    safeguardBadge: 'Keeps the watched event and commentary in context. Auto layout starts safely. Optional facecam-top template uses the Gaming ratio; set both views in the editor. Automatic region detection is not verified.',
    sweetSpot: '20–60s',
  },
  {
    id: 'streaming', label: 'Streaming', icon: Mic,
    badge: 'Live Moments', defaultGoal: 'shareable_moments',
    safeguardBadge: 'Preserves live-stream setup and payoff across gaming, chat, IRL and events. Auto layout starts safely. Optional facecam-top template uses the Gaming ratio; set both views in the editor. Automatic region detection is not verified.',
    sweetSpot: '20–60s',
  },
  {
    id: 'sports',
    label: 'Sports',
    icon: Trophy,
    badge: 'Pause Cuts OFF',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Continuous game momentum • NEVER jump-cuts continuous play action',
    sweetSpot: '15–50s',
  },
  {
    id: 'news_politics',
    label: 'News / Politics',
    icon: Newspaper,
    badge: 'Context Protection',
    defaultGoal: 'quotes_soundbites',
    safeguardBadge: 'Strict safeguard against out-of-context quote truncations',
    sweetSpot: '30–75s',
  },
  {
    id: 'comedy_entertainment',
    label: 'Comedy & Entertainment',
    icon: Laugh,
    badge: 'Pause Cuts OFF',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Protects comedic timing pauses • Punchline delivery and laugh payoff',
    sweetSpot: '20–60s',
  },
  {
    id: 'storytelling',
    label: 'Storytelling',
    icon: Clapperboard,
    badge: '3-Act Arc',
    defaultGoal: 'mini_story',
    safeguardBadge: 'Hook -> rising journey -> payoff • Coherent narrative arc',
    sweetSpot: '45–90s',
  },
  {
    id: 'product_marketing',
    label: 'Product / Marketing',
    icon: Megaphone,
    badge: 'Demo & Proof',
    defaultGoal: 'shareable_moments',
    safeguardBadge: 'Problem -> demo -> benefit -> proof • Zero fabricated claims',
    sweetSpot: '20–60s',
  },
  {
    id: 'general',
    label: 'General / Variety',
    icon: Zap,
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
  icon: LucideIcon;
}> = [
  { id: 'shareable_moments', label: 'Shareable Moments', desc: 'Look for strong openings and useful takeaways', icon: TrendingUp },
  { id: 'teach_one_idea', label: 'Teach One Idea', desc: 'Look for one idea with a clear explanation', icon: Lightbulb },
  { id: 'quotes_soundbites', label: 'Quotes & Soundbites', desc: 'Look for concise quotes and memorable opinions', icon: Quote },
  { id: 'mini_story', label: 'Mini Story', desc: 'Look for a connected setup, development and payoff', icon: BookOpen },
  { id: 'custom_instructions', label: 'Custom Focus', desc: 'Use your focus instructions to guide suggestions', icon: Target },
];

export const DURATION_OPTIONS = [
  { id: 'auto', label: 'Auto (Sweet Spot)', sub: 'Genre optimal' },
  { id: '0-30', label: '0 – 30s', sub: 'Quick shorts' },
  { id: '30-60', label: '30 – 60s', sub: 'Standard Reels' },
  { id: '60-120', label: '1 – 2 min', sub: 'Deep dive' },
  { id: '120-180', label: '2 – 3 min', sub: 'Longer cut' },
] as const;

export const ASPECT_RATIO_OPTIONS = [
  { id: '9:16', label: '9:16 Vertical', sub: 'TikTok, Shorts, Reels', recommended: true },
  { id: '1:1', label: '1:1 Square', sub: 'LinkedIn & IG Feed', recommended: false },
  { id: '16:9', label: '16:9 Landscape', sub: 'YouTube & X', recommended: false },
] as const;

export function getDefaultClipPreferences(): ClipPreferences {
  return {
    framingDefaults:{version:1,layout:'auto',autoReframe:true},
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
  const [userManuallySetGoal, setUserManuallySetGoal] = useState(Boolean(preferences.contentGoal));

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

  const handleDurationSelect = (dur: ClipPreferences['preferredDurations']) => {
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
    <div className={`${compact ? 'compact-clip-settings grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-4 gap-y-5 items-start' : 'space-y-4'} ${className}`}>
      <div className="p-3 rounded-2xl bg-white/[0.02] space-y-2">
        <label htmlFor="source-speech-language" className="text-[13px] font-semibold text-vc-text-primary flex items-center gap-2"><Languages className="size-4 text-violet-300" aria-hidden="true"/>Spoken language</label>
        <select id="source-speech-language" aria-label="Spoken source language" disabled={disabled}
          value={preferences.sourceLanguage || 'auto'}
          onChange={(e) => { const updated={...preferences,sourceLanguage:e.target.value}; onChange(updated);saveClipPreferencesToStorage(updated); }}
          className="w-full rounded-full bg-zinc-900 text-white border border-white/10 px-4 py-2.5 text-sm">
          <option value="auto">Auto-detect / multilingual</option>
          <option value="en">English</option><option value="hi">Hindi</option><option value="es">Spanish</option>
          <option value="ur">Urdu</option><option value="ar">Arabic</option><option value="fr">French</option>
          <option value="de">German</option><option value="pt">Portuguese</option><option value="ja">Japanese</option><option value="ko">Korean</option>
        </select>
        {compact ? <details className="settings-help text-[11px] text-vc-text-secondary"><summary className="cursor-pointer">Language help</summary><p className="mt-2">Spoken source, not translation. Use auto-detect for mixed speech; review captions against the audio.</p></details> : <p className="text-xs text-vc-text-secondary lg:line-clamp-2">Spoken source, not translation. For mixed speech, use auto-detect. Review captions against the audio.</p>}
      </div>
      {/* ── 1. Content Genre Selection ── */}
      <div className="p-3 rounded-2xl bg-white/[0.02] space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-[13px] font-semibold text-vc-text-primary flex items-center gap-1.5">
            <Clapperboard className="size-4 text-violet-300" aria-hidden="true"/>
            <span>Content genre</span>
          </label>

        </div>

        <select aria-label="Content genre" disabled={disabled} value={preferences.genreSelectionMode==='auto'?'auto':preferences.genre}
          onChange={e=>handleGenreSelect(e.target.value as ContentGenre|'auto')}
          className="w-full rounded-full bg-zinc-900 border border-white/10 px-4 py-3 text-sm text-white">
          {GENRE_OPTIONS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        {compact ? <details className="settings-help text-[11px] text-vc-text-secondary"><summary className="cursor-pointer">About this genre</summary>        <p className={`text-[11px] leading-relaxed text-vc-text-secondary ${['watch_party','streaming'].includes(activeGenreOption.id) ? '' : 'lg:line-clamp-2'}`}>{activeGenreOption.id==='auto'?'Suggests a content genre from the recording. Review the result before sharing.':(['watch_party','streaming'].includes(activeGenreOption.id) ? activeGenreOption.safeguardBadge : `Guides ${activeGenreOption.label.toLowerCase()} clip suggestions. Review context and framing before sharing.`)}</p></details> : <p className={`text-[11px] leading-relaxed text-vc-text-secondary ${['watch_party','streaming'].includes(activeGenreOption.id) ? '' : 'lg:line-clamp-2'}`}>{activeGenreOption.id==='auto'?'Suggests a content genre from the recording. Review the result before sharing.':(['watch_party','streaming'].includes(activeGenreOption.id) ? activeGenreOption.safeguardBadge : `Guides ${activeGenreOption.label.toLowerCase()} clip suggestions. Review context and framing before sharing.`)}</p>}
      </div>
      <div className="p-3 rounded-2xl bg-white/[0.02] space-y-2">
        <label htmlFor="content-goal" className="text-[13px] font-semibold text-vc-text-primary flex items-center gap-2"><Target className="size-4 text-violet-300" aria-hidden="true"/>Content goal</label>
        <select id="content-goal" disabled={disabled} value={preferences.contentGoal} onChange={e=>handleGoalSelect(e.target.value as ContentGoal)}
          className="w-full rounded-full bg-zinc-900 border border-white/10 px-4 py-3 text-sm text-white">
          {GOAL_OPTIONS.map(g=><option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        {compact ? <details className="settings-help text-[11px] text-vc-text-secondary"><summary className="cursor-pointer">About this goal</summary>        <p className="text-[11px] text-vc-text-secondary lg:line-clamp-2">{GOAL_OPTIONS.find(g=>g.id===preferences.contentGoal)?.desc}</p></details> : <p className="text-[11px] text-vc-text-secondary lg:line-clamp-2">{GOAL_OPTIONS.find(g=>g.id===preferences.contentGoal)?.desc}</p>}
      </div>

      {/* ── 3. Duration & Aspect Ratio ── */}
      <div className={compact ? "contents" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
        {/* Preferred Clip Length */}
        <div className="p-3 rounded-2xl bg-white/[0.02] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-semibold text-vc-text-primary flex items-center gap-1.5">
              <Clock className="size-4 text-violet-300" />
              <span>Preferred Clip Length</span>
            </label>

          </div>

          {compact ? <select aria-label="Preferred clip length" value={preferences.preferredDurations} disabled={disabled} onChange={e=>handleDurationSelect(e.target.value as ClipPreferences['preferredDurations'])} className="w-full rounded-full bg-zinc-900 text-white border border-white/10 px-4 py-3 text-sm">
            {DURATION_OPTIONS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select> :           <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DURATION_OPTIONS.map((item) => {
              const isSelected = preferences.preferredDurations === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDurationSelect(item.id)}
                  className={`p-2.5 rounded-xl text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-violet-500/15 text-white ring-1 ring-violet-400/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_20px_-10px_rgba(124,58,237,0.7)]'
                      : 'bg-white/[0.04] text-vc-text-secondary hover:bg-white/[0.07] hover:text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="font-semibold text-xs text-vc-text-primary">{compact ? item.id==='auto'?'Auto':item.id : item.label}</div>
                  {!compact && <div className="text-[10px] text-vc-text-secondary mt-0.5">{item.sub}</div>}
                </button>
              );
            })}
          </div>}
        </div>

        {/* Output Aspect Ratio */}
        <div className="p-3 rounded-2xl bg-white/[0.02] space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-semibold text-vc-text-primary flex items-center gap-1.5">
              <Crop className="size-4 text-violet-300" />
              <span>Output Aspect Ratio</span>
            </label>

          </div>

          {compact ? <select aria-label="Output aspect ratio" value={preferences.aspectRatio} disabled={disabled} onChange={e=>handleAspectRatioSelect(e.target.value as ClipAspectRatio)} className="w-full rounded-full bg-zinc-900 text-white border border-white/10 px-4 py-3 text-sm">
            {ASPECT_RATIO_OPTIONS.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
          </select> :           <div className="grid grid-cols-3 gap-2">
            {ASPECT_RATIO_OPTIONS.map((item) => {
              const isSelected = preferences.aspectRatio === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleAspectRatioSelect(item.id as ClipAspectRatio)}
                  className={`relative p-2.5 rounded-xl text-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-violet-500/15 text-white ring-1 ring-violet-400/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_20px_-10px_rgba(124,58,237,0.7)]'
                      : 'bg-white/[0.04] text-vc-text-secondary hover:bg-white/[0.07] hover:text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {item.recommended && (
                    <span className="absolute -top-2 right-2 px-1.5 py-px rounded-full bg-white text-vc-action-foreground text-[9px] font-extrabold uppercase">
                      Best
                    </span>
                  )}
                  <div className="font-semibold text-xs text-vc-text-primary">{compact ? item.id : item.label}</div>
                  {!compact && <div className="text-[10px] text-vc-text-secondary leading-tight mt-0.5">{item.sub}</div>}
                </button>
              );
            })}
          </div>}
        </div>
      </div>

      {/* ── 4. Collapsible Advanced / Focus Instructions ── */}
      <div className={`border border-white/[0.08] rounded-2xl overflow-hidden bg-white/[0.01] ${compact?"sm:col-span-2 lg:col-span-5":""}`}>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          aria-controls="clip-advanced-settings"
          className="w-full p-3.5 flex items-center justify-between text-xs font-medium text-violet-300 hover:text-white transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Sliders className="size-4 text-violet-300" />
            <span>Advanced / Focus instructions</span>
          </span>
          {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showAdvanced && (
          <div id="clip-advanced-settings" className="p-4 pt-1 space-y-4 border-t border-white/[0.06]">
      <details className="p-3 rounded-2xl bg-white/[0.02] text-xs text-vc-text-secondary" data-testid="layout-policy-settings"><summary className="cursor-pointer">Layout settings</summary>
        <label className="block mt-3">Starting layout<select aria-label="Starting layout" value={preferences.layoutPolicy?.defaultLayout||'auto'} disabled={disabled} className="w-full rounded-full bg-zinc-900 border border-white/10 px-4 py-3 mt-1" onChange={e=>onChange({...preferences,layoutPolicy:{allowed:['fit','fill','split'],...preferences.layoutPolicy,defaultLayout:e.target.value as 'auto'|'fit'|'fill'}})}><option value="auto">Auto (recommended)</option><option value="fit">Fit</option><option value="fill">Fill</option></select></label>
        <div className="mt-3">Allowed automatic layouts</div><div className="flex gap-3 mt-2">{(['fit','fill','split'] as const).map(id=>{const allowed=preferences.layoutPolicy?.allowed||['fit','fill','split'];return <label key={id} className="flex gap-1 items-center"><input type="checkbox" aria-label={`Allow automatic ${id}`} disabled={disabled||(allowed.length===1&&allowed.includes(id))} checked={allowed.includes(id)} onChange={e=>onChange({...preferences,layoutPolicy:{defaultLayout:'auto',...preferences.layoutPolicy,allowed:e.target.checked?[...allowed,id]:allowed.filter(x=>x!==id)}})}/>{id[0].toUpperCase()+id.slice(1)}</label>})}</div>
        <p className="mt-2 text-[10px]">Three, Four and ScreenShare are manual only. Fit uses a 4:3 sharp band and can crop side content. If no allowed measured layout works, Fit + Review is used. Manual editor choices keep priority.</p>
      </details>
      <div data-testid="new-project-framing-default" className="px-3 text-[11px] text-vc-text-secondary">Layout: {preferences.layoutPolicy?.defaultLayout||'auto'} · Auto Reframe: {preferences.framingDefaults?.autoReframe===false?'OFF':'ON'}<br/>Manual layouts and saved editor choices keep priority.</div>
            {/* Topic Keywords Input */}
            <div className="space-y-1.5">
              <label htmlFor="clip-topic-keywords" className="text-[13px] font-semibold text-vc-text-primary flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Tag className="size-4 text-violet-300" />
                  <span>Topic Keywords (Comma-separated)</span>
                </span>
                <span className="text-[10px] text-vc-text-secondary">e.g. AI agents, pricing, revenue model</span>
              </label>
              <input
                id="clip-topic-keywords"
                type="text"
                disabled={disabled}
                placeholder="e.g. artificial intelligence, marketing, customer acquisition"
                value={keywordInput}
                onChange={(e) => handleKeywordsChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-vc-canvas border border-white/[0.12] text-xs text-vc-text-primary placeholder-zinc-500 focus:border-white/60 outline-none disabled:opacity-50"
              />
              {Array.isArray(preferences.topicKeywords) && preferences.topicKeywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {preferences.topicKeywords.map((tag, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[10px] font-mono text-zinc-200"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Custom Instructions Textarea */}
            <div className="space-y-1.5">
              <label htmlFor="clip-custom-instructions" className="text-[13px] font-semibold text-vc-text-primary flex items-center gap-1.5">
                <FileText className="size-3.5 text-violet-500" />
                <span>Custom AI Focus Instructions</span>
              </label>
              <textarea
                id="clip-custom-instructions"
                rows={3}
                disabled={disabled}
                placeholder="Give the AI specific instructions (e.g. 'Focus on our customer case study in the middle', 'Find the moment where we discuss churn rates')..."
                value={preferences.customInstructions || ''}
                onChange={(e) => handleCustomInstructionsChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-vc-canvas border border-white/[0.12] text-xs text-vc-text-primary placeholder-zinc-500 focus:border-violet-500 outline-none resize-none disabled:opacity-50"
              />
            </div>

            {/* Reset to Defaults button */}
            <div className="flex justify-end pt-2 border-t border-white/[0.04]">
              <button
                type="button"
                disabled={disabled}
                onClick={handleResetDefaults}
                className="inline-flex items-center gap-1.5 text-xs text-vc-text-secondary hover:text-violet-200 transition-colors cursor-pointer"
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
