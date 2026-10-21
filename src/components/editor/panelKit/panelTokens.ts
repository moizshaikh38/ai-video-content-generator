/**
 * The single home for every sidebar-panel class recipe.
 *
 * Intentionally dependency-free (no React, no imports) so it can be unit-tested under the
 * backend node:test runner — the same cross-tree pattern as src/lib/aiToolsRegistry.ts.
 *
 * Why this file exists: seven editor panels each invented their own header, four different
 * section-label styles, three card recipes for the same job, and radii from `rounded` to
 * `rounded-2xl`. Centralising the strings is what stops that drift returning.
 *
 * Colours come from the --vc-* tokens via tailwind.config.js. Note the Tailwind keys are
 * `surface1`/`surface2` (not `surface-1`) — a wrong key silently compiles to nothing.
 */

/* ── Shell ─────────────────────────────────────────────────────────────── */

export const PANEL_SHELL =
  'w-[350px] shrink-0 z-20 flex flex-col h-full min-h-0 overflow-hidden text-xs text-vc-text-secondary select-none';

/** `.glass-panel` has a right border, `.glass-dock` a left one — pick by dock side. */
export const PANEL_SURFACE = {
  left: 'glass-panel',
  right: 'glass-dock',
} as const;

export const PANEL_HEADER =
  'shrink-0 flex items-center gap-2.5 px-3.5 h-12 border-b border-vc-border';

export const PANEL_HEADER_TITLE = 'text-sm font-semibold text-vc-text-primary leading-none truncate';
export const PANEL_HEADER_SUBTITLE = 'text-[10.5px] text-vc-text-muted truncate mt-0.5';

/** The ONE scroller in a panel. Nothing inside it may also scroll. */
export const PANEL_BODY = 'flex-1 min-h-0 overflow-y-auto px-3.5 py-3.5 space-y-4';

/** Sticky, non-scrolling strip for search / tabs directly under the header. */
export const PANEL_TOOLBAR =
  'shrink-0 px-3.5 py-2 border-b border-vc-border bg-vc-surface1/60 backdrop-blur-sm';

/* ── Cards & tiles ─────────────────────────────────────────────────────── */

export const CARD = 'rounded-xl border border-vc-border bg-vc-surface2/60 p-3';
export const CARD_HOVER =
  'transition-colors duration-150 hover:border-vc-border-strong hover:bg-vc-surface2';
export const CARD_SELECTED = 'border-white/40 bg-white/[0.06] ring-1 ring-white/20';

export const TILE =
  'group relative overflow-hidden rounded-xl border border-vc-border bg-vc-canvas/80 text-left transition-colors duration-150 hover:border-vc-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
export const TILE_SELECTED = 'border-white/50 ring-1 ring-white/25';
export const TILE_MEDIA = 'w-full border-b border-white/[0.06] bg-vc-canvas';
export const TILE_CAPTION =
  'flex items-center justify-between gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-vc-text-primary';
export const TILE_SKELETON =
  'rounded-xl border border-vc-border bg-white/[0.03] animate-pulse';

/** Fixed-height list row — the AiToolsPanel shape, now shared. */
export const ROW =
  'group flex h-11 w-full items-center gap-2.5 rounded-lg border border-transparent px-2.5 text-left transition-colors hover:border-vc-border hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50';
export const ROW_ACTIVE = 'bg-white/[0.07] border-vc-border-strong';
export const ROW_ICON =
  'shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors';

/**
 * A row's active/icon treatment follows its tone, so an AI surface can keep the violet accent
 * while ordinary panels stay neutral. Literal maps — Tailwind cannot see interpolated names.
 */
export const ROW_ACTIVE_TONE = {
  neutral: 'bg-white/[0.07] border-vc-border-strong',
  ai: 'bg-violet-500/10 border-violet-500/40',
  success: 'bg-emerald-500/10 border-emerald-500/40',
  warning: 'bg-amber-500/10 border-amber-500/40',
} as const;

export const ROW_ICON_TONE = {
  neutral: 'bg-white/[0.05] text-vc-text-secondary',
  ai: 'bg-violet-500/15 text-violet-200',
  success: 'bg-emerald-500/15 text-emerald-200',
  warning: 'bg-amber-500/15 text-amber-200',
} as const;

