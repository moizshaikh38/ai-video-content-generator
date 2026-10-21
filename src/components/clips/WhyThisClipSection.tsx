import React, { useState } from 'react';
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Zap,
  Lightbulb,
} from 'lucide-react';
import { ClipCandidate, VireoClipScoreExplanation } from '../../types';
import { GENRE_OPTIONS, GOAL_OPTIONS } from './ClipPreferencesControl';

export interface WhyThisClipSectionProps {
  candidate: ClipCandidate;
  defaultExpanded?: boolean;
  className?: string;
}

export const WhyThisClipSection: React.FC<WhyThisClipSectionProps> = ({
  candidate,
  defaultExpanded = false,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const explanation = candidate.metadata?.explanation as VireoClipScoreExplanation | undefined;
  const wasSnapped = Boolean(candidate.metadata?.was_snapped);

  // Genre badge resolution
  const genreId = candidate.genre || candidate.metadata?.genre;
  const matchedGenre = GENRE_OPTIONS.find((g) => g.id === genreId);
  const suggestedGenre = candidate.metadata?.suggested_genre;
  const genreConfidence = candidate.metadata?.genre_confidence;

  // Content goal badge resolution
  const goalId = candidate.content_goal || candidate.metadata?.content_goal;
  const matchedGoal = GOAL_OPTIONS.find((g) => g.id === goalId);

  return (
    <div className={`rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden ${className}`}>
      {/* ── Badges Header ── */}
      <div className="p-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.04]">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Genre Badge */}
          {matchedGenre && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#8B5CF6]/15 border border-[#8B5CF6]/30 text-[10px] font-medium text-[#DDD6FE]">
              <span>{matchedGenre.icon}</span>
              <span>{matchedGenre.label}</span>
            </span>
          )}

          {/* AI Auto-Detected Genre Indicator */}
          {suggestedGenre && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#22D3EE]/15 border border-[#22D3EE]/30 text-[10px] font-mono text-[#22D3EE]">
              <Sparkles className="size-2.5" />
              <span>
                AI: {suggestedGenre}
                {typeof genreConfidence === 'number' && ` (${Math.round(genreConfidence * 100)}%)`}
              </span>
            </span>
          )}

          {/* Content Goal Badge */}
          {matchedGoal && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.1] text-[10px] font-medium text-[#C9D2E6]">
              <span>{matchedGoal.icon}</span>
              <span>{matchedGoal.label}</span>
            </span>
          )}

          {/* Snapped Badge */}
          {wasSnapped && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[10px] font-mono text-amber-300">
              <Zap className="size-2.5 text-amber-400" />
              <span>Boundary Snapped</span>
            </span>
          )}

          {/* Cold Open Inversion Badge */}
          {candidate.cold_open && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
              <Sparkles className="size-2.5 text-emerald-400" />
              <span>Cold Open Hook (+{Math.round(candidate.cold_open.duration_seconds)}s)</span>
            </span>
          )}
        </div>

        {/* Toggle Button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[#22D3EE] hover:text-white transition-colors cursor-pointer"
        >
          <span>Why This Clip?</span>
          {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      </div>

      {/* ── Expandable Explanation Body ── */}
      {isExpanded && (
        <div className="p-3.5 space-y-3.5 bg-[#080B12]/80 text-xs">
          {/* Sub-Score Breakdown Pills */}
          {explanation && (
            <div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8E9AB4] block mb-1.5">
                Multi-Signal Score Breakdown (0–100)
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center font-mono text-[10px]">
                <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[#8E9AB4] block text-[9px]">Hook</span>
                  <span className="font-bold text-[#F4F6FB]">{explanation.hook_score}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[#8E9AB4] block text-[9px]">Standalone</span>
                  <span className="font-bold text-[#F4F6FB]">{explanation.standalone_score}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[#8E9AB4] block text-[9px]">Insight</span>
                  <span className="font-bold text-[#F4F6FB]">{explanation.insight_score}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[#8E9AB4] block text-[9px]">Visual</span>
                  <span className="font-bold text-[#F4F6FB]">{explanation.visual_activity_score}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[#8E9AB4] block text-[9px]">Audio</span>
                  <span className="font-bold text-[#22D3EE]">{explanation.audio_energy_score}</span>
                </div>
                <div className="p-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[#8E9AB4] block text-[9px]">Platform Fit</span>
                  <span className="font-bold text-[#DDD6FE]">{explanation.platform_fit_score}</span>
                </div>
              </div>
            </div>
          )}

          {/* Explainable Reasons */}
          {explanation?.reasons?.length ? (
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8E9AB4] flex items-center gap-1">
                <Lightbulb className="size-3 text-[#22D3EE]" />
                <span>Editorial Justification</span>
              </span>
              <ul className="space-y-1 pt-0.5">
                {explanation.reasons.map((r, i) => (
                  <li key={i} className="text-[#C9D2E6] text-[11px] leading-relaxed flex items-start gap-1.5">
                    <span className="text-[#22D3EE] font-bold shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : candidate.reason ? (
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8E9AB4] flex items-center gap-1">
                <Lightbulb className="size-3 text-[#22D3EE]" />
                <span>Editorial Justification</span>
              </span>
              <p className="text-[#C9D2E6] text-[11px] leading-relaxed pt-0.5">
                {candidate.reason}
              </p>
            </div>
          ) : null}

          {/* Cold Open Inversion Note */}
          {candidate.cold_open && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-200">
              <Sparkles className="size-3 text-emerald-400 shrink-0" />
              <span>
                <strong>Cold Open Inversion:</strong> A {candidate.cold_open.duration_seconds.toFixed(1)}s teaser punchline is spliced to the front (0:00) as a viral hook before narrative setup.
              </span>
            </div>
          )}

          {/* Boundary Snapping Note */}
          {wasSnapped && (
            <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200">
              <CheckCircle2 className="size-3 text-amber-400 shrink-0" />
              <span>Snapped to clean word & conversational pause boundaries (no mid-sentence cuts).</span>
            </div>
          )}

          {/* Platform Suitability Badges */}
          {explanation?.platform_suitability && (
            <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[#8E9AB4] block">
                Platform Suitability
              </span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(explanation.platform_suitability).map(([platform, detail]: any) => (
                  <span
                    key={platform}
                    title={detail.reason}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                      detail.suitable
                        ? 'bg-[#22D3EE]/15 border border-[#22D3EE]/30 text-[#22D3EE]'
                        : 'bg-white/5 border border-white/10 text-[#8E9AB4] line-through'
                    }`}
                  >
                    {platform} ({detail.score}/100)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
