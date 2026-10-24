import React, { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Sparkles,
  Palette,
  Type,
  ExternalLink,
  ShieldCheck,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { EditorProject, BrandBrainProfile } from '../../types';
import { brandBrainService } from '../../services/brandBrainService';
import { PanelError, PanelEmpty } from './panelKit';

interface BrandKitPanelProps {
  project: EditorProject;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject) => void;
}

export const BrandKitPanel: React.FC<BrandKitPanelProps> = ({
  project: _project,
  onUpdateProject,
}) => {
  const [profile, setProfile] = useState<BrandBrainProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [applied, setApplied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadBrandProfile = useCallback(async () => {
      try {
        setLoading(true);
        setError(null);
        // A null response is a real state too: the user simply has no brand kit yet.
        setProfile(await brandBrainService.getProfile());
      } catch (err) {
        // Never substitute placeholder brand data here. A dead endpoint that renders like a real
        // brand kit is worse than an honest failure the user can retry.
        setError(err instanceof Error ? err.message : 'The request failed.');
        setProfile(null);
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    loadBrandProfile();
  }, [loadBrandProfile]);

  const handleApplyBrandKit = () => {
    if (!profile) return;

    const brandHighlightColor =
      profile.visual.accent_colors?.[0] ||
      profile.visual.secondary_colors?.[0] ||
      '#8B5CF6';
    const brandPrimaryTextColor = profile.visual.primary_colors?.[0] || '#FFFFFF';
    const brandFont = profile.visual.fonts?.[0] || 'Inter';

    onUpdateProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => {
        if (t.type === 'CAPTION') {
          return {
            ...t,
            items: t.items.map((i) => ({
              ...i,
              caption: {
                cues: i.caption?.cues || [],
                position: i.caption?.position || 'bottom',
                highlight_color: brandHighlightColor,
                primary_color: brandPrimaryTextColor,
                animation: i.caption?.animation || 'highlight',
                style: (profile.captions?.default_style as any) || 'bold',
              },
            })),
          };
        }
        if (t.type === 'TEXT') {
          return {
            ...t,
            items: t.items.map((i) => ({
              ...i,
              text: i.text
                ? {
                    ...i.text,
                    font_family: (brandFont as any) || i.text.font_family,
                    color: brandPrimaryTextColor,
                  }
                : undefined,
            })),
          };
        }
        return t;
      }),
    }));

    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  return (
    <div className="flex flex-col h-full bg-vc-surface1 text-vc-text-secondary select-none p-4 space-y-4 overflow-x-hidden animate-panelSlideIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-vc-text-secondary" />
          <div>
            <h3 className="font-semibold text-white text-sm">Brand Brain Kit</h3>
            <p className="text-[11px] text-vc-text-muted">
              Apply unified brand identity, fonts & color tokens
            </p>
          </div>
        </div>
        <a
          href="/brand"
          target="_blank"
          rel="noreferrer"
          className="text-vc-text-muted hover:text-white transition p-1"
          title="Open Brand Brain Settings"
        >
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-vc-text-secondary" />
        </div>
      ) : profile ? (
        <div className="space-y-4 flex-1 overflow-y-auto">
          {/* Brand Identity Card */}
          <div className="p-3 rounded-xl bg-vc-surface2/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white text-xs">
                {profile.identity.brand_name || 'Active Brand'}
              </span>
              <span className="px-2 py-0.5 rounded-lg text-[10px] bg-white/[0.08] text-vc-text-primary ">
                v{profile.version}
              </span>
            </div>
            <div className="text-[11px] text-vc-text-muted flex flex-wrap gap-1">
              {profile.voice.tones?.map((tone, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-lg bg-white/[0.06] text-vc-text-secondary text-[10px]"
                >
                  {tone}
                </span>
              ))}
            </div>
          </div>

          {/* Color Palette */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-vc-text-secondary">
              <Palette className="w-3.5 h-3.5 text-vc-text-secondary" />
              <span>Brand Color Palette</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                ...(profile.visual.primary_colors || []),
                ...(profile.visual.accent_colors || []),
                ...(profile.visual.secondary_colors || []),
              ].map((color, idx) => (
                <div
                  key={idx}
                  className="flex flex-col items-center p-2 rounded-lg bg-vc-canvas/80 "
                >
                  <div
                    className="w-7 h-7 rounded-md border border-white/20 shadow-sm mb-1"
                    style={{ backgroundColor: color }}
                  />
                  <span className="text-[10px] font-mono text-vc-text-muted">{color}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Typography */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-vc-text-secondary">
              <Type className="w-3.5 h-3.5 text-vc-text-secondary" />
              <span>Brand Typography</span>
            </div>
            <div className="p-3 rounded-xl bg-vc-surface2/60 text-xs text-vc-text-secondary">
              <div className="font-semibold text-white text-sm">
                {profile.visual.fonts?.[0] || 'Inter'}
              </div>
              <div className="text-[11px] text-vc-text-muted mt-1">
                Preferred Caption Style: <span className="text-white font-mono capitalize">{profile.captions?.default_style || 'Bold'}</span>
              </div>
            </div>
          </div>

          {/* Consistency Guarantee */}
          <div className="p-3 rounded-xl bg-emerald-950/20 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-emerald-300/90 leading-relaxed">
              Applying Brand Brain overrides current caption colors and typography while preserving existing word timestamps and ripple edits.
            </div>
          </div>

          {/* Apply Button */}
          <button
            onClick={handleApplyBrandKit}
            className={`w-full py-2.5 px-4 rounded-full font-medium text-xs flex items-center justify-center gap-2 transition ${
              applied
                ? 'bg-emerald-600 text-white'
                : 'bg-vc-ai-hover shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] text-white hover:bg-vc-ai shadow-lg shadow-black/50'
            }`}
          >
            {applied ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Brand Identity Applied!</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Apply Brand Style to Timeline</span>
              </>
            )}
          </button>
        </div>
      ) : error ? (
        <PanelError
          title="Couldn't load your Brand Kit"
          detail={error}
          onRetry={loadBrandProfile}
        />
      ) : (
        <PanelEmpty
          icon={Brain}
          title="No Brand Kit yet"
          hint="Set up your brand voice, colours and fonts to apply them across every clip."
          action={{ label: 'Set up Brand Kit', onClick: () => window.open('/brand', '_blank') }}
        />
      )}
    </div>
  );
};
