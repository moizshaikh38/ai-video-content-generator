import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SceneLayout } from '../../lib/itemLayout';

export const SCENE_LAYOUT_OPTIONS: Array<{ id: SceneLayout; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'fill', label: 'Fill' },
  { id: 'fit', label: 'Fit' },
  { id: 'blur', label: 'Blur' },
  { id: 'split', label: 'Split' },
  { id: 'three', label: 'Three' },
  { id: 'four', label: 'Four' },
  { id: 'screenshare', label: 'ScreenShare' },
  { id: 'gameplay', label: 'Gameplay' },
  {id:'watch_party',label:'Watch Party'},
  {id:'streaming',label:'Streaming'},
  { id: 'game_screen_first', label: 'Game screen first' },
];

/** Tiny 9:16 schematic of each layout (geometry mirrors the measured reference). */
const Thumb: React.FC<{ id: SceneLayout | 'pip' }> = ({ id }) => {
  const W = 20, H = 36;
  const r = (x: number, y: number, w: number, h: number, k: number, o = 0.55) => (
    <rect key={k} x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={1} fill="currentColor" opacity={o} />
  );
  let body: React.ReactNode;
  switch (id) {
    case 'auto': body = [r(0,0,W,H/2,0,.7),r(0,H/2,W/2,H/2,1,.5),r(W/2,H/2,W/2,H/2,2,.9)];break;
    case 'fit': body = [r(0, 0, W, H, 0, 0.12), r(0, 9, W, 18, 1)]; break;
    case 'blur': body = [r(0, 0, W, H, 0, 0.3), r(0, 9, W, 18, 1, 0.85)]; break;
    case 'split': case 'screenshare': body = [r(0, 0, W, H / 2, 0), r(0, H / 2, W, H / 2, 1, 0.8)]; break;
    case 'three': body = [r(0, 0, W, H / 2, 0), r(0, H / 2, W / 2, H / 2, 1, 0.8), r(W / 2, H / 2, W / 2, H / 2, 2, 0.65)]; break;
    case 'four': body = [r(0, 0, W / 2, H / 2, 0), r(W / 2, 0, W / 2, H / 2, 1, 0.8), r(0, H / 2, W / 2, H / 2, 2, 0.8), r(W / 2, H / 2, W / 2, H / 2, 3)]; break;
    case 'game_screen_first': body = [r(0,0,W,H*.6,0),r(0,H*.6,W,H*.4,1,.8)]; break;
    case 'watch_party': case 'streaming': case 'gameplay': body = [r(0, 0, W, H * 0.3, 0, 0.8), r(0, H * 0.3, W, H * 0.7, 1)]; break;
    case 'pip': body = [r(0, 0, W, H, 0, 0.4), r(11, 24, 8, 10, 1, 0.9)]; break;
    default: body = r(0, 0, W, H, 0);
  }
  return <svg width={20} height={36} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="text-white">{body}</svg>;
};

interface MenuProps {
  autoAvailable?:boolean;
  scopeTitle?:string;
  onPickWholeClip?:(l:SceneLayout)=>void;
  anchor: DOMRect | null;
  current: SceneLayout | 'context_window';
  onPick: (l: SceneLayout) => void;
  onClose: () => void;
}

