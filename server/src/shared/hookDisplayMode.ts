import type { EditorProject, EditorTrackItem, EditorTextConfig } from '../types/index.js';
import { SAFE_EDITOR_FONTS } from '../types/index.js';
import type { ResolvedCaptionStyle } from './captionPresets.js';

export type HookDisplayMode = 'hook_only' | 'hook_captions';

/** Only an explicitly identified, unique hook is safe to change automatically. */
export function projectHook(project: Pick<EditorProject, 'tracks'>): EditorTrackItem | null {
  const hooks = project.tracks.filter(t => t.type === 'TEXT').flatMap(t => t.items)
    .filter(i => i.type === 'TEXT' && i.text?.auto_headline && typeof i.text.text === 'string' && i.text.text.trim());
  return hooks.length === 1 ? hooks[0] : null;
}

export function hookMode(project: Pick<EditorProject, 'tracks'>): HookDisplayMode | null {
  const hook = projectHook(project);
  const mode = hook?.text?.hook_display_mode;
  if (!hook || hook.hidden || !project.tracks.some(t => t.type === 'TEXT' && !t.hidden && t.items.includes(hook))) return null;
  const captionsVisible = project.tracks.some(t => t.type === 'CAPTION' && !t.hidden);
  if (mode === 'hook_only' && !captionsVisible) return mode;
  if (mode === 'hook_captions' && captionsVisible) return mode;
  return null;
}

/** Preset linkage is independent of subtitle visibility. Configure Auto Hook
 * with captions off still lasts only its opening window, not Hook only mode. */
export function hookPresetLinked(project: Pick<EditorProject,'tracks'>): boolean {
  return Boolean(hookMode(project) || projectHook(project)?.text?.hook_style_linked === true);
}

export function hookModeUnavailable(project: EditorProject): string | null {
  const hook = projectHook(project);
  if (!hook) return 'Add one hook in Hook Lab first. Multiple hook layers must be reduced to one before choosing a mode.';
  const track = project.tracks.find(t => t.items.some(i => i.id === hook.id));
  if (track?.locked || hook.locked) return 'Unlock the hook layer before changing its mode or preset.';
  if (!Number.isFinite(project.canvas.duration) || project.canvas.duration <= 0) return 'A valid clip duration is required.';
  // Export currently caps TEXT content at 100 characters. Never silently cut a hook.
  if (hook.text!.text.length > 100) return 'Shorten the hook to 100 characters or fewer before using a hook mode.';
  return null;
}

export function hookPresetSupported(style: Pick<ResolvedCaptionStyle, 'fontFamily' | 'fontWeight'> & Partial<Pick<ResolvedCaptionStyle, 'bold'>>): boolean {
  // Bangers only ships a regular face. Do not promise synthetic weight parity.
  if (style.fontFamily === 'Bangers' && (style.bold || (style.fontWeight != null && style.fontWeight !== 400))) return false;
  return (SAFE_EDITOR_FONTS as readonly string[]).includes(style.fontFamily)
    && (style.fontWeight == null || [400, 600, 700, 900].includes(style.fontWeight));
}

export function hookContrastCard(textColor: string): string {
  const hex = /^#[0-9a-f]{6}$/i.test(textColor) ? textColor.slice(1) : 'FFFFFF';
  const channels = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#0B0D12' : '#F8FAFC';
}

/** Mirrors TEXT export's current character wrapping and four-line limit. */
export function hookTextLineCount(text: string, maxChars: number): number {
  const lines = text.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
  let count = 0;
  for (let rest of lines) {
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(' ', maxChars);
      if (cut < Math.floor(maxChars * 0.5)) cut = maxChars;
      count++;
      rest = rest.slice(cut).trimStart();
    }
    if (rest) count++;
  }
  return count;
}

