import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Ban, AlertTriangle, Lock } from 'lucide-react';
import {
  FONT_EM_PER_ASS_SIZE,
  CAPTION_PRESET_LABELS,
  CAPTION_PRESETS,
  CaptionPresetId,
  getPreviewFrame,
  regroupCuesForPreset,
  resolveCaptionPreset,
  RenderableCaptionPresetId,
  ResolvedCaptionStyle,
} from '../../lib/captionPresets';
import { CaptionPresetRenderer } from './CaptionPresetRenderer';

import {
  CAPTION_PRESET_GROUPS,
  GROUPED_PRESET_ORDER,
  NO_CAPTION_PRESET_ID,
  defaultOpenGroupId,
} from '../../lib/captionPresetGroups';
import { CollapsibleSection } from './panelKit';

/**
 * Flat, ordered id list behind the grouped presentation. Roving tabindex and Arrow/Home/End
 * index THIS, so keyboard navigation still walks every preset in one sequence regardless of
 * which groups happen to be open.
 */
const DISPLAY_ORDER: string[] = [NO_CAPTION_PRESET_ID, ...GROUPED_PRESET_ORDER];

/** Cards render presets enlarged so small styles stay legible; the editor canvas shows true size. */
const CARD_ZOOM = 1.75;
const SAMPLE_WORD_SECONDS = 0.42;
const SAMPLE_LOOP_PAUSE = 0.7;