/** Popover rendered in document.body so no timeline/overflow container can clip it; clamped to the viewport. */
export const SceneLayoutMenu: React.FC<MenuProps> = ({ anchor, current, onPick, onClose, autoAvailable=false, scopeTitle, onPickWholeClip }) => {
  const [wholeClip,setWholeClip]=useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = Math.min(Math.max(8, anchor.left), vw - w - 8);
    let top = anchor.bottom + 6;
    if (top + h > vh - 8) top = anchor.top - h - 6 >= 8 ? anchor.top - h - 6 : Math.max(8, vh - h - 8);
    setPos({ left, top });
  }, [anchor]);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down, true); document.removeEventListener('keydown', key); };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Video item layout"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden', maxHeight: 'calc(100dvh - 16px)' }}
      className="fixed z-[100] w-[248px] overflow-y-auto rounded-xl bg-vc-surface2 border border-white/15 shadow-2xl p-2 select-none"
    >
      <div className="px-1 pb-1.5 text-[10px] uppercase tracking-wider text-neutral-400">{wholeClip ? 'Layout for whole clip' : scopeTitle || 'Layout for this video item'}</div>
      {onPickWholeClip && <div className="flex gap-1 pb-2"><button type="button" data-testid="layout-scope-scene" aria-pressed={!wholeClip} className="px-2 py-1 rounded bg-white/10 text-xs text-white" onClick={()=>setWholeClip(false)}>This scene</button><button type="button" data-testid="layout-scope-whole" aria-pressed={wholeClip} className="px-2 py-1 rounded bg-white/10 text-xs text-white" onClick={()=>setWholeClip(true)}>Whole clip</button></div>}
      <div className="grid grid-cols-3 gap-1.5">
        {SCENE_LAYOUT_OPTIONS.filter(o=>o.id!=='auto'||autoAvailable).map((o) => (
          <button key={o.id} type="button" role="menuitemradio" aria-checked={current === o.id}
            title={o.id==='auto' ? 'Choose Fit, Fill or eligible two-person Split from existing scene analysis. Other layouts below are manual.' : undefined}
            onClick={() => { if(wholeClip&&onPickWholeClip)onPickWholeClip(o.id);else onPick(o.id); onClose(); }}
            className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[11px] transition ${current === o.id ? 'border-violet-400 bg-violet-500/20 text-white font-semibold' : 'border-white/10 text-neutral-300 hover:bg-white/10'}`}>
            <Thumb id={o.id} />
            <span className="leading-tight text-center">{o.label}</span>
          </button>
        ))}
        <button type="button" disabled title="Picture in picture is not available yet" aria-disabled="true"
          className="flex flex-col items-center gap-1 rounded-lg border border-white/5 px-1 py-1.5 text-[11px] text-neutral-500 opacity-50 cursor-not-allowed">
          <Thumb id="pip" />
          <span className="leading-tight text-center">Picture in picture</span>
        </button>
      </div>
      <div className="px-1 pt-1.5 text-[10px] text-neutral-500">{autoAvailable ? 'Auto: Fit, Fill or eligible Split. Other choices are manual. ' : ''}Picture in picture is not available yet.</div>
    </div>,
    document.body
  );
};

/** Inline (non-popover) grid for use inside a side panel. */
export const SceneLayoutGrid: React.FC<{ current: SceneLayout | 'context_window'; onPick: (l: SceneLayout) => void; disabled?: boolean }> = ({ current, onPick, disabled }) => (
  <div className="grid grid-cols-4 gap-1.5 max-md:flex short:flex max-md:overflow-x-auto short:overflow-x-auto max-md:pb-1 short:pb-1">
    {SCENE_LAYOUT_OPTIONS.filter(o=>o.id!=='auto').map((o) => (
      <button key={o.id} type="button" disabled={disabled} aria-pressed={current === o.id} onClick={() => onPick(o.id)}
        className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] transition max-md:shrink-0 short:shrink-0 max-md:w-[68px] short:w-[68px] disabled:opacity-40 ${current === o.id ? 'border-violet-400 bg-violet-500/20 text-white font-semibold' : 'border-white/10 text-neutral-300 hover:bg-white/10'}`}>
        <Thumb id={o.id} />
        <span className="leading-tight text-center">{o.label}</span>
      </button>
    ))}
    <button type="button" disabled title="Picture in picture is not available yet"
      className="flex flex-col items-center gap-1 rounded-lg border border-white/5 px-1 py-1.5 text-[10px] text-neutral-500 opacity-50 cursor-not-allowed max-md:shrink-0 short:shrink-0 max-md:w-[68px] short:w-[68px]">
      <Thumb id="pip" />
      <span className="leading-tight text-center">PiP (soon)</span>
    </button>
  </div>
);
