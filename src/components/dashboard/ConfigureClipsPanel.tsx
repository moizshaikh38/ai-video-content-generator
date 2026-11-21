import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Clock,
  Crop,
  FileText,
  Languages,
  RotateCcw,
  Sliders,
  Sparkles,
  Tag,
  Target,
  Type,
  Volume2,
  Wand2,
} from 'lucide-react';
import { ClipPreferences, ContentGenre, ContentGoal, ClipAspectRatio } from '../../types';
import {
  GENRE_OPTIONS,
  GOAL_OPTIONS,
  DURATION_OPTIONS,
  ASPECT_RATIO_OPTIONS,
  getDefaultClipPreferences,
  saveClipPreferencesToStorage,
} from '../clips/ClipPreferencesControl';
import { GenerationCaptionPresetTiles } from '../clips/GenerationCaptionPreset';

export type ClipCountChoice = 'auto' | '3' | '5';

interface ConfigureClipsPanelProps {
  preferences: ClipPreferences;
  onChange: (prefs: ClipPreferences) => void;
  disabled?: boolean;
  captionsEnabled: boolean;
  onCaptionsEnabledChange: (enabled: boolean) => void;
  clipCount: ClipCountChoice;
  onClipCountChange: (value: ClipCountChoice) => void;
}

/**
 * Configure-screen settings in the user-approved reference layout:
 * genre cards first, compact duration chips, dropdown rows for aspect ratio
 * and spoken language, an AI Enhancements card, a captions card with visual
 * preset tiles, and a collapsible Advanced section. Every control wires to a
 * real ClipPreferences field and persists through the existing storage path.
 */
