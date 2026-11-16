import React, { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import type { EditorProject } from '../../types';

const COLORS = ['#000000', '#090B10', '#0A0F1D', '#171922', '#FFFFFF', '#E11D48', '#2563EB', '#16A34A', '#F59E0B', '#7C3AED'];

interface Props {
  project: EditorProject;
  /** 'blur' | 'fit' (solid colour) | 'fill' (no backdrop) of the base video. */
  cropMode: 'fill' | 'fit' | 'blur';
  onSetCropMode: (mode: 'center' | 'fit' | 'blur') => void;
  onUpdateCanvas: (patch: Partial<EditorProject['canvas']>) => void;
}

/** Preview-top "Background" control: Blur / Color + spacing + corner radius. Every value is read by the export compiler. */
export const BackgroundControl: React.FC<Props> = ({ project, cropMode, onSetCropMode, onUpdateCanvas }) => {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  const c = project.canvas;
  const spacing = c.background_spacing ?? 0;
  const radius = c.background_corner_radius ?? 0;
  const color = (c.background_color || '#000000').toUpperCase();
  const active = cropMode === 'blur' ? 'blur' : cropMode === 'fit' ? 'color' : 'none';
  const tab = (id: 'blur' | 'color', label: string) => (
    <button
      type="button"
      onClick={() => {
        if (id === 'blur') onSetCropMode('blur');
        else { onUpdateCanvas({ background_mode: 'color' }); onSetCropMode('fit'); }
      }}
      className={`px-3 py-1 rounded-lg text-[11px] font-medium transition ${active === id ? 'bg-white/[0.16] text-white' : 'text-neutral-400 hover:text-white hover:bg-white/[0.08]'}`}
    >
      {label}
    </button>
  );
  const slider = (label: string, value: number, max: number, unit: string, key: 'background_spacing' | 'background_corner_radius') => (
    <label className="flex items-center gap-3 text-[11px] text-neutral-300">
      <span className="w-20">{label}</span>
      <input type="range" min={0} max={max} step={1} value={value} disabled={active === 'none'}
        onChange={(e) => onUpdateCanvas({ [key]: Number(e.target.value) } as any)} className="flex-1" />
      <span className="w-10 text-right font-mono">{value}{unit}</span>
    </label>
  );
  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition font-medium"
        title="Background: blur or colour behind the video, spacing, corner radius"
      >
        <ImageIcon className="w-3.5 h-3.5" />
        <span>Background</span>
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-72 glass-float rounded-xl p-3 space-y-3 z-40">
          <div className="flex items-center gap-1">{tab('blur', 'Blur')}{tab('color', 'Color')}</div>
          {active === 'none' && <p className="text-[10px] text-neutral-500">Layout is Fill, so no backdrop shows. Pick Blur or Color to fit the full frame over a backdrop.</p>}
          {active === 'color' && (
            <div className="flex flex-wrap items-center gap-1.5">
              {COLORS.map((col) => (
                <button key={col} type="button" aria-label={col} onClick={() => onUpdateCanvas({ background_color: col, background_mode: 'color' })}
                  style={{ backgroundColor: col }} className={`w-5 h-5 rounded-full border ${color === col ? 'border-white ring-1 ring-white' : 'border-white/20'}`} />
              ))}
              <input type="color" value={color.length === 7 ? color : '#000000'} onChange={(e) => onUpdateCanvas({ background_color: e.target.value.toUpperCase(), background_mode: 'color' })}
                className="w-6 h-6 bg-transparent border-0 p-0" aria-label="Custom colour" />
            </div>
          )}
          {slider('Spacing', spacing, 20, '%', 'background_spacing')}
          {slider('Corner radius', radius, 120, 'px', 'background_corner_radius')}
        </div>
      )}
    </div>
  );
};
