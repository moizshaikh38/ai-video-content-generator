import {framingStrategyState} from '../../lib/framingStrategyState';
import {effectiveContentLayout, type ContentFramingDecision} from '../../../server/src/shared/contentFramingDecision';
import React from 'react';
import {
  Crop,
  Sparkles,
  Maximize2,
  Shield,
  LayoutTemplate,
} from 'lucide-react';
import { EditorProject } from '../../types';
import { ScenePlanReview, type ScenePlanReviewProps } from './ScenePlanReview';
import { OUTPUT_TEMPLATES, OutputTemplateId } from '../../../server/src/shared/outputTemplates';
import { applySocialCardToProject, SOCIAL_CARD_TAG, SocialCardConfig } from '../../../server/src/shared/socialCard';

interface ScreencastConfigEdit {
  mode?: 'split_stacked' | 'circular_inset' | 'rounded_card_inset';
  insetPosition?: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';
  background?: 'black' | 'blur';
  facecamBox?: { x: number; y: number; w: number; h: number } | null;
}

interface FramingWorkspacePanelProps {
  contentFramingDecision?: ContentFramingDecision | null;
  project: EditorProject;
  showSafeGuides: boolean;
  onToggleSafeGuides: () => void;
  onUpdateCropMode: (mode: 'center' | 'fit' | 'blur' | 'smart') => void;
  onUpdateLayoutMode?: (layout: 'track' | 'split' | 'screencast' | 'blur') => void;
  onApplyOutputTemplate?: (templateId: OutputTemplateId) => void;
  onUpdateSplitAnchors?: (anchors: { speaker1X: number; speaker2X: number }) => void;
  onUpdateScreencast?: (patch: ScreencastConfigEdit) => void;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject) => void;
  /** Actual current analysis execution receipt, not environment capability. */
  measuredCapabilities?: import('../../../server/src/shared/measuredReframeCapabilities').MeasuredReframeCapabilities|null;
  /** Stored per-scene plan review + explicit single-scene Apply. */
  scenePlan?: Omit<ScenePlanReviewProps, 'project'> | null;
}

