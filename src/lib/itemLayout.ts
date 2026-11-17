import type { EditorProject, EditorTrackItem } from '../types';

import { normalizePanels, PANEL_LAYOUTS, seedPanelsFromSubject, subjectCenterInWindow, type PanelLayout } from '../../server/src/shared/panelLayouts';

export type SceneLayout = 'fill' | 'fit' | 'blur' | 'split' | PanelLayout;

/**
 * ONE rule for every "Fit" entry point: Fit means blurred backdrop (no black bars) unless the user
 * explicitly chose a colour in the Background panel (any colour, black included).
 */
export function resolveFitMode(canvas: { background_user_choice?: 'blur' | 'color' } | undefined | null): 'fit' | 'blur' {
  return canvas?.background_user_choice === 'color' ? 'fit' : 'blur';
}

/** New Fit/Blur scenes get the 4:3 band unless the project-wide Background choice is the full frame. */
export function fitBandFields(canvas: { fit_band?: '4:3' | 'full' } | undefined | null): { band: '4:3' | 'full' } {
  return { band: canvas?.fit_band === 'full' ? 'full' : '4:3' };
}

/** Layout currently persisted on a video item (what the export compiler will use). */
export function readItemLayout(item: EditorTrackItem): SceneLayout | 'context_window' {
  if (item.framing_window !== undefined) return 'context_window';
  const pl = (item as any).panels?.layout as PanelLayout | undefined;
  if (pl && PANEL_LAYOUTS.includes(pl)) return pl;
  const userLayout = (item as any).crop_config?.layout_mode_source === 'user' ? (item as any).layout_mode : undefined;
  if (userLayout === 'split') return 'split';
  if (item.crop?.mode === 'fit') return 'fit';
  // Fit resolves to a blurred backdrop by default, so mode 'blur' + choice 'fit' is still the user's Fit.
  if (item.crop?.mode === 'blur') return (item.crop as any).choice === 'fit' ? 'fit' : 'blur';
  if (userLayout === 'blur') return 'blur';
  return 'fill';
}

/**
 * Set ONE timeline item's (scene's) layout. Fit/Blur go through item.crop (the
 * compiler's per-item override); Fill writes an explicit cover crop; Split clears item.crop so
 * split geometry applies. layout_mode is marked user-owned so export honours it
 * for this item only.
 */
export function applyItemLayout(
  project: EditorProject,
  itemId: string,
  layout: SceneLayout,
  /** Optional clip subject track (smart reframe) used to seed ScreenShare/Gameplay framing. */
  subjectKeyframes?: Array<{ time: number; centerX: number; centerY?: number }> | null
): EditorProject {
  return {
    ...project,
    tracks: project.tracks.map((t) => {
      if (t.type !== 'VIDEO' || !t.items.some((i) => i.id === itemId)) return t;
      return {
        ...t,
        items: t.items.map((i) => {
          if (i.id !== itemId) return i;
          const base: any = { ...i, crop_config: { ...((i as any).crop_config || {}), layout_mode: layout === 'split' ? 'split' : 'track', layout_mode_source: 'user' } };
          base.layout_mode = layout === 'split' ? 'split' : 'track';
          // A layout pick replaces an accepted auto-plan context window (never both).
          delete base.framing_window;
          if ((PANEL_LAYOUTS as string[]).includes(layout)) {
            const prev = (i as any).panels?.layout === layout ? (i as any).panels : undefined;
            const seeded = prev?.slots ?? seedPanelsFromSubject(layout as PanelLayout, undefined, subjectCenterInWindow(subjectKeyframes, i.source_start || 0, i.source_end ?? ((i.source_start || 0) + (i.timeline_end - i.timeline_start))));
            base.panels = normalizePanels({ layout: layout as PanelLayout, slots: seeded });
            delete base.crop;
            return base as EditorTrackItem;
          }
          delete base.panels;
          if (layout === 'fit' || layout === 'blur') {
            const mode = layout === 'fit' ? resolveFitMode(project.canvas) : layout;
            base.crop = { mode, choice: layout, ...(mode === 'fit' || mode === 'blur' ? fitBandFields(project.canvas) : {}), focusX: i.crop?.focusX ?? 0.5, focusY: i.crop?.focusY ?? 0.5, scale: i.crop?.scale ?? 1 };
          } else if (layout === 'fill') {
            base.crop = { mode: 'fill', focusX: i.crop?.focusX ?? 0.5, focusY: i.crop?.focusY ?? 0.5, scale: i.crop?.scale ?? 1 };
          } else {
            delete base.crop;
          }
          return base as EditorTrackItem;
        }),
      };
    }),
  };
}

/** Framing Strategy is clip-wide. Smart explicitly releases manual framing
 * channels so the stored automatic plan can run again in preview AND export. */
export function applyFramingStrategy(project: EditorProject, mode: 'center'|'fit'|'blur'|'smart'): EditorProject {
  return {...project,tracks:project.tracks.map(t=>t.type!=='VIDEO'?t:{...t,items:t.items.map(i=>{
    const next:any={...i,crop_mode:mode==='blur'?'fit':mode};
    delete next.panels;delete next.framing_window;
    if(mode==='smart'){
      delete next.crop;delete next.tracker;delete next.layout_mode;
      const cfg={...next.crop_config};
      delete cfg.layout_mode;delete cfg.layout_mode_source;delete cfg.split;delete cfg.screencast;
      next.crop_config=cfg;
    }else{
      next.layout_mode='track';
      next.crop_config={...next.crop_config,layout_mode:'track',layout_mode_source:'user'};
      next.crop={mode:mode==='center'?'fill':mode==='fit'?resolveFitMode(project.canvas):mode,
        focusX:mode==='center'?.5:i.crop?.focusX??.5,focusY:mode==='center'?.5:i.crop?.focusY??.5,
        scale:mode==='center'?1:i.crop?.scale??1,...((mode==='fit'||mode==='blur')?fitBandFields(project.canvas):{})};
    }
    return next;
  })})};
}