export const ROW_ICON_IDLE = 'bg-white/[0.04] text-vc-text-muted';
export const ROW_TITLE = 'text-[12.5px] font-medium text-vc-text-primary truncate';
export const ROW_DESCRIPTION = 'block text-[10.5px] text-vc-text-muted truncate leading-tight mt-px';

/* ── Sections ──────────────────────────────────────────────────────────── */

export const SECTION_LABEL =
  'text-[10px] font-semibold uppercase tracking-[0.08em] text-vc-text-muted';
export const SECTION_TRIGGER =
  'w-full flex items-center gap-2 py-1.5 text-left transition-colors hover:text-vc-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-lg';
/** Right-aligned value chip shown when a section is collapsed, so nothing hides silently. */
export const SECTION_SUMMARY = 'ml-auto text-[10.5px] text-vc-text-muted truncate max-w-[45%]';

/* ── Fields ────────────────────────────────────────────────────────────── */

export const FIELD = 'space-y-1.5';
export const FIELD_HEADER = 'flex items-center justify-between gap-2 text-[11px]';
export const FIELD_LABEL = 'text-vc-text-secondary';
export const FIELD_VALUE = 'font-mono tabular-nums text-vc-text-primary';
export const FIELD_INPUT =
  'h-9 w-full rounded-lg border border-vc-border bg-vc-canvas/80 px-2.5 text-[12px] text-vc-text-primary transition-colors focus:outline-none focus:border-white/30 focus:ring-2 focus:ring-white/10';

export const SEGMENTED_GROUP = 'flex gap-0.5 rounded-lg bg-vc-canvas/80 p-0.5';
export const SEGMENTED_ITEM =
  'flex-1 flex items-center justify-center gap-1.5 h-7 rounded-lg text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50';
export const SEGMENTED_ITEM_ACTIVE = 'bg-white/[0.12] text-vc-text-primary';
export const SEGMENTED_ITEM_IDLE = 'text-vc-text-muted hover:text-vc-text-primary';

export const SWATCH =
  'w-7 h-7 rounded-lg border border-vc-border transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
export const SWATCH_SELECTED = 'ring-2 ring-white/70';

/* ── Tone (semantic) ───────────────────────────────────────────────────── */

/**
 * Literal lookup — Tailwind's JIT cannot see an interpolated `bg-${tone}-500/12`.
 * Violet is reserved for AI; emerald means success; amber means warning.
 */
export const TONE = {
  neutral: 'bg-white/[0.05] text-vc-text-secondary border-vc-border',
  ai: 'bg-violet-500/12 text-violet-300 border-violet-500/25',
  success: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/25',
  warning: 'bg-amber-500/12 text-amber-300 border-amber-500/25',
} as const;

export type PanelTone = keyof typeof TONE;

export const BADGE =
  'text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-lg border shrink-0';

/* ── States ────────────────────────────────────────────────────────────── */

export const STATE_WRAP =
  'flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-vc-border px-4 py-8 gap-2';
export const STATE_ICON =
  'w-10 h-10 rounded-xl bg-white/[0.04] border border-vc-border flex items-center justify-center text-vc-text-muted';
export const STATE_TITLE = 'text-[12.5px] font-medium text-vc-text-primary';
export const STATE_HINT = 'text-[11px] text-vc-text-muted leading-snug max-w-[26ch]';

export const ACTION_PRIMARY =
  'h-8 px-3 rounded-lg bg-vc-action text-vc-action-foreground text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60';
export const ACTION_GHOST =
  'h-8 px-3 rounded-lg border border-vc-border text-[12px] font-medium text-vc-text-secondary transition-colors hover:text-vc-text-primary hover:bg-white/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50';

/* ── Scales (documented so reviewers can enforce them) ─────────────────── */

/** Containers use `rounded-xl`; anything inside a card uses `rounded-lg`. Nothing else. */
export const RADIUS_SCALE = ['rounded-lg', 'rounded-xl'] as const;
/** gap-1.5 intra-control · gap-2.5 intra-card · space-y-4 between sections · p-3 card. */
export const SPACING_SCALE = ['gap-1.5', 'gap-2.5', 'space-y-4', 'p-3'] as const;
