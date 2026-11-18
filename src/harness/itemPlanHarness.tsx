// LOCAL TEST ONLY. Actual EditorShell; mocked analysis/entitlements, no account or API writes.
import {useState} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';
import {EditorShell} from '../components/editor/EditorShell';import {clipRenderService} from '../services/clipRenderService';import {CreditService} from '../services/creditService';import '../index.css';
function App({fixture}:{fixture:any}){
 const [project,setProject]=useState<any>(structuredClone(fixture.project));
 (window as any).setItemPlanCase=(mode:string)=>setProject(()=>{const p=structuredClone(fixture.project),i=p.tracks[0].items[0];if(mode==='policy-mismatch')i.crop_config.layoutPolicy={defaultLayout:'auto',allowed:['fill']};if(mode==='wrong-source')i.source_asset_id='different-asset';if(mode==='manual-fit')i.crop={mode:'fit',focusX:.35,focusY:.5,scale:1};if(mode==='candidate')i.crop_config.automaticLayoutCandidate='review-v1';return p;});
 (window as any).itemPlanProject=project;
 return <MemoryRouter><EditorShell {...{clip:fixture.clip,project,cleanSourceUrl:fixture.sourceUrl||'/audit-item-plan/source.mp4',renderedPreviewUrl:null,watermarkRequired:false,cues:fixture.cues||[],canUndo:false,canRedo:false,saveStatus:'saved',saveError:null,onSaveNow:()=>{},onUndo:()=>{},onRedo:()=>{},onUpdateProject:(f:any)=>setProject((p:any)=>f(p)),onCommitProject:()=>{},onUpdateTrackItem:(trackId:string,itemId:string,patch:any)=>setProject((p:any)=>({...p,tracks:p.tracks.map((t:any)=>t.id!==trackId?t:{...t,items:t.items.map((i:any)=>i.id!==itemId?i:{...i,...patch})})})),onUpdateCueText:()=>{},onDeleteCue:()=>{},onSplitTrackItem:()=>{},onRippleDeleteTrackItem:()=>{},onDuplicateTrackItem:()=>{},onReloadData:async()=>{}} as any}/></MemoryRouter>;
}
fetch('/audit-item-plan/fixture.json').then(r=>r.json()).then(fixture=>{
 (clipRenderService as any).getClipReframe=async(_id:string,candidate?:boolean)=>fixture.reframeUrl?fetch(fixture.reframeUrl+'?layoutCandidate='+(candidate?'review-v1':'off')).then(r=>{if(!r.ok)throw Error('Normal controller request failed');return r.json();}):structuredClone(fixture.responses[candidate?'candidate':'stable']);
 (CreditService as any).getUserEntitlements=async()=>({allowedSubtitlePresets:['*']});
 createRoot(document.getElementById('root')!).render(<App fixture={fixture}/>);
});
