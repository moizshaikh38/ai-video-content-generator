import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Sparkles,
  MicOff,
  Scissors,
  Repeat,
  AudioWaveform,
  Film,
  Image as ImageIcon,
  Clapperboard,
  Languages,
  Mic,
  ZoomIn,
  Smile,
  Highlighter,
  Heading,
  ArrowRight,
} from 'lucide-react';
import { AI_TOOL_GROUPS, AiToolDef, AiToolStatus, isActivatable } from '../../lib/aiToolsRegistry';
import { computePreviewPlacement } from '../../lib/aiToolPreviewPlacement';
import { PanelRow, PanelBody, SectionLabel, PANEL_HEADER_TITLE, BADGE, TONE, type PanelTone } from './panelKit';

interface AiToolsPanelProps {
  activeToolId: string | null;
  onActivate: (tool: AiToolDef) => void;
  onSelectToolId: (id: string | null) => void;
}

const CARD_WIDTH = 256;
const CARD_GAP = 12;
const CLOSE_DELAY_MS = 110;

const ICONS: Record<string, LucideIcon> = {
  remove_filler: MicOff,
  remove_pauses: Scissors,
  remove_bad_takes: Repeat,
  speech_enhancement: AudioWaveform,
  ai_video_broll: Film,
  ai_image_broll: ImageIcon,
  stock_video_broll: Clapperboard,
  video_dubbing: Languages,
  voiceover_hook: Mic,
  auto_zoom: ZoomIn,
  ai_emoji: Smile,
  keyword_highlighter: Highlighter,
  auto_headline: Heading,
};

// Amber carries its real meaning here: a limited tool works, but not fully.
const STATUS_BADGE: Partial<Record<AiToolStatus, { label: string; tone: PanelTone }>> = {
  limited: { label: 'Limited', tone: 'warning' },
};

/** Lightweight CSS preview demos — one fixed media frame, no external assets, no autoplay. */
const PreviewVisual: React.FC<{ kind: string }> = ({ kind }) => {
  const base = 'w-full h-full flex items-center justify-center gap-1.5 px-4';
  switch (kind) {
    case 'filler':
    case 'badtakes':
      return (
        <div className={`${base} flex-wrap`}>
          {['um', 'actually', 'uh', 'like', 'you know'].map((w, i) => (
            <span
              key={i}
              className={`text-[11px] px-1.5 py-0.5 rounded-md ${
                i % 2 === 0
                  ? 'line-through text-rose-300/80 bg-rose-500/10 border border-rose-500/25'
                  : 'text-neutral-300 bg-white/[0.05] border border-white/[0.08]'
              }`}
            >
              {w}
            </span>
          ))}
        </div>
      );
    case 'pauses':
    case 'enhance':
    case 'voiceover':
      return (
        <div className={base}>
          {Array.from({ length: 24 }).map((_, i) => {
            const gap = kind === 'pauses' && (i === 8 || i === 9 || i === 16);
            const h = gap ? 4 : 6 + Math.round(Math.abs(Math.sin(i * 1.7)) * 26);
            return (
              <span
                key={i}
                style={{ height: `${h}px` }}
                className={`w-[3px] rounded-full ${
                  gap ? 'bg-rose-400/60' : kind === 'enhance' ? 'bg-emerald-400/70' : 'bg-violet-400/70'
                }`}
              />
            );
          })}
        </div>
      );
    case 'broll_video':
    case 'broll_image':
    case 'broll_stock':
      return (
        <div className={`${base} gap-1.5`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 h-14 rounded-md border border-white/[0.08] bg-white/[0.04] flex items-center justify-center"
            >
              {kind === 'broll_image' ? (
                <ImageIcon className="w-4 h-4 text-white/40" />
              ) : (
                <Film className="w-4 h-4 text-white/40" />
              )}
            </div>
          ))}
        </div>
      );
    case 'dub':
      return (
        <div className={`${base} flex-col gap-1`}>
          <span className="text-[11px] text-neutral-400">EN · “Let's go”</span>
          <ArrowRight className="w-3.5 h-3.5 text-violet-400 rotate-90" />
          <span className="text-[11px] text-white">ES · “Vamos”</span>
        </div>
      );
    case 'zoom':
      return (
        <div className={base}>
          <div className="relative w-24 h-14 rounded-md border border-white/[0.1] bg-white/[0.03]">
            <div className="absolute inset-[10px] rounded border-2 border-dashed border-violet-400/70" />
            <ZoomIn className="absolute inset-0 m-auto w-4 h-4 text-violet-300" />
          </div>
        </div>
      );
    case 'emoji':
      return (
        <div className={base}>
          {['🔥', '😂', '👀', '💯', '✨'].map((e, i) => (
            <span key={i} className="text-lg">
              {e}
            </span>
          ))}
        </div>
      );
    case 'keywords':
      return (
        <div className={`${base} flex-wrap`}>
          {['This', 'is', 'huge', 'for', 'creators'].map((w, i) => (
            <span
              key={i}
              className={`text-[13px] font-semibold ${
                w === 'huge' ? 'text-black bg-amber-400 px-1 rounded' : 'text-white'
              }`}
            >
              {w}
            </span>
          ))}
        </div>
      );
    case 'headline':
      return (
        <div className={`${base} flex-col gap-1`}>
          <span className="text-[13px] font-bold text-white">“The $0 growth hack”</span>
          <span className="text-[10px] text-emerald-300">Hook score 88</span>
        </div>
      );
    default:
      return (
        <div className={base}>
          <Sparkles className="w-6 h-6 text-violet-400/50" />
        </div>
      );
  }
};