interface CaptionPresetGalleryProps {
  selectedId: CaptionPresetId | null;
  onSelect: (id: CaptionPresetId) => void;
  /** Caption style that is not part of the gallery (legacy clips), shown as a note. */
  legacyStyleLabel?: string | null;
  /** False when the transcript only has segment timing. */
  hasWordTiming: boolean;
  /** Resolved style of the current selection, for font-fallback warnings. */
  resolvedStyle?: ResolvedCaptionStyle | null;
  keepColors?: boolean;
  onToggleKeepColors?: (keep: boolean) => void;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/** Sample cue(s) for a preset card, grouped with the preset's own rules. */
function useSampleCues(id: RenderableCaptionPresetId) {
  return useMemo(() => {
    const style = resolveCaptionPreset(id, undefined, '9:16');
    const words = CAPTION_PRESETS[id].sampleText.split(' ').map((text, i) => ({
      text,
      start: i * SAMPLE_WORD_SECONDS,
      end: (i + 1) * SAMPLE_WORD_SECONDS - 0.04,
    }));
    const { cues } = regroupCuesForPreset([{ id: 'sample', start: 0, end: words[words.length - 1].end, text: '', words }], style);
    const duration = words[words.length - 1].end + SAMPLE_LOOP_PAUSE;
    const longestLine = Math.max(...cues.flatMap((c) => c.text.split('\\N').map((l) => l.length)));
    return { style, cues, duration, longestLine };
  }, [id]);
}

const STATIC_PREVIEW_CLOCK = 0.9;

interface PresetCardPreviewProps {
  id: RenderableCaptionPresetId;
  isAnimating: boolean;
  reducedMotion: boolean;
  width: number;
}

const PresetCardPreview: React.FC<PresetCardPreviewProps> = React.memo(({
  id,
  isAnimating,
  reducedMotion,
  width,
}) => {
  const { style, cues, duration, longestLine } = useSampleCues(id);
  const [clock, setClock] = useState(STATIC_PREVIEW_CLOCK);

  // Animate strictly on hover or selection, respecting prefers-reduced-motion
  useEffect(() => {
    if (!isAnimating || reducedMotion) {
      setClock(STATIC_PREVIEW_CLOCK);
      return;
    }

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      setClock((now - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      setClock(STATIC_PREVIEW_CLOCK);
    };
  }, [isAnimating, reducedMotion, duration]);

  const effectiveWidth = width > 0 ? width : 150;

  // When not animating, clock is fixed at STATIC_PREVIEW_CLOCK (static thumbnail poster).
  // When animating, clock advances smoothly and loops across duration.
  const t = clock % duration;
  const cue = cues.find((c) => t >= c.start && t < c.end) || cues[cues.length - 1];
  const frame = cue ? getPreviewFrame(cue, Math.min(t, cue.end - 0.001), style) : null;

  // Card mode: keep preset typography but center the block inside the card.
  const cardStyle: ResolvedCaptionStyle = { ...style, alignment: 5, marginL: 0, marginR: 0 };
  // Enlarge for legibility, but never so far that a line would exceed the card (no re-wrapping).
  const base = effectiveWidth / style.playResX;
  const approxLinePx = longestLine * style.fontSize * FONT_EM_PER_ASS_SIZE[style.fontFamily] * 0.66 * base;
  const zoom = Math.min(CARD_ZOOM, (effectiveWidth - 20) / Math.max(1, approxLinePx));

  return <CaptionPresetRenderer style={cardStyle} frame={frame} scale={base * zoom} noWrap />;
});

export const CaptionPresetGallery: React.FC<CaptionPresetGalleryProps> = ({
  selectedId,
  onSelect,
  legacyStyleLabel,
  hasWordTiming,
  resolvedStyle,
  keepColors,
  onToggleKeepColors,
}) => {
  const reducedMotion = usePrefersReducedMotion();
  const [hoveredId, setHoveredId] = useState<CaptionPresetId | null>(null);
  const [cardWidth, setCardWidth] = useState(150);
  const galleryRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const el = galleryRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const containerW = entries[0]?.contentRect?.width;
      if (containerW && containerW > 0) {
        // Grid is 2 columns with 10px gap
        const itemW = Math.max(110, Math.floor((containerW - 10) / 2));
        setCardWidth(itemW);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const focusIndex = Math.max(0, selectedId ? DISPLAY_ORDER.indexOf(selectedId) : 0);
  const defaultGroupId = defaultOpenGroupId(selectedId ?? null);

  // Grouping is presentational only: Arrow/Home/End still walk one flat ordered list.
  const renderPresetTile = (id: CaptionPresetId, index: number) => {
          const isSelected = selectedId === id;
          const isHovered = hoveredId === id;
          const isAnimating = (isSelected || isHovered) && !reducedMotion;
          const preset = id === 'none' ? null : CAPTION_PRESETS[id];
          return (
            <button
              key={id}
              ref={(el) => {
                cardRefs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={preset ? `${preset.label}: ${preset.description}` : 'No Caption: render without captions'}
              tabIndex={index === focusIndex ? 0 : -1}
              onClick={() => onSelect(id)}
              onPointerEnter={() => setHoveredId(id)}
              onPointerLeave={() => setHoveredId((cur) => (cur === id ? null : cur))}
              onFocus={() => setHoveredId(id)}
              onBlur={() => setHoveredId((cur) => (cur === id ? null : cur))}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={`group relative rounded-xl border text-left transition-all duration-200 overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-vc-surface1 ${
                isSelected
                  ? 'border-white/40 ring-1 ring-white/30 bg-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.5),0_0_15px_rgba(255,255,255,0.05)] -translate-y-0.5'
                  : 'border-white/[0.08] bg-vc-canvas/90 hover:border-white/25 hover:bg-white/[0.02] hover:-translate-y-0.5'
              }`}
            >
              <div
                className="relative h-[88px] w-full overflow-hidden bg-[radial-gradient(ellipse_at_top,_#1B2438_0%,_#080B12_85%)] border-b border-vc-border"
              >
                {preset ? (
                  <PresetCardPreview
                    id={preset.id}
                    isAnimating={isAnimating}
                    reducedMotion={reducedMotion}
                    width={cardWidth}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-vc-text-muted">
                    <Ban className="w-6 h-6" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between gap-1.5 px-2.5 py-2 bg-vc-surface1/80">
                <span className="text-xs font-semibold text-vc-text-primary truncate">{CAPTION_PRESET_LABELS[id]}</span>
                {isSelected && (
                  <span className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center shrink-0 shadow-sm">
                    <Check className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" />
                  </span>
                )}
              </div>
            </button>
          );
  };


  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const cols = 2;
    let next = index;
    if (e.key === 'ArrowRight') next = index + 1;
    else if (e.key === 'ArrowLeft') next = index - 1;
    else if (e.key === 'ArrowDown') next = index + cols;
    else if (e.key === 'ArrowUp') next = index - cols;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = DISPLAY_ORDER.length - 1;
    else return;
    e.preventDefault();
    next = Math.min(DISPLAY_ORDER.length - 1, Math.max(0, next));
    cardRefs.current[next]?.focus();
    onSelect(DISPLAY_ORDER[next] as CaptionPresetId);
  };

  return (
    <div ref={galleryRef} className="space-y-2">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold text-vc-text-secondary uppercase tracking-wider">
            Preset Styles
          </span>
          <span className="text-[10px] text-vc-text-muted">
            (Hover or select to preview kinetic loop)
          </span>
        </div>
        {onToggleKeepColors && (
          <button
            type="button"
            onClick={() => onToggleKeepColors(!keepColors)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium border transition-all duration-150 ${
              keepColors
                ? 'bg-white/[0.12] border-white/30 text-white shadow-sm ring-1 ring-white/10'
                : 'bg-vc-canvas border-white/[0.08] text-vc-text-secondary hover:text-white hover:border-white/20'
            }`}
            title="Keep custom text and active highlight colors when switching presets"
          >
            <Lock className={`w-3 h-3 ${keepColors ? 'text-vc-text-primary' : 'text-vc-text-muted'}`} />
            <span>Keep My Colors</span>
          </button>
        )}
      </div>

      {/* "No captions" is not a style, so it gets its own full-width row rather than competing
          with 23 preview tiles. */}
      <div role="radiogroup" aria-label="Caption preset" onPointerLeave={() => setHoveredId(null)} className="space-y-2.5">
        <div className="grid grid-cols-1">{renderPresetTile('none', 0)}</div>

        {/* Grouped so a style can be found by family instead of scanned one-by-one, and so only
            the open group mounts its live previews. */}
        {CAPTION_PRESET_GROUPS.map((group) => (
          <CollapsibleSection
            key={group.id}
            id={`captions.presetGroup.${group.id}`}
            title={group.label}
            summary={group.hint}
            count={group.presetIds.length}
            defaultOpen={group.id === defaultGroupId}
          >
            <div className="grid grid-cols-2 gap-2.5">
              {group.presetIds.map((id) =>
                renderPresetTile(id as CaptionPresetId, DISPLAY_ORDER.indexOf(id)),
              )}
            </div>
          </CollapsibleSection>
        ))}
      </div>

      <p className="text-[10px] leading-relaxed text-vc-text-muted">
        Cards use each preset's real fonts, colors, timing and line breaks, enlarged for legibility. The canvas shows the
        exact on-frame size and position used for export.
      </p>

      {legacyStyleLabel && (
        <p className="text-[10px] leading-relaxed text-vc-text-secondary rounded-lg border border-vc-border bg-white/[0.03] px-2.5 py-2">
          This clip uses the legacy <span className="font-semibold text-vc-text-primary">{legacyStyleLabel}</span> style. Pick a
          preset to switch; legacy styles keep rendering as before until you do.
        </p>
      )}

      {!hasWordTiming && selectedId !== 'none' && (
        <p className="flex gap-1.5 text-[10px] leading-relaxed text-amber-300 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
          <span>
            This transcript has no word-level timestamps, so captions show whole phrases without word highlighting or
            word animation — in the preview and in the export.
          </span>
        </p>
      )}

      {resolvedStyle?.fontFallback && (
        <p className="flex gap-1.5 text-[10px] leading-relaxed text-amber-300 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden="true" />
          <span>
            “{resolvedStyle.requestedFontFamily}” isn't available to the video renderer, so captions use{' '}
            {resolvedStyle.fontFamily} in both preview and export.
          </span>
        </p>
      )}
    </div>
  );
};