export function hookPresetIssue(project: EditorProject, style: ResolvedCaptionStyle, fontEmRatio: number, options?:{layoutAdmission?:'fresh-initialization'}): string | null {
  const reason = hookModeUnavailable(project);
  if (reason) return reason;
  if (!hookPresetSupported(style)) return 'This caption preset font or weight is not supported for static hooks. Choose another preset.';
  if (!Number.isFinite(fontEmRatio) || fontEmRatio <= 0 || !Number.isFinite(style.fontSize) || !Number.isFinite(style.playResX) || style.playResX <= 0) return 'This hook preset has invalid font metrics.';
  const previewWidth = project.canvas.aspect_ratio === '9:16' ? 360 : project.canvas.aspect_ratio === '1:1' ? 480 : 640;
  const size = Math.max(16, Math.min(28, Math.round(style.fontSize * fontEmRatio * previewWidth / style.playResX)));
  const previewHeight = project.canvas.aspect_ratio === '9:16' ? 640 : project.canvas.aspect_ratio === '1:1' ? 480 : 360;
  const width = Number.isFinite(project.canvas.width) && project.canvas.width > 0 ? project.canvas.width : previewWidth;
  const height = Number.isFinite(project.canvas.height) && project.canvas.height > 0 ? project.canvas.height : previewHeight;
  const exportSize = Math.max(16, Math.round(size * height / previewHeight * (projectHook(project)!.transform?.scale || 1)));
  const maxChars = Math.max(8, Math.floor(0.9 * width / (exportSize * 0.5)));
  if (options?.layoutAdmission!=='fresh-initialization' && hookTextLineCount(projectHook(project)!.text!.text, maxChars) > 4) return 'This hook exceeds the four-line export limit in this style. Shorten the hook or choose a smaller style.';
  return null;
}

/** Reject only explicit visible hook-mode text which TEXT export would shorten.
 * Legacy/manual text remains under its existing behavior. This is a source/model
 * admission check, not visual-fit or shaping proof.
 */
export function hookProjectExportIssue(project: EditorProject): string | null {
  const previewHeight = project.canvas.aspect_ratio === '9:16' ? 640 : project.canvas.aspect_ratio === '1:1' ? 480 : 360;
  const previewWidth = project.canvas.aspect_ratio === '9:16' ? 360 : project.canvas.aspect_ratio === '1:1' ? 480 : 640;
  const width = Number.isFinite(project.canvas.width) && project.canvas.width > 0 ? project.canvas.width : previewWidth;
  const height = Number.isFinite(project.canvas.height) && project.canvas.height > 0 ? project.canvas.height : previewHeight;
  for (const track of project.tracks) {
    if (track.type !== 'TEXT' || track.hidden) continue;
    for (const item of track.items) {
      const text = item.text;
      if (item.hidden || !text?.auto_headline || (!text.hook_style_linked && !['hook_only', 'hook_captions'].includes(text.hook_display_mode || ''))) continue;
      if (typeof text.text !== 'string' || !text.text.trim() || text.text.length > 100) return 'Hook text must contain 1 to 100 characters. Your local edit is kept; shorten it before saving.';
      const size = Math.max(16, Math.round((text.font_size || 36) * height / previewHeight * (item.transform?.scale || 1)));
      if (!Number.isFinite(size) || size <= 0) return 'The hook text size is invalid.';
      const maxChars = Math.max(8, Math.floor(0.9 * width / (size * 0.5)));
      if (hookTextLineCount(text.text, maxChars) > 4) return 'Hook text exceeds the four-line export limit. Shorten it or reduce its size before saving.';
    }
  }
  return null;
}

/** Static adaptation only. Keep the user's words and geometry; do not claim
 * caption motion, word highlights, casing or multilayer shadows as TEXT parity.
 * fontEmRatio is the caption font's ASS-to-CSS em ratio from the shared catalogue.
 * Fresh initialization may defer only line fitting until its generated text is
 * fitted, then must run hookProjectExportIssue. Saved/manual callers never defer.
 */