/** One shared preview card for every tool — identical structure, spacing and media frame. */
const ToolPreviewCard: React.FC<{ tool: AiToolDef; onActivate: (t: AiToolDef) => void }> = ({
  tool,
  onActivate,
}) => {
  const Icon = ICONS[tool.id] ?? Sparkles;
  const badge = STATUS_BADGE[tool.status];
  return (
    <div className="rounded-xl border border-vc-border-strong bg-vc-surface3 ring-1 ring-black/40 shadow-2xl shadow-black/70 overflow-hidden">
      {/* Fixed-ratio media frame — consistent across every tool. */}
      <div className="h-[104px] bg-[#0B0D12] border-b border-white/[0.06]">
        <div className="w-full h-full flex items-center justify-center">
          <PreviewVisual kind={tool.preview} />
        </div>
      </div>

      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center bg-violet-500/12 text-violet-300">
            <Icon className="w-3.5 h-3.5" />
          </span>
          <h4 className="text-[13px] font-semibold text-white leading-none">{tool.label}</h4>
          {badge && (
            <span
              className={`ml-auto ${BADGE} ${TONE[badge.tone]}`}
            >
              {badge.label}
            </span>
          )}
        </div>

        <p className="text-[11px] text-neutral-400 leading-snug mt-2">{tool.expectedResult}</p>

        {tool.status === 'limited' && tool.limitation && (
          <p className="text-[10.5px] text-amber-300/85 leading-snug mt-2 pl-2 border-l-2 border-amber-500/30">
            {tool.limitation}
          </p>
        )}

        {isActivatable(tool) && (
          <button
            onClick={() => onActivate(tool)}
            className="w-full mt-3 h-8 rounded-lg bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
          >
            <span>{tool.actionLabel}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Guided AI Tools panel: grouped tool rows with a single shared preview card that opens beside the
 * hovered/focused row. The card is portaled to <body> and positioned by one deterministic function
 * (prefers the side with room, clamps within the viewport), so it can never be clipped by the
 * inspector's overflow or thrown off by a transformed ancestor. Hover/focus only previews — it
 * never applies anything; clicking a tool opens its real workflow.
 */
export const AiToolsPanel: React.FC<AiToolsPanelProps> = ({
  activeToolId,
  onActivate,
  onSelectToolId,
}) => {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<{ top: number; left: number } | null>(null);
  const rowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const cardRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shownTool = useMemo(
    () => (previewId ? AI_TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === previewId) ?? null : null),
    [previewId],
  );

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimer.current = setTimeout(() => setPreviewId(null), CLOSE_DELAY_MS);
  }, [cancelClose]);

  const openFor = useCallback(
    (id: string) => {
      cancelClose();
      setPreviewId(id);
    },
    [cancelClose],
  );

  // Position (and reposition) the card from the real row + measured card size. Runs after the card
  // mounts so the height is exact — no hardcoded guess — then re-runs on resize/scroll while open.
  const reposition = useCallback(() => {
    if (!previewId) return;
    const row = rowRefs.current[previewId];
    const card = cardRef.current;
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const next = computePreviewPlacement({
      row: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom },
      cardWidth: card?.offsetWidth ?? CARD_WIDTH,
      cardHeight: card?.offsetHeight ?? 320,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      gap: CARD_GAP,
    });
    setPlacement({ top: next.top, left: next.left });
  }, [previewId]);

  useLayoutEffect(() => {
    if (!shownTool) {
      setPlacement(null);
      return;
    }
    reposition();
  }, [shownTool, reposition]);

  useEffect(() => {
    if (!shownTool) return;
    const handler = () => reposition();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [shownTool, reposition]);

  useEffect(() => () => cancelClose(), [cancelClose]);

  return (
    <div className="flex flex-col h-full min-h-0" data-ai-tools-root onMouseLeave={scheduleClose}>
      {/* Local header for now — PanelShell/PanelHeader take over when the panel shells are
          converted, at which point this panel stops owning its own chrome entirely. */}
      <div className="shrink-0 flex items-center gap-2 px-3.5 h-12 border-b border-vc-border">
        <Sparkles className="w-4 h-4 text-violet-400" />
        <h3 className={PANEL_HEADER_TITLE}>AI Tools</h3>
        <span className="ml-auto text-[10px] text-vc-text-muted">Hover to preview</span>
      </div>

      <PanelBody className="space-y-5">
        {AI_TOOL_GROUPS.map((group) => (
          <div key={group.id}>
            <SectionLabel>{group.label}</SectionLabel>
            <div className="space-y-1">
              {group.tools.map((tool) => {
                const Icon = ICONS[tool.id] ?? Sparkles;
                const isActive = activeToolId === tool.id || previewId === tool.id;
                const badge = STATUS_BADGE[tool.status];
                return (
                  <PanelRow
                    key={tool.id}
                    ref={(el) => {
                      rowRefs.current[tool.id] = el;
                    }}
                    icon={Icon}
                    title={tool.label}
                    description={tool.description}
                    badge={badge ? { label: badge.label, tone: badge.tone } : undefined}
                    tone="ai"
                    active={isActive}
                    trailing={
                      <ArrowRight className="w-3.5 h-3.5 text-vc-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                    }
                    onMouseEnter={() => openFor(tool.id)}
                    onFocus={() => openFor(tool.id)}
                    onBlur={scheduleClose}
                    onClick={() => {
                      onSelectToolId(tool.id);
                      // Mouse users already previewed via hover → click activates. Touch users
                      // (no hover) get tap-to-preview first; a second tap on the previewed row
                      // activates.
                      if (isActivatable(tool) && previewId === tool.id) {
                        onActivate(tool);
                      } else {
                        openFor(tool.id);
                      }
                    }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </PanelBody>

      {/* Single shared preview card, portaled to <body> so no overflow/transform can clip it. */}
      {shownTool &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={cardRef}
            role="dialog"
            aria-label={`${shownTool.label} preview`}
            className="fixed z-[60] transition-opacity duration-100"
            style={{
              top: placement?.top ?? -9999,
              left: placement?.left ?? -9999,
              width: CARD_WIDTH,
              opacity: placement ? 1 : 0,
            }}
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
          >
            <ToolPreviewCard tool={shownTool} onActivate={onActivate} />
          </div>,
          document.body,
        )}
    </div>
  );
};

export type { AiToolsPanelProps };
export { ICONS as AI_TOOL_ICONS };
