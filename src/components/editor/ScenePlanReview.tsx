import React, { useState } from 'react';
import { applyPlanSceneToProject, validateFramingWindow, type ApplyContext, type PlanShot } from '../../../server/src/shared/framingWindow';
import type { EditorProject } from '../../types';

const KIND_LABEL: Record<string, string> = {
  solo: 'Closer view around the subject',
  group: 'Wider view around the group',
  fit: 'Wide view, same frame size',
};
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export interface ScenePlanReviewProps {
  project: EditorProject;
  shots: PlanShot[] | null | undefined;
  ctx: Omit<ApplyContext, 'replaceConflicts' | 'nowIso'> | null;
  /** True only when the preview draws the same window as the export. Otherwise Apply is disabled. */
  previewReady: boolean;
  onApply: (index: number, replaceConflicts: boolean) => { ok: boolean; reasons?: string[] };
}

/** Review the stored per-scene plan and apply ONE scene explicitly. Never applies on load or in bulk. */
export const ScenePlanReview: React.FC<ScenePlanReviewProps> = ({ project, shots, ctx, previewReady, onApply }) => {
  const [confirm, setConfirm] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (!shots || shots.length === 0 || !ctx) return null;
  const items = project.tracks.filter((t) => t.type === 'VIDEO').flatMap((t) => t.items);
  return (
    <div className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-3 space-y-2" data-testid="scene-plan">
      <div className="font-medium text-white">Scene plan (stored analysis)</div>
      <p className="text-[10px] text-neutral-400">
        Each scene can take a framing window from the analysis. Automatic scene sizes may differ. Nothing is applied unless you press Apply on a scene.
        It does not check what is on screen.
      </p>
      {!previewReady && (
        <p className="text-[10px] text-amber-200/80" data-testid="scene-plan-preview-note">Apply is off until the preview can show the same framing window.</p>
      )}
      {shots.map((shot, idx) => {
        const dry = applyPlanSceneToProject(project, shot, { ...ctx, replaceConflicts: false });
        const sStart = ctx.clipStartSec + shot.start, sEnd = ctx.clipStartSec + shot.end;
        const applied = items.some((i) => i.framing_window && validateFramingWindow(i.framing_window,{item:i as any,canvasAspect:project.canvas.aspect_ratio}).ok && i.source_start <= sStart + 0.05 && i.source_end >= sEnd - 0.05);
        const needs = !dry.ok ? dry.needsReplaceConfirm : undefined;
        const reason = !dry.ok ? dry.reasons[0] : null;
        return (
          <div key={idx} className="rounded-md bg-white/[0.04] p-2 space-y-1" data-testid="scene-plan-row">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-white">{mmss(shot.start)}-{mmss(shot.end)} - {shot.split ? 'Automatic two-person Split' : KIND_LABEL[shot.kind] || shot.kind}</span>
              {applied ? (
                <span className="text-[10px] text-violet-200">Window set</span>
              ) : needs ? (
                <button type="button" disabled={!previewReady} onClick={() => setConfirm(idx)} className="px-2 py-1 rounded-md text-[10px] border border-white/15 text-neutral-200 disabled:opacity-40">Replace this scene framing...</button>
              ) : (
                <button type="button" disabled={!previewReady || !dry.ok} onClick={() => { const r = onApply(idx, false); setNotice(r.ok ? null : (r.reasons || ['Could not apply.'])[0]); }} className="px-2 py-1 rounded-md text-[10px] bg-violet-500/20 border border-violet-400/30 text-violet-100 disabled:opacity-40">Apply to this scene</button>
              )}
            </div>
            {shot.contextStatus && <p className="text-[10px] text-amber-200/80">{shot.contextStatus.replace(/-/g, ' ')}</p>}
            {shot.uncertainty && <p className="text-[10px] text-amber-200/80">Not verified: {shot.uncertainty}</p>}
            {!applied && !dry.ok && !needs && reason && <p className="text-[10px] text-neutral-400" data-testid="scene-plan-reason">{reason}</p>}
            {confirm === idx && needs && (
              <div className="text-[10px] text-neutral-200 space-y-1" data-testid="scene-plan-confirm">
                <p>This scene currently has {needs.join(', ')}. Replacing it clears that setting for this scene only. Other scenes and tracks stay as they are.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { const r = onApply(idx, true); setConfirm(null); setNotice(r.ok ? null : (r.reasons || ['Could not apply.'])[0]); }} className="px-2 py-1 rounded-md bg-violet-500/20 border border-violet-400/30 text-violet-100">Replace</button>
                  <button type="button" onClick={() => setConfirm(null)} className="px-2 py-1 rounded-md border border-white/15">Keep current</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {notice && <p className="text-[10px] text-red-300" data-testid="scene-plan-notice">{notice}</p>}
    </div>
  );
};