export const FramingWorkspacePanel: React.FC<FramingWorkspacePanelProps> = ({
  project,
  contentFramingDecision = null,
  showSafeGuides,
  onToggleSafeGuides,
  onUpdateCropMode,
  onUpdateLayoutMode,
  onApplyOutputTemplate,
  onUpdateSplitAnchors,
  onUpdateScreencast,
  onUpdateProject: _onUpdateProject,
  scenePlan = null,
  measuredCapabilities = null,
}) => {
  // Read active framing mode from video track or default to smart
  const videoTrack = project.tracks.find((t) => t.type === 'VIDEO');
  const videoItem = videoTrack?.items[0];
  const strategyState=framingStrategyState(project);
  const activeCropMode=strategyState.mode;
  // Fill/fit/blur state comes from the same channel the export compiler and the
  // preview toolbar toggle use (item.crop), with legacy crop_mode as fallback so
  // the panel and the toolbar always agree, including after save/reopen/undo.
  const activeFillMode: 'fill' | 'fit' | 'blur' = videoItem?.crop?.mode
    ? (videoItem.crop.mode === 'fit' ? 'fit' : videoItem.crop.mode === 'blur' ? 'blur' : 'fill')
    : ((videoItem as any)?.crop_mode === 'fit' ? 'fit' : 'fill');
  const activeLayoutMode = effectiveContentLayout(videoItem,contentFramingDecision);
  const screencastCfg = ((videoItem as any)?.crop_config?.screencast || {}) as ScreencastConfigEdit;
  // Split speaker anchors: persisted picks win; otherwise the symmetric
  // defaults the export filter uses (EditorShell seeds measured analysis
  // anchors into crop_config.split when the layout is picked).
  const splitCfg = ((videoItem as any)?.crop_config?.split || {}) as { speaker1X?: number; speaker2X?: number };
  const speaker1X = Number.isFinite(splitCfg.speaker1X) ? Number(splitCfg.speaker1X) : 0.25;
  const speaker2X = Number.isFinite(splitCfg.speaker2X) ? Number(splitCfg.speaker2X) : 0.75;
  const facecamSuggestion = ((videoItem as any)?.reframe_metadata?.facecam_box || null) as { x: number; y: number; w: number; h: number } | null;

  return (
    <div className="flex flex-col h-full bg-vc-surface1 text-neutral-300 text-xs select-none overflow-y-auto p-4 space-y-4 animate-panelSlideIn">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-white/[0.06] border border-white/[0.12] flex items-center justify-center text-white">
            <Crop className="w-3.5 h-3.5" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Framing & Reframe</h3>
            <p className="text-[10px] text-neutral-400">Subject tracking & viewport cropping</p>
          </div>
        </div>
      </div>

      {/* One-click output templates: aspect + framing + captions + hook + transitions in one pick */}
      {onApplyOutputTemplate && (
        <div>
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
            <LayoutTemplate className="w-3 h-3" />
            Output Templates
          </label>
          <div className="flex flex-col gap-1.5">
            {OUTPUT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => onApplyOutputTemplate(tpl.id)}
                className="w-full text-left px-2.5 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/[0.16] transition"
                title={tpl.description}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white text-[11px]">{tpl.name}</span>
                  <span className="text-[9px] text-neutral-500">{tpl.aspectRatio}</span>
                </div>
                <div className="text-[10px] text-neutral-400 mt-0.5">{tpl.bestFor}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Social card chrome: creator name + @handle corner overlay (TEXT channel) */}
      <SocialCardSection project={project} onUpdateProject={_onUpdateProject} />

      {contentFramingDecision && (
        <div className="rounded-lg border border-violet-400/20 bg-violet-500/5 p-3 space-y-1">
          <div className="font-medium text-white">Experimental auto framing</div>
          <div>{contentFramingDecision.genre.replace(/_/g,' ')} / {contentFramingDecision.policy.replace(/_/g,' ')}</div>
          {contentFramingDecision.reasons.map((reason,i)=><p key={i} className="text-[11px] text-neutral-300">{reason}</p>)}
          {contentFramingDecision.uncertainties.map((reason,i)=><p key={i} className="text-[10px] text-amber-200/80">{reason}</p>)}
          <p className="text-[10px] text-neutral-400">One frame size for the clip. Manual layout choices take priority.</p>
        </div>
      )}
      {measuredCapabilities && <div data-testid="measured-analysis-capabilities" className="rounded-lg border border-white/10 p-3 text-[10px] text-neutral-400">
        <p>Measured {measuredCapabilities.sample_count} frames: faces in {measuredCapabilities.face_sample_count}, bodies in {measuredCapabilities.person_sample_count}{measuredCapabilities.person_detector==='not-configured'?' (body detector not configured)':''}.</p>
        <p>Human vs animation and active speakers were not checked. Missing detections do not mean absent subjects.</p>
      </div>}
      {scenePlan && <ScenePlanReview project={project} {...scenePlan} />}
      {/* Reframe & Crop Modes */}
      <div>
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Framing Strategy
        </label>
        <p data-testid="framing-strategy-scope" className="text-[10px] text-neutral-400 mb-2">{activeCropMode==='mixed'?'Mixed scene framing. ':activeCropMode==='review'?'Scene framing needs review. ':activeCropMode==='manual'?'Manual scene framing. ':''}Changes apply to unlocked video items. {strategyState.locked>0?`${strategyState.locked} locked video item${strategyState.locked===1?' is':'s are'} kept unchanged.`:''}</p>
        <div className="grid grid-cols-2 gap-2">
          {/* Smart Reframe */}
          <button
            type="button"
            onClick={() => onUpdateCropMode('smart')}
            disabled={strategyState.editable===0}
            aria-pressed={activeCropMode==='smart'}
            className={`p-3 rounded-xl border text-left transition disabled:opacity-40 disabled:cursor-not-allowed ${
              activeCropMode === 'smart'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <Sparkles className="w-3.5 h-3.5 text-violet-400" />
              <span>Smart Reframe</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-1 leading-tight">
              Use stored automatic framing for unlocked video items. Replaces their manual crops, layouts and subject tracking.
            </div>
          </button>

          {/* Center Fill */}
          <button
            type="button"
            onClick={() => onUpdateCropMode('center')}
            disabled={strategyState.editable===0}
            aria-pressed={activeCropMode==='center'}
            className={`p-3 rounded-xl border text-left transition disabled:opacity-40 disabled:cursor-not-allowed ${
              activeCropMode === 'center'
                ? 'bg-white/[0.12] border-white/40 text-white ring-1 ring-white/20'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <Maximize2 className="w-3.5 h-3.5 text-neutral-300" />
              <span>Center Fill</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-1 leading-tight">
              Fixed center crop for unlocked video items. Resets their crop focus and zoom.
            </div>
          </button>
        </div>
      </div>

      {/* Genre Canvas Layouts (Opus.pro 4-Layout Switcher) */}
      <div className="pt-3 border-t border-white/[0.08]">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Vertical Canvas Layout
        </label>
        <div className="grid grid-cols-2 gap-2">
          {/* Track (Solo) */}
          <button
            type="button"
            onClick={() => onUpdateLayoutMode?.('track')}
            className={`p-2.5 rounded-xl border text-left transition ${
              activeLayoutMode === 'track'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <span>🎯 Speaker Track</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Active speaker pan (Solo)</div>
          </button>

          {/* Split (Podcasts) */}
          <button
            type="button"
            onClick={() => onUpdateLayoutMode?.('split')}
            className={`p-2.5 rounded-xl border text-left transition ${
              activeLayoutMode === 'split'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <span>🎙️ Podcast Split</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Top/Bottom 2-speaker stack</div>
          </button>

          {/* Screencast (Demos) */}
          <button
            type="button"
            onClick={() => onUpdateLayoutMode?.('screencast')}
            className={`p-2.5 rounded-xl border text-left transition ${
              activeLayoutMode === 'screencast'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <span>💻 Screencast & Cam</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Screen top + Cam bottom</div>
          </button>

          {/* Fit with Blur */}
          <button
            type="button"
            onClick={() => onUpdateLayoutMode?.('blur')}
            className={`p-2.5 rounded-xl border text-left transition ${
              activeLayoutMode === 'blur'
                ? 'bg-violet-500/15 border-violet-500/40 text-violet-200 ring-1 ring-violet-500/30'
                : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
            }`}
          >
            <div className="font-semibold text-xs flex items-center gap-1.5 text-white">
              <span>🖼️ Fit with Blur</span>
            </div>
            <div className="text-[10px] text-neutral-400 mt-0.5">Blurred 9:16 background</div>
          </button>
        </div>
      </div>

      {/* Split speaker anchor controls: which source position each half
          centers on. Seeded from measured analysis when available; these are
          the same values the export's split filter consumes. */}
      {activeLayoutMode === 'split' && (
        <div className="pt-3 border-t border-white/[0.08] space-y-3">
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
            Speaker Positions
          </label>
          {(
            [
              ['Top half', 'speaker1X', speaker1X],
              ['Bottom half', 'speaker2X', speaker2X],
            ] as const
          ).map(([label, key, value]) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-neutral-400">{label}</span>
                <span className="text-[11px] text-neutral-500 tabular-nums">{Math.round(value * 100)}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={90}
                step={1}
                value={Math.round(value * 100)}
                onChange={(e) => {
                  const pct = Number(e.target.value) / 100;
                  const next =
                    key === 'speaker1X'
                      ? { speaker1X: Math.min(pct, speaker2X - 0.05), speaker2X }
                      : { speaker1X, speaker2X: Math.max(pct, speaker1X + 0.05) };
                  onUpdateSplitAnchors?.(next);
                }}
                className="w-full accent-violet-500"
                aria-label={label}
              />
            </div>
          ))}
          <p className="text-[10px] text-neutral-500 leading-tight">
            Where each speaker sits in the original frame. Center them so neither face is clipped.
          </p>
        </div>
      )}

      {/* Screencast correction controls */}
      {activeLayoutMode === 'screencast' && (
        <div className="pt-3 border-t border-white/[0.08] space-y-3">
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
            Screencast Layout
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ['split_stacked', 'Stacked'],
              ['circular_inset', 'Circle Cam'],
              ['rounded_card_inset', 'Card Cam'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onUpdateScreencast?.({ mode: value })}
                className={`p-2 rounded-lg border text-[11px] transition ${
                  (screencastCfg.mode || 'split_stacked') === value
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                    : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {(screencastCfg.mode === 'circular_inset' || screencastCfg.mode === 'rounded_card_inset') && (
            <>
              <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
                Camera Position
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ['top_left', 'TL'],
                  ['top_right', 'TR'],
                  ['bottom_left', 'BL'],
                  ['bottom_right', 'BR'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onUpdateScreencast?.({ insetPosition: value })}
                    className={`p-2 rounded-lg border text-[11px] transition ${
                      (screencastCfg.insetPosition || 'bottom_right') === value
                        ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                        : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
            Background
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {([
              ['black', 'Black bars'],
              ['blur', 'Blurred fill'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => onUpdateScreencast?.({ background: value })}
                className={`p-2 rounded-lg border text-[11px] transition ${
                  (screencastCfg.background || 'black') === value
                    ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                    : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block">
            Facecam Region
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              disabled={!facecamSuggestion && !screencastCfg.facecamBox}
              onClick={() => onUpdateScreencast?.({ facecamBox: facecamSuggestion ?? screencastCfg.facecamBox ?? null })}
              className={`p-2 rounded-lg border text-[11px] transition ${
                screencastCfg.facecamBox
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                  : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
              } disabled:opacity-40`}
            >
              {screencastCfg.facecamBox ? 'Detected region ✓' : facecamSuggestion ? 'Use detected region' : 'No region detected'}
            </button>
            <button
              type="button"
              disabled={!screencastCfg.facecamBox && screencastCfg.facecamBox !== null && !facecamSuggestion}
              onClick={() => onUpdateScreencast?.({ facecamBox: null })}
              className={`p-2 rounded-lg border text-[11px] transition ${
                screencastCfg.facecamBox === null
                  ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                  : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-neutral-300'
              } disabled:opacity-40`}
            >
              {screencastCfg.facecamBox === null ? 'Center crop ✓' : 'Center crop cam'}
            </button>
          </div>
          <p className="text-[10px] text-neutral-500">
            The detected region is a geometric suggestion from analysis, not a certainty - adjust or clear it anytime.
          </p>
        </div>
      )}

      {/* Fill / Fit / Blur Mode - same control as the preview toolbar Layout toggle */}
      <div className="pt-3 border-t border-white/[0.08]">
        <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
          Fill Mode
        </label>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['center', 'Fill Stage', 'Edge-to-edge without bars', 'fill'],
            ['fit', 'Fit to Stage', 'Whole frame, plain borders', 'fit'],
            ['blur', 'Blur Fill', 'Whole frame, blurred background', 'blur'],
          ] as const).map(([mode, label, hint, key]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onUpdateCropMode(mode)}
              className={`p-2.5 rounded-xl border text-left transition ${
                activeFillMode === key
                  ? 'bg-violet-500/15 border-violet-500/40 text-white ring-1 ring-violet-500/30'
                  : 'bg-vc-canvas border-white/[0.06] hover:border-white/20 text-white'
              }`}
            >
              <div className="font-semibold text-xs">{label}</div>
              <div className="text-[10px] text-neutral-500 mt-0.5">{hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Platform Safe Zone Overlay Toggle */}
      <div className="pt-3 border-t border-white/[0.08]">
        <div className="flex items-center justify-between p-3 rounded-xl bg-vc-canvas ">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-neutral-300" />
            <div>
              <span className="font-semibold text-white text-xs block">Platform Safe Zones</span>
              <span className="text-[10px] text-neutral-400">TikTok, Reels & Shorts hazard overlays</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleSafeGuides}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
              showSafeGuides
                ? 'bg-white text-black shadow-sm'
                : 'bg-white/[0.08] text-neutral-400 hover:text-white'
            }`}
          >
            {showSafeGuides ? 'Active' : 'Hidden'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Social card chrome controls. Local draft state is seeded from the
// project’s existing card items; every change applies the pure shared mapper
// through the real onUpdateProject channel (idempotent re-apply).
const SocialCardSection: React.FC<{
  project: EditorProject;
  onUpdateProject: (updater: (prev: EditorProject) => EditorProject) => void;
}> = ({ project, onUpdateProject }) => {
  const existing = React.useMemo(() => {
    const items = project.tracks.flatMap((t) => t.items).filter((i: any) => i.social_card === SOCIAL_CARD_TAG);
    if (items.length === 0) return null;
    const name = items.find((i: any) => !(i.text?.text || '').startsWith('@'));
    const handle = items.find((i: any) => (i.text?.text || '').startsWith('@'));
    const x = name?.transform?.position_x ?? -96;
    const y = name?.transform?.position_y ?? -250;
    return {
      displayName: name?.text?.text || '',
      handle: (handle?.text?.text || '').replace(/^@/, ''),
      theme: (name?.text?.color === '#111111' ? 'light' : 'dark') as 'dark' | 'light',
      position: `${y < 0 ? 'top' : 'bottom'}-${x < 0 ? 'left' : 'right'}` as SocialCardConfig['position'],
      avatarUrl: (items.find((i: any) => i.social_card === SOCIAL_CARD_TAG && i.type === 'OVERLAY' && i.source_path) as any)?.source_path || '',
      // Legacy text-only cards (no chrome items) read back as enabled, so
      // re-applying an old card upgrades it instead of staying bare.
      cardBackground: !items.some((i: any) => i.social_card === SOCIAL_CARD_TAG && i.type === 'OVERLAY') || items.some((i: any) => i.social_card === SOCIAL_CARD_TAG && (i as any).card),
    };
  }, [project]);

  const [enabled, setEnabled] = React.useState(!!existing);
  const [displayName, setDisplayName] = React.useState(existing?.displayName || '');
  const [handle, setHandle] = React.useState(existing?.handle || '');
  const [theme, setTheme] = React.useState<'dark' | 'light'>(existing?.theme || 'dark');
  const [position, setPosition] = React.useState<SocialCardConfig['position']>(existing?.position || 'top-left');
  const [avatarUrl, setAvatarUrl] = React.useState(existing?.avatarUrl || '');
  const [cardBackground, setCardBackground] = React.useState(existing?.cardBackground ?? true);

  const apply = (patch: Partial<SocialCardConfig> & { enabled?: boolean }) => {
    const next = {
      enabled: patch.enabled ?? enabled,
      displayName: patch.displayName ?? displayName,
      handle: patch.handle ?? handle,
      theme: patch.theme ?? theme,
      position: patch.position ?? position,
      avatarUrl: (patch.avatarUrl ?? avatarUrl) || undefined,
      cardBackground: patch.cardBackground ?? cardBackground,
    };
    onUpdateProject((prev) => applySocialCardToProject(prev as any, next) as unknown as EditorProject);
  };

  return (
    <div>
      <label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider block mb-2">
        Social Card
      </label>
      <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2.5 space-y-2">
        <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              apply({ enabled: e.target.checked });
            }}
            className="accent-vc-accent"
          />
          Show creator name & handle
        </label>
        {enabled && (
          <>
            <input
              type="text"
              value={displayName}
              placeholder="Display name"
              onChange={(e) => {
                setDisplayName(e.target.value);
                apply({ displayName: e.target.value });
              }}
              className="w-full px-2 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.1] text-white text-[11px] placeholder:text-neutral-500"
            />
            <input
              type="text"
              value={handle}
              placeholder="handle (without @)"
              onChange={(e) => {
                setHandle(e.target.value);
                apply({ handle: e.target.value });
              }}
              className="w-full px-2 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.1] text-white text-[11px] placeholder:text-neutral-500"
            />
            <input
              type="text"
              value={avatarUrl}
              placeholder="Avatar image URL (optional)"
              onChange={(e) => {
                setAvatarUrl(e.target.value);
                apply({ avatarUrl: e.target.value });
              }}
              className="w-full px-2 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.1] text-white text-[11px] placeholder:text-neutral-500"
            />
            <label className="flex items-center gap-2 text-[11px] text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={cardBackground}
                onChange={(e) => {
                  setCardBackground(e.target.checked);
                  apply({ cardBackground: e.target.checked });
                }}
                className="accent-vc-accent"
              />
              Rounded card background
            </label>
            <div className="flex gap-1.5">
              <select
                value={theme}
                onChange={(e) => {
                  const v = e.target.value as 'dark' | 'light';
                  setTheme(v);
                  apply({ theme: v });
                }}
                className="flex-1 px-2 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.1] text-white text-[11px]"
              >
                <option value="dark">Dark (white text)</option>
                <option value="light">Light (black text)</option>
              </select>
              <select
                value={position}
                onChange={(e) => {
                  const v = e.target.value as SocialCardConfig['position'];
                  setPosition(v);
                  apply({ position: v });
                }}
                className="flex-1 px-2 py-1.5 rounded-md bg-white/[0.05] border border-white/[0.1] text-white text-[11px]"
              >
                <option value="top-left">Top left</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
