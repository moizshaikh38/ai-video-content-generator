import React, { useEffect, useRef } from 'react';
import { normalizePanels, PANEL_RECTS, type ItemPanels } from '../../../server/src/shared/panelLayouts';

interface Props {
  src: string;
  panels: ItemPanels;
  /** Canvas size in preview px. */
  canvasW: number;
  canvasH: number;
  /** Source video pixel size (needed for exact cover/focus/zoom math). */
  srcW: number;
  srcH: number;
  time: number;
  playing: boolean;
  filter?: string;
}

/**
 * Preview of a multi-panel scene. Each panel is a clipped <video> placed with the same math the export
 * uses (cover window of the panel aspect, divided by zoom, offset by focus*(source-window)), so the
 * preview and buildPanelsFilter show the same crop. Pixel rects tile the canvas without gaps.
 */
export const PanelsPreview: React.FC<Props> = ({ src, panels, canvasW, canvasH, srcW, srcH, time, playing, filter }) => {
  const cfg = normalizePanels(panels)!;
  const rects = PANEL_RECTS[cfg.layout];
  const refs = useRef<Array<HTMLVideoElement | null>>([]);
  useEffect(() => {
    refs.current.forEach((v) => {
      if (!v) return;
      if (Math.abs(v.currentTime - time) > 0.3) v.currentTime = time;
    });
  }, [time]);
  useEffect(() => {
    refs.current.forEach((v) => {
      if (!v) return;
      if (playing && v.paused) v.play().catch(() => {});
      else if (!playing && !v.paused) v.pause();
    });
  }, [playing]);
  return (
    <div data-testid="panels-preview" className="absolute inset-0 pointer-events-none" style={{ width: canvasW, height: canvasH }}>
      {rects.map((r, i) => {
        const left = Math.round(r.x * canvasW), top = Math.round(r.y * canvasH);
        const right = r.x + r.w >= 0.999 ? canvasW : Math.round((r.x + r.w) * canvasW);
        const bottom = r.y + r.h >= 0.999 ? canvasH : Math.round((r.y + r.h) * canvasH);
        const pw = right - left, ph = bottom - top;
        const s = cfg.slots[i];
        const k = Math.max(pw / srcW, ph / srcH) * s.scale;
        const w = srcW * k, h = srcH * k;
        return (
          <div key={i} data-testid={`panel-${i}`} className="absolute overflow-hidden bg-black" style={{ left, top, width: pw, height: ph }}>
            <video
              ref={(el) => { refs.current[i] = el; }}
              src={src}
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => { e.currentTarget.currentTime = time; }}
              style={{ position: 'absolute', maxWidth: 'none', width: w, height: h, left: -(w - pw) * s.focusX, top: -(h - ph) * s.focusY, filter }}
            />
          </div>
        );
      })}
    </div>
  );
};
