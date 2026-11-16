import { createPortal } from 'react-dom';
import React, { useEffect, useRef, useState } from 'react';
import { Crop, X } from 'lucide-react';
import { boxFromCrop, cropFromBox, moveBox, resizeBox, type CropBox, type CropState } from '../../lib/cropBox';

interface Props {
  videoSrc: string | null;
  sourceTime: number;
  srcW: number;
  srcH: number;
  /** Output canvas aspect (width / height). */
  canvasAspect: number;
  current: CropState;
  /** False when the scene is Fit/Blur/Split: crop box only applies to Fill. */
  enabled: boolean;
  /** Toolbar label (default 'Crop'); used per panel in multi-panel scenes. */
  label?: string;
  disabledReason?: string;
  notice?: string;
  onApply: (crop: CropState) => void;
  /** Render directly inside the editor canvas, rather than a modal. */
  inlineTarget?: HTMLElement | null;
  onOpen?: () => void;
}

/** Preview-top "Crop": drag the box to move it, drag a corner to resize (zoom). Aspect is locked to the canvas. */
export const CropBoxControl: React.FC<Props> = ({ label, videoSrc, sourceTime, srcW, srcH, canvasAspect, current, enabled, onApply, inlineTarget, onOpen, disabledReason, notice }) => {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<CropBox>(() => boxFromCrop(srcW || 16, srcH || 9, canvasAspect, current));
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<null | { kind: 'move'; last: { x: number; y: number } } | { kind: 'corner'; anchor: { x: number; y: number } }>(null);
  useEffect(() => { if (!open) return; const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false); document.addEventListener('keydown', esc); return () => document.removeEventListener('keydown', esc); }, [open]);
  useEffect(() => { if (!enabled) setOpen(false); }, [enabled]);
  const sw = srcW || 16, sh = srcH || 9;
  const pt = (e: React.PointerEvent) => { const r = stage.current!.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const corners: Array<{ id: string; x: number; y: number; ax: number; ay: number }> = [
    { id: 'tl', x: 0, y: 0, ax: 1, ay: 1 }, { id: 'tr', x: 1, y: 0, ax: 0, ay: 1 },
    { id: 'bl', x: 0, y: 1, ax: 1, ay: 0 }, { id: 'br', x: 1, y: 1, ax: 0, ay: 0 },
  ];
  return (
    <div>
      <button type="button" disabled={!enabled} onClick={(e) => { e.stopPropagation(); onOpen?.(); setBox(boxFromCrop(sw, sh, canvasAspect, current)); setOpen(true); }}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition font-medium disabled:opacity-40"
        title={enabled ? 'Crop: drag the box, resize from a corner' : (disabledReason || 'Crop applies to Fill scenes. Set this scene to Fill first.')}>
        <Crop className="w-3.5 h-3.5" /><span>{label ?? 'Crop'}</span>
      </button>
      {open && createPortal(
        <div onPointerDown={e => e.stopPropagation()} data-testid={inlineTarget ? "inline-preview-crop" : "crop-dialog"} className={inlineTarget ? "absolute inset-0 z-[80] bg-black flex items-center justify-center" : "fixed inset-0 z-[100] bg-black/60 flex items-center justify-center"} onClick={() => setOpen(false)}>
          <div className={inlineTarget ? "bg-black p-3 w-full max-w-full text-neutral-200" : "bg-vc-surface1 border border-white/10 rounded-2xl p-5 w-[560px] max-w-[92vw] text-neutral-200"} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1"><h3 className="text-sm font-semibold text-white">{label ?? 'Crop'}</h3><button onPointerUp={e => {if(e.pointerType==='touch'){e.preventDefault();setOpen(false);}}} onClick={() => setOpen(false)} aria-label="Close"><X className="w-4 h-4" /></button></div>
            <p className="text-[11px] text-neutral-400 mb-3">Drag the box to move it. Drag a corner to resize (zoom 1x-4x). The box keeps the canvas shape.</p>
            {notice && <p className="text-[11px] text-amber-300 mb-2">{notice}</p>}
            <div ref={stage} data-testid="crop-stage" className="relative bg-black rounded-lg overflow-hidden select-none touch-none" style={{ aspectRatio: `${sw}/${sh}`, maxHeight: '58vh', maxWidth: '100%', margin: '0 auto' }}
              onPointerMove={(e) => {
                const d = drag.current; if (!d) return; const p = pt(e);
                if (d.kind === 'move') { setBox((b) => moveBox(b, p.x - d.last.x, p.y - d.last.y)); d.last = p; }
                else setBox(resizeBox(sw, sh, canvasAspect, d.anchor, p));
              }}
              onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
              {videoSrc && <video src={videoSrc} muted playsInline preload="auto" className="absolute inset-0 w-full h-full pointer-events-none" onLoadedMetadata={(e) => { e.currentTarget.currentTime = sourceTime; }} />}
              <div data-testid="crop-box" className="absolute border-2 border-white cursor-move shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                style={{ left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
                onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); drag.current = { kind: 'move', last: pt(e) }; }}>
                {corners.map((c) => (
                  <div key={c.id} data-testid={`crop-corner-${c.id}`} role="button" aria-label={`Resize crop ${c.id}`} className="absolute w-3.5 h-3.5 bg-white rounded-full border border-black/40"
                    style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%`, transform: 'translate(-50%,-50%)', cursor: c.id === 'tl' || c.id === 'br' ? 'nwse-resize' : 'nesw-resize' }}
                    onPointerDown={(e) => { e.stopPropagation(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                      drag.current = { kind: 'corner', anchor: { x: box.left + box.w * c.ax, y: box.top + box.h * c.ay } }; }} />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 text-[11px]">
              <span className="text-neutral-400">Zoom {(cropFromBox(sw, sh, canvasAspect, box).scale).toFixed(2)}x</span>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15" onPointerUp={e => {if(e.pointerType==='touch'){e.preventDefault();setBox(boxFromCrop(sw, sh, canvasAspect, {focusX:.5,focusY:.5,scale:1}));}}} onClick={() => setBox(boxFromCrop(sw, sh, canvasAspect, { focusX: 0.5, focusY: 0.5, scale: 1 }))}>Reset</button>
                <button className="px-3 py-1.5 rounded-lg bg-white text-black font-medium" onPointerUp={e => { if(e.pointerType==='touch'){e.preventDefault();e.stopPropagation();onApply(cropFromBox(sw, sh, canvasAspect, box));setOpen(false);} }} onClick={() => { onApply(cropFromBox(sw, sh, canvasAspect, box)); setOpen(false); }}>Apply</button>
              </div>
            </div>
          </div>
        </div>,
        inlineTarget || document.body
      )}
    </div>
  );
};