export const ConfigureClipsPanel: React.FC<ConfigureClipsPanelProps> = ({
  preferences,
  onChange,
  disabled = false,
  captionsEnabled,
  onCaptionsEnabledChange,
  clipCount,
  onClipCountChange,
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [keywordInput, setKeywordInput] = useState(
    Array.isArray(preferences.topicKeywords) ? preferences.topicKeywords.join(', ') : ''
  );
  const [userManuallySetGoal, setUserManuallySetGoal] = useState(Boolean(preferences.contentGoal));

  useEffect(() => {
    if (Array.isArray(preferences.topicKeywords)) {
      setKeywordInput(preferences.topicKeywords.join(', '));
    }
  }, [preferences.topicKeywords]);

  const apply = (updated: ClipPreferences) => {
    onChange(updated);
    saveClipPreferencesToStorage(updated);
  };

  const handleGenreSelect = (genreId: ContentGenre | 'auto') => {
    if (disabled) return;
    if (genreId === 'auto') {
      const updated: ClipPreferences = { ...preferences, genre: 'general', genreSelectionMode: 'auto' };
      if (!userManuallySetGoal) updated.contentGoal = 'shareable_moments';
      apply(updated);
      return;
    }
    const matchedGenre = GENRE_OPTIONS.find((g) => g.id === genreId);
    const updated: ClipPreferences = { ...preferences, genre: genreId as ContentGenre, genreSelectionMode: 'manual' };
    if (!userManuallySetGoal && matchedGenre) updated.contentGoal = matchedGenre.defaultGoal;
    apply(updated);
  };

  const selectedGenreId = preferences.genreSelectionMode === 'auto' ? 'auto' : preferences.genre;

  const handleGoalSelect = (goal: ContentGoal) => {
    if (disabled) return;
    setUserManuallySetGoal(true);
    apply({ ...preferences, contentGoal: goal });
  };

  const handleKeywordsChange = (value: string) => {
    setKeywordInput(value);
    const keywords = value.split(',').map((k) => k.trim()).filter(Boolean);
    apply({ ...preferences, topicKeywords: keywords });
  };

  const handleResetDefaults = () => {
    if (disabled) return;
    const defaults = getDefaultClipPreferences();
    setUserManuallySetGoal(false);
    setKeywordInput('');
    apply(defaults);
  };

  const autoReframeOn = preferences.framingDefaults?.autoReframe !== false;

  return (
    <div className="space-y-4">
      {/* Content Genre: dropdown at all widths (user correction 21 Nov 6:31 am: dropdown was the added control, tiles came back by mistake) */}
      <div className="space-y-2 hidden">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-vc-text-primary">
          <Clapperboard className="size-4 text-violet-300" aria-hidden="true" />
          <span>Content Genre</span>
        </div>
        <div className="cfg-genre-grid grid grid-cols-2 gap-2" role="radiogroup" aria-label="Content genre">
          {GENRE_OPTIONS.map((g) => {
            const selected = selectedGenreId === g.id;
            const Icon = g.icon;
            return (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => handleGenreSelect(g.id)}
                className={`relative flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  selected
                    ? 'border-violet-500/70 bg-violet-500/15 ring-1 ring-violet-400/40'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <Icon className={`size-4 shrink-0 ${selected ? 'text-violet-300' : 'text-vc-text-secondary'}`} aria-hidden="true" />
                <span className={`text-xs font-medium leading-tight ${selected ? 'text-white' : 'text-vc-text-secondary'}`}>{g.label}</span>
                {selected && <Check className="size-3.5 text-violet-300 absolute top-1.5 right-1.5" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-vc-text-primary shrink-0">
          <Clapperboard className="size-4 text-violet-300" aria-hidden="true" />
          <span>Content Genre</span>
        </div>
        <div className="relative min-w-0 max-w-[62%] sm:max-w-full">
          <select
            aria-label="Content genre"
            disabled={disabled}
            value={selectedGenreId}
            onChange={(e) => handleGenreSelect(e.target.value as ContentGenre | 'auto')}
            className="cfg-genre-select appearance-none rounded-full bg-zinc-900 border border-white/10 pl-3.5 pr-8 py-2 text-xs text-white w-full truncate"
          >
            {GENRE_OPTIONS.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
          <ChevronDown className="size-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
      </div>

      {/* Clip Duration — compact wrapping chips */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-vc-text-primary">
          <Clock className="size-4 text-violet-300" aria-hidden="true" />
          <span>Clip Duration</span>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5" role="radiogroup" aria-label="Clip duration">
          {DURATION_OPTIONS.map((d) => {
            const selected = preferences.preferredDurations === d.id;
            const label = d.id === 'auto' ? 'Auto' : d.label.replace(/\s*–\s*/g, '-').replace(/\s/g, '');
            return (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => !disabled && apply({ ...preferences, preferredDurations: d.id })}
                className={`px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  selected
                    ? 'bg-violet-500/20 border-violet-500 text-white'
                    : 'bg-vc-canvas border-white/10 text-vc-text-secondary hover:bg-white/[0.06]'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-vc-text-secondary leading-snug -mt-2">Clips are usually 15 seconds or longer; very short sources may produce shorter clips.</p>

      {/* Target Clip Count */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-vc-text-primary">
          <Target className="size-4 text-violet-300" aria-hidden="true" />
          <span>Target Clip Count</span>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5" role="radiogroup" aria-label="Target clip count">
          {([
            { id: 'auto', label: 'Auto' },
            { id: '3', label: 'Top 3' },
            { id: '5', label: 'Top 5' },
          ] as const).map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={clipCount === c.id}
              disabled={disabled}
              onClick={() => onClipCountChange(c.id)}
              className={`px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                clipCount === c.id
                  ? 'bg-violet-500/20 border-violet-500 text-white'
                  : 'bg-vc-canvas border-white/10 text-vc-text-secondary hover:bg-white/[0.06]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio — compact dropdown row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-vc-text-primary">
          <Crop className="size-4 text-violet-300" aria-hidden="true" />
          <span>Aspect Ratio</span>
        </div>
        <div className="relative shrink-0 max-w-full">
          <select
            aria-label="Aspect ratio"
            disabled={disabled}
            value={preferences.aspectRatio}
            onChange={(e) => apply({ ...preferences, aspectRatio: e.target.value as ClipAspectRatio })}
            className="appearance-none rounded-full bg-zinc-900 border border-white/10 pl-3.5 pr-8 py-2 text-xs text-white max-w-full truncate"
          >
            {ASPECT_RATIO_OPTIONS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <ChevronDown className="size-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
      </div>

      {/* Spoken Language — dropdown row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-vc-text-primary">
          <Languages className="size-4 text-violet-300" aria-hidden="true" />
          <span>Spoken Language</span>
        </div>
        <div className="relative shrink-0 max-w-[60%] sm:max-w-full">
          <select
            aria-label="Spoken source language"
            disabled={disabled}
            value={preferences.sourceLanguage || 'auto'}
            onChange={(e) => apply({ ...preferences, sourceLanguage: e.target.value })}
            className="appearance-none rounded-full bg-zinc-900 border border-white/10 pl-3.5 pr-8 py-2 text-xs text-white w-full truncate"
          >
          <option value="auto">Auto-detect / multilingual</option>
          <option value="en">English</option><option value="hi">Hindi</option><option value="es">Spanish</option>
          <option value="ur">Urdu</option><option value="ar">Arabic</option><option value="fr">French</option>
          <option value="de">German</option><option value="pt">Portuguese</option><option value="ja">Japanese</option><option value="ko">Korean</option>
          </select>
          <ChevronDown className="size-3.5 text-zinc-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
        </div>
      </div>

      {/* AI Enhancements */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-1">
        <div className="flex items-center gap-1.5 text-[13px] font-semibold text-vc-text-primary pb-1">
          <Sparkles className="size-4 text-violet-300" aria-hidden="true" />
          <span>AI Enhancements</span>
        </div>
        <div className="flex items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Wand2 className="size-4 shrink-0 text-violet-300" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-vc-text-primary">Smart AI Reframing</div>
              <div className="text-[11px] text-vc-text-secondary leading-snug">Adjusts framing automatically in Auto layout. Manual layouts keep your chosen framing.</div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoReframeOn}
            aria-label="Smart AI Reframing"
            disabled={disabled}
            onClick={() =>
              apply({
                ...preferences,
                framingDefaults: { version: 1, layout: 'auto', ...preferences.framingDefaults, autoReframe: !autoReframeOn },
              })
            }
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
              autoReframeOn ? 'bg-violet-500' : 'bg-white/20'
            }`}
          >
            <span className={`inline-block size-4 transform rounded-full bg-white transition-transform ${autoReframeOn ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-3 py-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Type className="size-4 shrink-0 text-violet-300" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-vc-text-primary">Auto Hook</div>
              <div className="text-[11px] text-vc-text-secondary leading-snug">AI hook title at the top of every clip to grab attention. Shown for the first 5 seconds only.</div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={preferences.autoHookTitle === true}
            aria-label="Auto Hook"
            disabled={disabled}
            onClick={() => apply({ ...preferences, autoHookTitle: preferences.autoHookTitle !== true })}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
              preferences.autoHookTitle === true ? 'bg-violet-500' : 'bg-white/20'
            }`}
          >
            <span className={`inline-block size-4 transform rounded-full bg-white transition-transform ${preferences.autoHookTitle === true ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
      </div>

      {/* Captions */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Volume2 className="size-4 shrink-0 text-violet-300" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-vc-text-primary">Captions</div>
              <div className="text-[11px] text-vc-text-secondary leading-snug">Add styled captions to your clips</div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={captionsEnabled}
            aria-label="Generate captions"
            disabled={disabled}
            onClick={() => onCaptionsEnabledChange(!captionsEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
              captionsEnabled ? 'bg-violet-500' : 'bg-white/20'
            }`}
          >
            <span className={`inline-block size-4 transform rounded-full bg-white transition-transform ${captionsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        {captionsEnabled && (
          <GenerationCaptionPresetTiles
            value={preferences.captionStyle}
            disabled={disabled}
            onChange={(style) => apply({ ...preferences, captionStyle: style })}
          />
        )}
      </div>

      {/* Advanced Settings */}
      <div className="border border-white/[0.08] rounded-2xl overflow-hidden bg-white/[0.01]">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          aria-expanded={showAdvanced}
          aria-controls="cfg-advanced-settings"
          className="w-full p-3.5 flex items-center justify-between text-xs font-medium text-violet-300 hover:text-white transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Sliders className="size-4 text-violet-300" />
            <span>Advanced Settings</span>
          </span>
          {showAdvanced ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {showAdvanced && (
          <div id="cfg-advanced-settings" className="p-4 pt-1 space-y-4 border-t border-white/[0.06]">
            {/* Content goal */}
            <div className="space-y-1.5">
              <label htmlFor="cfg-content-goal" className="text-[13px] font-semibold text-vc-text-primary flex items-center gap-1.5">
                <Target className="size-4 text-violet-300" aria-hidden="true" />
                <span>Content goal</span>
              </label>
              <select
                id="cfg-content-goal"
                disabled={disabled}
                value={preferences.contentGoal}
                onChange={(e) => handleGoalSelect(e.target.value as ContentGoal)}
                className="w-full rounded-full bg-zinc-900 border border-white/10 px-4 py-3 text-sm text-white"
              >
                {GOAL_OPTIONS.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-vc-text-secondary">{GOAL_OPTIONS.find((g) => g.id === preferences.contentGoal)?.desc}</p>
            </div>

            {/* Topic keywords */}
            <div className="space-y-1.5">
              <label htmlFor="cfg-topic-keywords" className="text-[13px] font-semibold text-vc-text-primary flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Tag className="size-4 text-violet-300" />
                  <span>Topic Keywords (comma-separated)</span>
                </span>
              </label>
              <input
                id="cfg-topic-keywords"
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
                    <span key={idx} className="px-2 py-0.5 rounded-full bg-white/[0.08] text-[10px] font-mono text-zinc-200">#{tag}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Custom focus instructions */}
            <div className="space-y-1.5">
              <label htmlFor="cfg-custom-instructions" className="text-[13px] font-semibold text-vc-text-primary flex items-center gap-1.5">
                <FileText className="size-3.5 text-violet-500" />
                <span>Custom AI Focus Instructions</span>
              </label>
              <textarea
                id="cfg-custom-instructions"
                rows={3}
                disabled={disabled}
                placeholder="Give the AI specific instructions (e.g. 'Focus on our customer case study in the middle')..."
                value={preferences.customInstructions || ''}
                onChange={(e) => apply({ ...preferences, customInstructions: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-vc-canvas border border-white/[0.12] text-xs text-vc-text-primary placeholder-zinc-500 focus:border-violet-500 outline-none resize-none disabled:opacity-50"
              />
            </div>

            {/* Layout policy (existing control, preserved) */}
            <details className="p-3 rounded-2xl bg-white/[0.02] text-xs text-vc-text-secondary" data-testid="layout-policy-settings">
              <summary className="cursor-pointer">Layout settings</summary>
              <label className="block mt-3">
                Starting layout
                <select
                  aria-label="Starting layout"
                  value={preferences.layoutPolicy?.defaultLayout || 'auto'}
                  disabled={disabled}
                  className="w-full rounded-full bg-zinc-900 border border-white/10 px-4 py-3 mt-1"
                  onChange={(e) =>
                    apply({
                      ...preferences,
                      layoutPolicy: { allowed: ['fit', 'fill', 'split'], ...preferences.layoutPolicy, defaultLayout: e.target.value as 'auto' | 'fit' | 'fill' },
                    })
                  }
                >
                  <option value="auto">Auto (recommended)</option>
                  <option value="fit">Fit</option>
                  <option value="fill">Fill</option>
                </select>
              </label>
              <div className="mt-3">Allowed automatic layouts</div>
              <div className="flex gap-3 mt-2">
                {(['fit', 'fill', 'split'] as const).map((id) => {
                  const allowed = preferences.layoutPolicy?.allowed || ['fit', 'fill', 'split'];
                  return (
                    <label key={id} className="flex gap-1 items-center">
                      <input
                        type="checkbox"
                        aria-label={`Allow automatic ${id}`}
                        disabled={disabled || (allowed.length === 1 && allowed.includes(id))}
                        checked={allowed.includes(id)}
                        onChange={(e) =>
                          apply({
                            ...preferences,
                            layoutPolicy: {
                              defaultLayout: 'auto',
                              ...preferences.layoutPolicy,
                              allowed: e.target.checked ? [...allowed, id] : allowed.filter((x) => x !== id),
                            },
                          })
                        }
                      />
                      {id[0].toUpperCase() + id.slice(1)}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px]">Three, Four and ScreenShare are manual only. Fit uses a 4:3 sharp band and can crop side content. If no allowed measured layout works, Fit + Review is used. Manual editor choices keep priority.</p>
            </details>

            {/* Reset */}
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
