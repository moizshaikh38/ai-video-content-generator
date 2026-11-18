// LOCAL ONLY: real project/history/autosave hooks and EditorShell. Service boundary is offline.
import {StrictMode} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import {EditorShell} from '../components/editor/EditorShell';import {useEditorProject} from '../hooks/useEditorProject';import{clipRenderService}from'../services/clipRenderService';import{proEditorService}from'../services/proEditorService';import{CreditService}from'../services/creditService';import'../index.css';
function App(){const h=useEditorProject('local-history');(window as any).historyHook=h;(window as any).itemPlanProject=h.project;if(h.loading||!h.project||!h.clip)return <div>{h.error||'Loading'}</div>;return <MemoryRouter><EditorShell {...{clip:h.clip,project:h.project,cleanSourceUrl:h.cleanSourceUrl,renderedPreviewUrl:null,watermarkRequired:false,cues:h.cues,canUndo:h.canUndo,canRedo:h.canRedo,saveStatus:h.saveStatus,saveError:h.saveError,onSaveNow:h.saveNow,onUndo:h.undo,onRedo:h.redo,onUpdateProject:h.updateProject,onCommitProject:h.commitProject,onUpdateTrackItem:h.updateTrackItem,onUpdateCueText:h.updateCueText,onDeleteCue:h.deleteCue,onSplitTrackItem:h.splitTrackItem,onRippleDeleteTrackItem:h.rippleDeleteTrackItem,onDuplicateTrackItem:h.duplicateTrackItem,onReloadData:h.reloadProject} as any}/></MemoryRouter>}
fetch('/audit-history/fixture.json').then(r=>r.json()).then(f=>{
 const key='vireo-local-history-project';const saved=()=>JSON.parse(localStorage.getItem(key)||JSON.stringify(f.project));
 (clipRenderService as any).getClipEditorData=async()=>({clip:f.clip,editorProject:saved(),cleanSourceUrl:'/audit-history/source.mp4',watermarkRequired:false});
 (clipRenderService as any).getClipCaptions=async()=>({timingMode:'word',cues:[]});
 (clipRenderService as any).getClipReframe=async()=>f.response;
 (clipRenderService as any).updateClipEditor=async()=>f.clip;
 (proEditorService as any).updateEditorProject=async(_id:string,dto:any)=>{const p={...saved(),...dto};localStorage.setItem(key,JSON.stringify(p));return structuredClone(p)};
 (CreditService as any).getUserEntitlements=async()=>({allowedSubtitlePresets:['*']});
 createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
});
