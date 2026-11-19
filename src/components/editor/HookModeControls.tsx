import type {EditorProject} from '../../types';
import {CAPTION_PRESETS, FONT_EM_PER_ASS_SIZE, isRenderablePresetId, resolveCaptionPreset, type RenderableCaptionPresetId} from '../../lib/captionPresets';
import {freshPresetTypography} from '../../../server/src/shared/freshPresetTypography';
import {hookMode, hookModeUnavailable, hookPresetSupported, projectHook, type HookDisplayMode} from '../../../server/src/shared/hookDisplayMode';

interface Props {
  project: EditorProject;
  disabled?: boolean;
  allowedPresetIds: string[] | null;
  onMode: (mode: HookDisplayMode) => void;
  onPreset: (preset: RenderableCaptionPresetId) => void;
}

/** Uses the existing caption catalogue, with unsupported TEXT fonts excluded.
 * This is an editor control, not a claimed preview of the final hook output. */
export function HookModeControls({project, disabled = false, allowedPresetIds, onMode, onPreset}: Props) {
  const p = project as any;
  const mode = hookMode(p);
  const reason = hookModeUnavailable(p);
  const captionId = project.tracks.find(t => t.type === 'CAPTION')?.items.find(i => i.caption)?.caption?.style;
  const current = projectHook(p)?.text?.hook_caption_preset ?? (isRenderablePresetId(captionId) ? captionId : 'simple');
  const supported = (Object.keys(CAPTION_PRESETS) as RenderableCaptionPresetId[]).filter(id => {
    const style = resolveCaptionPreset(id, freshPresetTypography(id), project.canvas.aspect_ratio);
    return hookPresetSupported(style) && Number.isFinite(FONT_EM_PER_ASS_SIZE[style.fontFamily]);
  });
  const planAllows = (id: string) => allowedPresetIds !== null && (allowedPresetIds.includes('*') || allowedPresetIds.includes(id));
  return (
    <section aria-label="Hook display mode" className="p-3 rounded-xl border border-white/10 bg-vc-canvas space-y-2.5">
      <div className="text-sm font-semibold text-white">Hook display</div>
      <div className="grid grid-cols-2 gap-2">
        {([
          ['hook_only', 'Hook only', 'Full clip. Subtitles off.'],
          ['hook_captions', 'Hook + captions', 'Opening hook. Subtitles on.'],
        ] as const).map(([id, label, hint]) => (
          <button key={id} type="button" aria-pressed={mode === id} disabled={disabled || !!reason || allowedPresetIds === null}
            onClick={() => onMode(id)}
            className={`p-2 rounded-lg border text-left disabled:opacity-40 ${mode === id ? 'border-white/50 bg-white/10' : 'border-white/10 hover:border-white/30'}`}>
            <span className="block text-xs font-semibold text-white">{label}</span>
            <span className="block text-[10px] text-neutral-400 mt-1">{hint}</span>
          </button>
        ))}
      </div>
      {reason && <p className="text-[11px] text-amber-200">{reason}</p>}
      <label className="block text-xs text-neutral-300">
        Hook preset, from caption styles
        <select aria-label="Hook caption preset" value={supported.includes(current) ? current : ''}
          disabled={disabled || !!reason || !mode || allowedPresetIds === null}
          onChange={e => {if (isRenderablePresetId(e.target.value)) onPreset(e.target.value);}}
          className="block w-full mt-1 rounded-lg border border-white/15 bg-vc-canvas p-2 text-white disabled:opacity-40">
          {!supported.includes(current) && <option value="">Choose a supported preset</option>}
          {supported.map(id => <option key={id} value={id} disabled={!planAllows(id)}>{CAPTION_PRESETS[id].label}{!planAllows(id) ? ' (not in plan)' : ''}</option>)}
        </select>
      </label>
      <p className="text-[10px] leading-relaxed text-neutral-400">
        Static font, color and outline, with a hook-specific contrast card. No caption motion or word-by-word effects. Only supported hook fonts are listed. Font size is adapted for a static hook. Position can be moved in the preview.
      </p>
      {mode && <p className="text-[10px] text-neutral-300">Editor preset changes also style the hook. {mode === 'hook_only' ? 'Subtitles stay hidden.' : 'Edit opening duration on the hook layer.'} Undo restores your previous settings.</p>}
      {allowedPresetIds === null && <p className="text-[10px] text-neutral-400">Loading available presets. If this does not finish, reopen the editor after checking your connection.</p>}
    </section>
  );
}
