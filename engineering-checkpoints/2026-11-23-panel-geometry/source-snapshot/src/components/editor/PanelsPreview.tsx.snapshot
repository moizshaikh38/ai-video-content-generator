import {numericPanelLayers} from '../../../server/src/shared/numericPanelGeometry.js';
import React, { useEffect, useRef } from 'react';
import { materializePanels, normalizePanels, panelSourceWindow, panelPixelRects,  type ItemPanels } from '../../../server/src/shared/panelLayouts';

interface Props {
  outputSize?:{width:number;height:number};
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
 * preview and buildPanelsFilter show the same crop. Contain keeps the chosen region whole and clips
 * neighboring source content before centering it with black bars. Pixel rects tile the canvas.
 */
export const PanelsPreview: React.FC<Props> = ({ outputSize, src, panels, canvasW, canvasH, srcW, srcH, time, playing, filter }) => {
  const cfg = normalizePanels(panels)!;
  const rects = panelPixelRects(cfg.layout,canvasW,canvasH,cfg.topFraction);
  const numeric=outputSize?materializePanels(cfg,srcW,srcH,outputSize.width,outputSize.height):undefined;
  const layers=numeric?numericPanelLayers(numeric,canvasW,canvasH):undefined;
  const refs = useRef<Array<HTMLVideoElement | null>>([]);
  useEffect(() => {
    refs.current.forEach((v) => {
      if (!v) return;
      if (Math.abs(v.currentTime - time) > (playing ? 0.3 : 0.001)) v.currentTime = time;
    });
  }, [time, playing]);
  useEffect(() => {
    refs.current.forEach((v) => {
      if (!v) return;
      if (playing && v.paused) v.play().catch(() => {});
      else if (!playing && !v.paused) v.pause();
    });
  }, [playing,src,cfg.layout,cfg.slots.length,cfg.slots.some((slot:ItemPanels['slots'][number])=>slot.backdrop==='blur')]);
  if(outputSize&&!layers)return <div data-testid="panel-geometry-review-required" role="status">Panel geometry needs source review</div>;
  return (
    <div data-testid="panels-preview" className="absolute inset-0 pointer-events-none" style={{ width: canvasW, height: canvasH }}>
      {rects.map((r, i) => {
        const physical=layers?.[i];
        const left=physical?.target.left??r.x,top=physical?.target.top??r.y,pw=physical?.target.width??r.w,ph=physical?.target.height??r.h;
        const s = cfg.slots[i];
        const sourceWindow = numeric?.panels[i].view??panelSourceWindow(s, srcW, srcH, pw / ph);
        const k = s.fit === 'contain' ? Math.min(pw / sourceWindow.w, ph / sourceWindow.h) : pw / sourceWindow.w;
        const ox = (pw - sourceWindow.w * k) / 2, oy = (ph - sourceWindow.h * k) / 2;
        const w = srcW * k, h = srcH * k;
        return (
          <div key={i} data-testid={`panel-${i}`} className="absolute overflow-hidden bg-black" style={{ left, top, width: pw, height: ph }}>
            {s.fit==='contain' && s.backdrop==='blur' && (()=>{
              const bk=Math.max(pw/sourceWindow.w,ph/sourceWindow.h);
              return <video ref={el=>{refs.current[cfg.slots.length+i]=el;}} src={src} muted playsInline preload="auto"
                onLoadedMetadata={e=>{e.currentTarget.currentTime=time;}}
                style={{position:'absolute',maxWidth:'none',width:srcW*bk,height:srcH*bk,
                  left:(pw-sourceWindow.w*bk)/2-sourceWindow.x*bk,top:(ph-sourceWindow.h*bk)/2-sourceWindow.y*bk,
                  ...(physical?.backdrop?{left:physical.backdrop.left,top:physical.backdrop.top,width:physical.backdrop.width,height:physical.backdrop.height,clipPath:physical.backdrop.clipPath}:{}),
                  filter:[filter,`blur(${physical?.backdrop?.blurRadius??Math.max(1,Math.round(canvasW/540*16))}px)`,'brightness(0.85)'].filter(Boolean).join(' ')}}/>;
            })()}
            <video
              ref={(el) => { refs.current[i] = el; }}
              src={src}
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => { e.currentTarget.currentTime = time; }}
              style={{ position: 'absolute', maxWidth: 'none', width: w, height: h, left: ox-sourceWindow.x * k, top: oy-sourceWindow.y * k,
                ...(physical?.foreground??{}),
                clipPath: physical?.foreground.clipPath??(s.fit === 'contain' ? `inset(${sourceWindow.y/srcH*100}% ${(srcW-sourceWindow.x-sourceWindow.w)/srcW*100}% ${(srcH-sourceWindow.y-sourceWindow.h)/srcH*100}% ${sourceWindow.x/srcW*100}%)` : undefined), filter }}
            />
            {!s.set && (
              <span data-testid={`panel-unset-${i}`} className="absolute left-1 top-1 px-1.5 py-0.5 rounded bg-black/60 text-[9px] text-white/80">Unassigned view</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
