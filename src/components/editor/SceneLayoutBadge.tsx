import React, { useState } from 'react';
import type { SceneLayout } from '../../lib/itemLayout';

const OPTIONS: Array<{ id: SceneLayout; label: string }> = [
  { id: 'fill', label: 'Fill' },
  { id: 'fit', label: 'Fit' },
  { id: 'blur', label: 'Blur' },
  { id: 'split', label: 'Split' },
  { id: 'three', label: 'Three' },
  { id: 'four', label: 'Four' },
  { id: 'screenshare', label: 'ScreenShare' },
  { id: 'gameplay', label: 'Gameplay' },
];

/** Per-scene layout label on a timeline clip; click to change THIS scene only. */
export const SceneLayoutBadge: React.FC<{ label: string; current: SceneLayout; onPick: (l: SceneLayout) => void }> = ({ label, current, onPick }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute left-2.5 top-1.5 z-30" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => setOpen((v) => !v)} title="Change layout for this scene"
        className="px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-medium text-white shadow hover:bg-black/80">
        {label} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 flex flex-col rounded-lg bg-vc-surface2 border border-white/15 shadow-xl overflow-hidden min-w-[72px]">
          {OPTIONS.map((o) => (
            <button key={o.id} type="button" onClick={() => { setOpen(false); onPick(o.id); }}
              className={`px-3 py-1 text-left text-[11px] hover:bg-white/10 ${current === o.id ? 'text-white font-semibold' : 'text-neutral-300'}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
