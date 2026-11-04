import React, { useEffect, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CARD,
  CARD_HOVER,
  CARD_SELECTED,
  TILE,
  TILE_SELECTED,
  TILE_MEDIA,
  TILE_CAPTION,
  TILE_SKELETON,
  ROW,
  ROW_ACTIVE_TONE,
  ROW_ICON,
  ROW_ICON_TONE,
  ROW_ICON_IDLE,
  ROW_TITLE,
  ROW_DESCRIPTION,
  BADGE,
  TONE,
  type PanelTone,
} from './panelTokens';

/* ── Card ──────────────────────────────────────────────────────────────── */

interface PanelCardProps {
  interactive?: boolean;
  selected?: boolean;
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
}

export const PanelCard: React.FC<PanelCardProps> = ({
  interactive,
  selected,
  className = '',
  onClick,
  children,
}) => {
  const cls = `${CARD} ${interactive ? CARD_HOVER : ''} ${selected ? CARD_SELECTED : ''} ${className}`;
  if (!onClick) return <div className={cls}>{children}</div>;
  return (
    <button type="button" onClick={onClick} className={`${cls} w-full text-left`}>
      {children}
    </button>
  );
};

/* ── Row ───────────────────────────────────────────────────────────────── */

interface PanelRowProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  badge?: { label: string; tone?: PanelTone };
  /** Accent used for the active and icon states — 'ai' keeps violet on genuine AI panels. */
  tone?: PanelTone;
  active?: boolean;
  trailing?: React.ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

/** Fixed 44px list row — icon chip, title, one-line description, optional badge/trailing. */
export const PanelRow = React.forwardRef<HTMLButtonElement, PanelRowProps>(
  ({ icon: Icon, title, description, badge, tone = 'neutral', active, trailing, ...handlers }, ref) => (
    <button
      ref={ref}
      type="button"
      className={`${ROW} ${active ? ROW_ACTIVE_TONE[tone] : ''}`}
      {...handlers}
    >
      <span className={`${ROW_ICON} ${active ? ROW_ICON_TONE[tone] : ROW_ICON_IDLE}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className={ROW_TITLE}>{title}</span>
          {badge && <span className={`${BADGE} ${TONE[badge.tone ?? 'neutral']}`}>{badge.label}</span>}
        </span>
        {description && <span className={ROW_DESCRIPTION}>{description}</span>}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </button>
  ),
);
PanelRow.displayName = 'PanelRow';

/* ── Tile ──────────────────────────────────────────────────────────────── */

interface PanelTileProps {
  label: string;
  media: React.ReactNode;
  /** Cheap stand-in rendered until the tile scrolls into view (with `lazy`). */
  poster?: React.ReactNode;
  lazy?: boolean;
  selected?: boolean;
  trailing?: React.ReactNode;
  mediaHeight?: number;
  aspect?: 'square' | 'wide';
  onSelect?: () => void;
  role?: string;
  'aria-checked'?: boolean;
  tabIndex?: number;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export const PanelTile = React.forwardRef<HTMLButtonElement, PanelTileProps>(
  (
    {
      label,
      media,
      poster,
      lazy,
      selected,
      trailing,
      mediaHeight = 76,
      aspect,
      onSelect,
      ...rest
    },
    ref,
  ) => {
    const hostRef = useRef<HTMLButtonElement | null>(null);
    const [visible, setVisible] = useState(!lazy);

    // Mounting 23 live preview subtrees at once is the gallery's real cost; gate on visibility.
    useEffect(() => {
      if (!lazy || visible) return;
      const el = hostRef.current;
      if (!el || typeof IntersectionObserver === 'undefined') {
        setVisible(true);
        return;
      }
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setVisible(true);
            io.disconnect();
          }
        },
        { rootMargin: '120px' },
      );
      io.observe(el);
      return () => io.disconnect();
    }, [lazy, visible]);

    return (
      <button
        ref={(node) => {
          hostRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
        }}
        type="button"
        onClick={onSelect}
        className={`${TILE} ${selected ? TILE_SELECTED : ''}`}
        {...rest}
      >
        <div
          className={`${TILE_MEDIA} ${aspect === 'square' ? 'aspect-square h-auto' : ''}`}
          style={aspect === 'square' ? undefined : { height: mediaHeight }}
        >
          {visible ? media : poster ?? null}
        </div>
        <div className={TILE_CAPTION}>
          <span className="truncate">{label}</span>
          {trailing}
        </div>
      </button>
    );
  },
);
PanelTile.displayName = 'PanelTile';

export const PanelTileSkeleton: React.FC<{ count?: number; aspect?: 'square' | 'wide' }> = ({
  count = 4,
  aspect = 'wide',
}) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className={`${TILE_SKELETON} ${aspect === 'square' ? 'aspect-square' : 'h-[102px]'}`}
      />
    ))}
  </>
);
