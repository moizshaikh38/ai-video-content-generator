import React, { useEffect, useRef, useState } from 'react';
import { ScanFace, X } from 'lucide-react';
import type { EditorProject, EditorSubjectTracker } from '../../types';
import { clipRenderService } from '../../services/clipRenderService';

interface Props {
  clipId: string;
  project: EditorProject;
  videoSrc: string | null;
  /** Source-file seconds of the frame currently shown in the preview. */
  sourceTime: number;
  /** Timeline item at the playhead. */
  activeItemId: string | null;
  onSetTracker: (target: { itemId: string | null }, tracker: EditorSubjectTracker | null) => void;
}

type Box = { x: number; y: number; w: number; h: number };

export const TrackerControl: React.FC<Props> = ({ clipId, project, videoSrc, sourceTime, activeItemId, onSetTracker }) => {
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [scope, setScope] = useState<'scene' | 'clip'>('scene');
  const [box, setBox] = useState<Box | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    const outside = (e: Event) => { if (!rootRef.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc); };
  }, [menu]);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const videoItems = project.tracks.filter((t) => t.type === 'VIDEO').flatMap((t) => t.items);
  const active = videoItems.find((i) => i.id === activeItemId) || videoItems[0];
  const anyOn = videoItems.some((i) => i.tracker?.enabled);
  const activeOn = Boolean(active?.tracker?.enabled);

  const norm = (e: React.PointerEvent) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const apply = async () => {
    if (!box || !active) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const startSec = scope === 'scene' ? active.source_start : Math.min(...videoItems.map((i) => i.source_start));
      const endSec = scope === 'scene' ? active.source_end : Math.max(...videoItems.map((i) => i.source_end));
      const res = await clipRenderService.trackClipSubject(clipId, { refTime: sourceTime, box, startSec, endSec });
      const tracker: EditorSubjectTracker = {
        enabled: true, scope, ref_time: sourceTime, box,
        source_width: res.source_width, source_height: res.source_height,
        keyframes: res.keyframes.map((k) => ({ time: k.time, centerX: k.centerX, centerY: k.centerY })),
      };
      onSetTracker({ itemId: scope === 'scene' ? active.id : null }, tracker);
      setNote(`Tracked ${res.tracked_from.toFixed(1)}s to ${res.tracked_to.toFixed(1)}s${res.lost_after != null || res.lost_before != null ? ' (stopped at a scene change or when the subject was lost)' : ''}.`);
      setDialog(false); setBox(null);
    } catch (e: any) {
      setError(e?.message || 'Tracking failed.');
    } finally { setBusy(false); }
  };

  return (
    <div ref={rootRef} className="relative max-md:static">
      <button type="button" onClick={(e) => { e.stopPropagation(); setMenu((v) => !v); }}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg hover:bg-white/[0.08] text-neutral-300 hover:text-white transition font-medium"
        title="Tracker: follow a subject you pick">
        <ScanFace className="w-3.5 h-3.5" />
        <span>Tracker: {activeOn ? 'ON' : 'OFF'}</span>
      </button>
      {menu && (
        <div onClick={(e) => e.stopPropagation()} className="absolute top-full mt-2 right-0 max-md:right-auto max-md:left-1/2 max-md:-translate-x-1/2 w-64 max-md:max-w-full glass-float rounded-xl p-1 z-40 text-[11px]">
          <button className="block w-full whitespace-normal text-left px-3 py-2 rounded-lg hover:bg-white/10 text-white" onClick={() => { setMenu(false); setDialog(true); setBox(null); setError(null); }}>Manual subject tracking</button>
          <button disabled={!activeOn} className="block w-full whitespace-normal text-left px-3 py-2 rounded-lg hover:bg-white/10 text-neutral-300 disabled:opacity-40" onClick={() => { setMenu(false); onSetTracker({ itemId: active?.id ?? null }, null); }}>Turn off tracking for this scene</button>
          <button disabled={!anyOn} className="block w-full whitespace-normal text-left px-3 py-2 rounded-lg hover:bg-white/10 text-neutral-300 disabled:opacity-40" onClick={() => { setMenu(false); onSetTracker({ itemId: null }, null); }}>Turn off all tracking</button>
          {note && <p className="px-3 py-1 text-[10px] text-neutral-500">{note}</p>}
        </div>
      )}
      {dialog && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center" onClick={() => setDialog(false)}>
          <div className="bg-vc-surface1 border border-white/10 rounded-2xl p-5 w-[560px] max-w-[92vw] text-neutral-200" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold text-white">Manual subject tracking</h3>
              <button onClick={() => setDialog(false)} aria-label="Close"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[11px] text-neutral-400 mb-3">Drag a box around the subject you want to follow. Tracking stops at a scene change or if the subject is lost.</p>
            <div ref={stageRef} className="relative bg-black rounded-lg overflow-hidden select-none touch-none" style={{ cursor: 'crosshair' }}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); const p = norm(e); dragStart.current = p; setBox({ x: p.x, y: p.y, w: 0, h: 0 }); }}
              onPointerMove={(e) => { if (!dragStart.current) return; const p = norm(e); const s = dragStart.current; setBox({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); }}
              onPointerUp={() => { dragStart.current = null; setBox((b) => (b && (b.w < 0.02 || b.h < 0.02) ? null : b)); }}>
              {videoSrc && <video src={videoSrc} muted playsInline preload="auto" className="w-full block pointer-events-none"
                onLoadedMetadata={(e) => { e.currentTarget.currentTime = sourceTime; }} />}
              {box && <div className="absolute border-2 border-white rounded-sm shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] pointer-events-none"
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }} />}
            </div>
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-neutral-400">Track:</span>
                {(['scene', 'clip'] as const).map((s) => (
                  <button key={s} onClick={() => setScope(s)} className={`px-2.5 py-1 rounded-lg ${scope === s ? 'bg-white/15 text-white' : 'text-neutral-400 hover:bg-white/10'}`}>{s === 'scene' ? 'This scene' : 'Whole clip'}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setBox(null); setError(null); }} className="px-3 py-1.5 rounded-lg text-[11px] bg-white/10 hover:bg-white/15">Reset</button>
                <button disabled={!box || busy} onClick={apply} className="px-3 py-1.5 rounded-lg text-[11px] bg-white text-black font-medium disabled:opacity-40">{busy ? 'Tracking...' : 'Apply'}</button>
              </div>
            </div>
            {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