export function applyHookPreset(project: EditorProject, style: ResolvedCaptionStyle, fontEmRatio: number, options?:{layoutAdmission?:'fresh-initialization'}): EditorProject {
  if (!hookPresetLinked(project)) return project;
  const reason = hookPresetIssue(project, style, fontEmRatio,options);
  if (reason) throw new Error(reason);
  const hook = projectHook(project)!;
  const previewWidth = project.canvas.aspect_ratio === '9:16' ? 360 : project.canvas.aspect_ratio === '1:1' ? 480 : 640;
  const ratio = previewWidth / style.playResX;
  const fontSize = Math.max(16, Math.min(28, Math.round(style.fontSize * fontEmRatio * ratio)));
  const weight: EditorTextConfig['font_weight'] = style.fontWeight === 900 ? 'black' : style.fontWeight === 600 ? 'medium' : style.bold ? 'bold' : 'normal';
  return { ...project, tracks: project.tracks.map(t => ({ ...t, items: t.items.map(i => i.id !== hook.id ? i : {
    ...i,
    text: { ...i.text!, font_family: style.fontFamily, font_size: fontSize, font_weight: weight,
      color: style.textColor, stroke_color: style.outlineColor,
      stroke_width: style.box ? 0 : Math.max(0, style.outlineWidth * ratio),
      // A constant contrast card is hook-specific, not a copy of ASS boxes or shadows.
      shadow_color: undefined, shadow_blur: 0, background_color: hookContrastCard(style.textColor),
      background_padding: 8, background_corner_radius: 6, letter_spacing: 0,
      animation: 'none', animation_duration: 0, italic: false, alignment: 'center', line_height: 1.2,
      hook_caption_preset: style.presetId },
  }) })) };
}

/** Timing metadata survives save/reload and follows later clip-duration edits.
 * Visibility remains an explicit edit, never silently re-enabled by normalization.
 */
export function normalizeHookTiming(project: EditorProject): EditorProject {
  const duration = project.canvas.duration;
  if (!Number.isFinite(duration) || duration <= 0) return project;
  let changed = false;
  const tracks = project.tracks.map(t => {
    if (t.type !== 'TEXT') return t;
    let trackChanged = false;
    const items = t.items.map(i => {
      const mode = i.text?.hook_display_mode;
      if (!i.text?.auto_headline || (mode !== 'hook_only' && mode !== 'hook_captions')) return i;
      const intro = i.text.hook_intro_seconds;
      const end = mode === 'hook_only' ? duration : Math.min(duration, Number.isFinite(intro) && intro! > 0 ? intro! : 3.5);
      if (i.timeline_start === 0 && i.timeline_end === end && i.source_start === 0 && i.source_end === end) return i;
      changed = trackChanged = true;
      return { ...i, timeline_start: 0, timeline_end: end, source_start: 0, source_end: end };
    });
    return trackChanged ? { ...t, items } : t;
  });
  return changed ? { ...project, tracks } : project;
}

export function applyHookDisplayMode(project: EditorProject, mode: HookDisplayMode): EditorProject {
  if (mode !== 'hook_only' && mode !== 'hook_captions') throw new Error('Unknown hook mode.');
  const reason = hookModeUnavailable(project);
  if (reason) throw new Error(reason);
  const hook = projectHook(project)!;
  if (mode === 'hook_captions' && !project.tracks.some(t => t.type === 'CAPTION' && t.items.some(i => !i.hidden && (i.caption?.cues?.length ?? 0) > 0))) throw new Error('Add caption cues before choosing Hook + captions.');
  const previewHeight = project.canvas.aspect_ratio === '9:16' ? 640 : project.canvas.aspect_ratio === '1:1' ? 480 : 360;
  const savedIntro = hook.text!.hook_intro_seconds;
  const existingIntro = hook.text!.hook_display_mode === 'hook_only' ? 3.5 : hook.timeline_end - hook.timeline_start;
  const intro = Number.isFinite(savedIntro) && savedIntro! > 0 ? savedIntro! : Math.min(5, existingIntro > 0 ? existingIntro : 3.5);
  return normalizeHookTiming({ ...project, tracks: project.tracks.map(t => {
    if (t.type === 'CAPTION') return { ...t, hidden: mode === 'hook_only' };
    if (!t.items.some(i => i.id === hook.id)) return t;
    return { ...t, hidden: false, items: t.items.map(i => i.id === hook.id ? {
      ...i, hidden: false, transform: i.text?.hook_display_mode ? i.transform : { ...i.transform, position_x: 0, position_y: -previewHeight * 0.3, scale: 1, rotation: 0, opacity: 1 },
      keyframes: [], effects: [], transition_in: undefined, transition_out: undefined,
      text: { ...i.text!, hook_display_mode: mode, hook_intro_seconds: intro },
    } : t.hidden ? { ...i, hidden: true } : i) };
  }) });
}
