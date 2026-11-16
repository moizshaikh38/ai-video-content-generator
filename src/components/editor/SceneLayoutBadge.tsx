import React, { useRef, useState } from 'react';
import type { SceneLayout } from '../../lib/itemLayout';
import { SceneLayoutMenu } from './SceneLayoutMenu';

/** Per-scene layout label on a timeline clip; click to change THIS scene only. */
export const SceneLayoutBadge: React.FC<{ label: string; current: SceneLayout; onPick: (l: SceneLayout) => void }> = ({ label, current, onPick }) => {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <div className="absolute left-2.5 top-1.5 z-30" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <button ref={btn} type="button" onClick={() => setAnchor(anchor ? null : btn.current!.getBoundingClientRect())} title="Change layout for this scene"
        className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-medium text-white shadow hover:bg-black/80">
        {label} ▾
      </button>
      {anchor && <SceneLayoutMenu anchor={anchor} current={current} onPick={onPick} onClose={() => setAnchor(null)} />}
    </div>
  );
};
