/**
 * Button class recipes — the single source for every button that is not the shared
 * `<Button>` component (raw `<button>`s in pages, toolbars and editor panels).
 *
 * Recipes carry colour, radius, shadow and interaction only — never height, width,
 * padding or gap — so adopting one never changes a layout. Callers keep their own
 * sizing classes.
 *
 * Shape rule: text CTAs are pills (`rounded-full`); icon / toolbar buttons are
 * `rounded-xl`; items inside a segmented group are `rounded-lg` (inner radius =
 * outer radius − group padding).
 *
 * Depth comes from a 1px inner top highlight, never a gradient.
 *
 * Colour roles: every primary action (Create, Continue, Save, Export, Upgrade, AI tools)
 * is the violet brand pill with a soft violet halo; secondary actions are quiet glass.
 * Pressed states always go darker, never to white.
 */

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black';
const DISABLED = 'disabled:pointer-events-none disabled:opacity-50';
const PRESS = 'transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px';

/** Quiet translucent pill — secondary actions next to a primary. */
export const BTN_PILL_SECONDARY =
  `rounded-full border border-white/10 bg-white/[0.06] text-vc-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-white/[0.10] hover:border-white/[0.14] active:bg-white/[0.04] ${PRESS} ${FOCUS} ${DISABLED}`;

/** Solid violet brand pill — Upgrade, Create, and actions that run an AI tool.
 *  Rest #7C3AED · hover #8B5CF6 · pressed #6D28D9. */
export const BTN_PILL_BRAND =
  `rounded-full border border-white/[0.12] bg-vc-ai-hover text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.4),0_6px_16px_-6px_rgba(124,58,237,0.55)] hover:bg-vc-ai active:bg-violet-700 active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] ${PRESS} ${FOCUS} ${DISABLED}`;
/** Primary and AI actions both use the brand pill. */
export const BTN_PILL_PRIMARY = BTN_PILL_BRAND;
export const BTN_PILL_AI = BTN_PILL_BRAND;

/** Violet-tinted pill — a brand action sitting next to a solid brand pill (e.g. header Upgrade beside Create). */
export const BTN_PILL_BRAND_SOFT =
  `rounded-full border border-violet-500/35 bg-violet-500/[0.14] text-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-violet-500/[0.22] hover:border-violet-400/50 active:bg-violet-500/[0.10] ${PRESS} ${FOCUS} ${DISABLED}`;

/** Solid red pill — irreversible actions. */
export const BTN_PILL_DESTRUCTIVE =
  `rounded-full border border-white/10 bg-red-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(0,0,0,0.4)] hover:bg-red-500 active:bg-red-700 ${PRESS} ${FOCUS} ${DISABLED}`;

/** Text-only pill — tertiary actions and "Cancel". */
export const BTN_PILL_GHOST =
  `rounded-full text-vc-text-secondary hover:text-vc-text-primary hover:bg-white/[0.06] ${PRESS} ${FOCUS} ${DISABLED}`;

/** Icon / toolbar button. Pair with BTN_TOOL_ACTIVE when toggled on. */
export const BTN_TOOL =
  `rounded-xl text-vc-text-secondary hover:text-vc-text-primary hover:bg-white/[0.06] ${PRESS} ${FOCUS} ${DISABLED}`;
export const BTN_TOOL_ACTIVE =
  'bg-white/[0.10] text-vc-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]';

/** Segmented control: a recessed rounded-xl well holding rounded-lg items. */
export const BTN_SEGMENT_GROUP = 'rounded-xl border border-white/[0.06] bg-black/40';
export const BTN_SEGMENT_ITEM = `rounded-lg ${PRESS} ${FOCUS}`;
export const BTN_SEGMENT_ITEM_ACTIVE =
  'bg-white/[0.10] text-vc-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]';
export const BTN_SEGMENT_ITEM_IDLE = 'text-vc-text-muted hover:text-vc-text-primary';
