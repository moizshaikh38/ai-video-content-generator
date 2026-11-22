import{measuredPanelChoice,type MeasuredPanelChoice}from'../../server/src/shared/measuredPanelChoice';
import {coverWindow} from './cropBox';
import {expandSceneLayoutItem,resolveSceneLayoutItem} from '../../server/src/shared/sceneLayoutOverrides';
import type { EditorProject, EditorTrackItem } from '../types';

import { normalizePanels, PANEL_LAYOUTS, seedPanelsFromSubject, subjectCenterInWindow, type PanelLayout, type ItemPanels } from '../../server/src/shared/panelLayouts';

export type SceneLayout = 'auto' | 'fill' | 'fit' | 'blur' | 'split' | PanelLayout;

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
  if ((item as any).crop_config?.layout_mode_source === 'auto' && !item.crop && !(item as any).panels && !item.framing_window) return 'auto';
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
  /** Source-clock subject track, used only to seed a new crop/panel view. */
  subjectKeyframes?: Array<{ time: number; centerX: number; centerY?: number }> | null,
  sourceSize?: {width:number;height:number},
  measuredChoices?:MeasuredPanelChoice[]
): EditorProject {
  return {
    ...project,
    tracks: project.tracks.map((t) => {
      if (t.locked || t.type !== 'VIDEO' || !t.items.some((i) => i.id === itemId)) return t;
      return {
        ...t,
        items: t.items.map((i) => {
          if (i.locked || i.id !== itemId) return i;
          if(layout==='auto'){
            const next:any={...i,crop_config:{...((i as any).crop_config||{}),layout_mode_source:'auto'}};
            delete next.crop;delete next.panels;delete next.framing_window;delete next.layout_mode;delete next.scene_layout_overrides;
            delete next.crop_config.layout_mode;delete next.crop_config.split;delete next.crop_config.screencast;
            // Manual object tracking and camera-motion hold are independent settings.
            return next as EditorTrackItem;
          }
          const base: any = { ...i, crop_config: { ...((i as any).crop_config || {}), layout_mode: layout === 'split' ? 'split' : 'track', layout_mode_source: 'user' } };
          base.layout_mode = layout === 'split' ? 'split' : 'track';
          // A layout pick replaces an accepted auto-plan context window (never both).
          delete base.framing_window;delete base.scene_layout_overrides;
          if ((PANEL_LAYOUTS as string[]).includes(layout)) {
            const prev = (i as any).panels?.layout === layout ? (i as any).panels : undefined;
            const measured=measuredPanelChoice(measuredChoices,layout,i.source_start,i.source_end,i.id);
            const priorChoice=prev?.slots?.some((s:any)=>s.set===true||s.sourceRect)?prev.slots:undefined;
            const seeded = priorChoice ?? measured?.slots ?? prev?.slots ?? seedPanelsFromSubject(layout as PanelLayout, undefined, subjectCenterInWindow(subjectKeyframes, i.source_start || 0, i.source_end ?? ((i.source_start || 0) + (i.timeline_end - i.timeline_start))),sourceSize,project.canvas.width&&project.canvas.height?project.canvas.width/project.canvas.height:project.canvas.aspect_ratio==='16:9'?16/9:project.canvas.aspect_ratio==='1:1'?1:9/16);
            base.panels = normalizePanels({ ...prev, layout: layout as PanelLayout, slots: seeded });
            delete base.crop;
            return base as EditorTrackItem;
          }
          delete base.panels;
          if (layout === 'fit' || layout === 'blur') {
            const mode = layout === 'fit' ? resolveFitMode(project.canvas) : layout;
            base.crop = { mode, choice: layout, ...(mode === 'fit' || mode === 'blur' ? fitBandFields(project.canvas) : {}), focusX: i.crop?.focusX ?? 0.5, focusY: i.crop?.focusY ?? 0.5, scale: i.crop?.scale ?? 1 };
          } else if (layout === 'fill') {
            // A new Fill should frame the measured subject, not blindly crop
            // the middle between people. Existing manual focus always wins.
            // Crop focus is CSS object-position, NOT source center: convert
            // using the exact cover-window size shared by Crop dialog/export.
            const subject=sourceSize&&sourceSize.width>0&&sourceSize.height>0?subjectCenterInWindow(subjectKeyframes,i.source_start||0,i.source_end??i.source_start+(i.timeline_end-i.timeline_start)):null;
            const aspect=project.canvas.width&&project.canvas.height?project.canvas.width/project.canvas.height:project.canvas.aspect_ratio==='16:9'?16/9:project.canvas.aspect_ratio==='1:1'?1:9/16;
            const window=subject&&sourceSize?coverWindow(sourceSize.width,sourceSize.height,aspect):null;
            const scale=i.crop?.scale??1,focus=(center:number|undefined,size:number|undefined)=>center===undefined||size===undefined||1-size/scale<1e-6?.5:Math.max(0,Math.min(1,(center-size/scale/2)/(1-size/scale)));
            base.crop = { mode: 'fill', focusX: i.crop?.focusX ?? focus(subject?.centerX,window?.w), focusY: i.crop?.focusY ?? focus(subject?.centerY,window?.h), scale };
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
    // Clip-wide framing replaces scene layout choices too. Retaining an Auto
    // scene patch makes preview fall back to legacy crop_mode while export
    // expands the patch and silently discards this new crop.
    delete next.panels;delete next.framing_window;delete next.scene_layout_overrides;
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

/** A source-clock override on one analysis scene. The timeline item is not cut.
 * Base manual crops/transforms/tracker and every other scene remain untouched. */
export function applySceneLayout(project:EditorProject,itemId:string,start:number,end:number,layout:SceneLayout,subjectKeyframes?:Array<{time:number;centerX:number;centerY?:number}>|null,sourceSize?:{width:number;height:number},measuredChoices?:MeasuredPanelChoice[]):EditorProject{
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return project;
 const t=project.tracks.find(t=>t.type==='VIDEO'&&t.items.some(i=>i.id===itemId));const item=t?.items.find(i=>i.id===itemId);
 if(!t||!item||t!==project.tracks.find(t=>t.type==='VIDEO'&&!t.hidden)||t.locked||item.locked||item.is_freeze||item.is_title_card)return project;
 const a=Math.max(start,item.source_start),b=Math.min(end,item.source_end);if(b<=a)return project;
 const effective={...resolveSceneLayoutItem(item,(a+b)/2),source_start:a,source_end:b};
 const scoped={...project,tracks:project.tracks.map(q=>q.id!==t.id?q:{...q,items:q.items.map(i=>i.id!==itemId?i:effective)})};
 const changed=applyItemLayout(scoped,itemId,layout,subjectKeyframes,sourceSize,measuredChoices).tracks.find(q=>q.id===t.id)?.items.find(i=>i.id===itemId) as any;
 const patch:any={};for(const k of ['crop','panels','layout_mode','crop_config'])if(changed[k]!==undefined)patch[k]=changed[k];
 const prior=((item as any).scene_layout_overrides||[]).flatMap((o:any)=>o.end<=a||o.start>=b?[o]:[...(o.start<a?[{...o,end:a}]:[]),...(o.end>b?[{...o,start:b}]:[])]);
 const overrides=[...prior,{start:a,end:b,layout,patch}].sort((x,y)=>x.start-y.start);
 return {...project,tracks:project.tracks.map(q=>q.id!==t.id?q:{...q,items:q.items.map(i=>i.id!==itemId?i:{...i,scene_layout_overrides:overrides})})} as EditorProject;
}
/** Explicit whole-clip action replaces layout overrides on its primary video track. */
export function applyWholeClipLayout(project:EditorProject,layout:SceneLayout,subjectKeyframes?:Array<{time:number;centerX:number;centerY?:number}>|null,sourceSize?:{width:number;height:number},measuredChoices?:MeasuredPanelChoice[]):EditorProject{
 let next=project;const track=project.tracks.find(t=>t.type==='VIDEO');if(!track||track.locked)return project;
 for(const i of track.items)if(!i.locked){next=applyItemLayout(next,i.id,layout,subjectKeyframes,sourceSize,measuredChoices);next={...next,tracks:next.tracks.map(t=>t.id!==track.id?t:{...t,items:t.items.map(q=>{if(q.id!==i.id)return q;const n:any={...q};delete n.scene_layout_overrides;return n})})};}
 return next;
}

/** Re-selecting a manual scene layout must not expand the operation to the
 * whole source item merely because its automatic preview plan is bypassed. */
export function applyLayoutAtSourceTime(project:EditorProject,itemId:string,sourceTime:number,layout:SceneLayout,shotRange?:{start:number;end:number},subjectKeyframes?:Array<{time:number;centerX:number;centerY?:number}>|null,sourceSize?:{width:number;height:number},measuredChoices?:MeasuredPanelChoice[]):EditorProject{
 const item=project.tracks.flatMap(t=>t.type==='VIDEO'?t.items:[]).find(i=>i.id===itemId);if(!item||!Number.isFinite(sourceTime)||sourceTime<item.source_start||sourceTime>item.source_end)return project;
 const inside=(s:{source_start:number;source_end:number})=>sourceTime>=s.source_start&&(sourceTime<s.source_end||(sourceTime===item.source_end&&s.source_end===item.source_end));
 const persisted=item.scene_layout_overrides?.length?expandSceneLayoutItem(item).find(inside):undefined;
 const range=persisted?{start:persisted.source_start,end:persisted.source_end}:shotRange;
 if(range&&(![range.start,range.end].every(Number.isFinite)||sourceTime<range.start||sourceTime>=range.end&&!(sourceTime===item.source_end&&range.end===item.source_end)))return project;
 return range?applySceneLayout(project,itemId,range.start,range.end,layout,subjectKeyframes,sourceSize,measuredChoices):applyItemLayout(project,itemId,layout,subjectKeyframes,sourceSize,measuredChoices);
}

/** Manual crop Apply adopts the currently displayed automatic panel geometry
 * only within its source shot. No identity is fabricated and opening/canceling
 * the control never calls this function. Existing scene/layout guards apply. */
export function applyDisplayedPanelCrop(project:EditorProject,itemId:string,sourceTime:number,panelsIn:ItemPanels,range:{start:number;end:number}):EditorProject{
 const panels=normalizePanels(panelsIn);
 const item=project.tracks.flatMap(t=>t.type==='VIDEO'?t.items:[]).find(i=>i.id===itemId);
 if(!panels||!item||![range.start,range.end,sourceTime].every(Number.isFinite))return project;
 const scene=item.scene_layout_overrides?.length?expandSceneLayoutItem(item).find(s=>sourceTime>=s.source_start&&(sourceTime<s.source_end||sourceTime===item.source_end&&s.source_end===item.source_end)):item;
 if(!scene)return project;
 const start=Math.max(range.start,scene.source_start),end=Math.min(range.end,scene.source_end);
 if(end<=start||sourceTime<start||sourceTime>end||sourceTime===end&&end!==item.source_end)return project;
 const next=applySceneLayout(project,itemId,start,end,panels.layout);
 if(next===project)return project;
 return {...next,tracks:next.tracks.map(t=>t.type!=='VIDEO'?t:{...t,items:t.items.map(i=>i.id!==itemId?i:{...i,scene_layout_overrides:i.scene_layout_overrides?.map(o=>o.start===start&&o.end===end?{...o,patch:{...o.patch,panels}}:o)})})};
}
