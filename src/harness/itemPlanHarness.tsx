// LOCAL TEST ONLY. Actual EditorShell; mocked analysis/entitlements, no account or API writes.
import {useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,useLocation} from 'react-router-dom';
import {EditorShell} from '../components/editor/EditorShell';import {clipRenderService} from '../services/clipRenderService';import {CreditService} from '../services/creditService';import '../index.css';
function LocationProbe(){
 const loc=useLocation();
 useEffect(()=>{(window as any).__loc=loc.pathname;},[loc]);
 return null;
}
function App({fixture}:{fixture:any}){
 const [project,setProject]=useState<any>(structuredClone(fixture.project));
 // guardedBack qualification: controllable save state. saveMode query param:
 // 'auto' (default) saves 300ms after onSaveNow; 'stuck' stays saving; 'fail' ends in error.
 const [saveStatus,setSaveStatus]=useState<string>('saved');
 (window as any).__setSaveStatus=setSaveStatus;
 if((window as any).__saveCalls===undefined)(window as any).__saveCalls=0;
 const saveMode=new URLSearchParams(location.search).get('saveMode')||'auto';
 const onSaveNow=()=>{(window as any).__saveCalls++;if(saveMode==='stuck'){setSaveStatus('saving');}else if(saveMode==='fail'){setSaveStatus('saving');setTimeout(()=>setSaveStatus('error'),300);}else{setSaveStatus('saving');setTimeout(()=>setSaveStatus('saved'),300);}};
 (window as any).setItemPlanCase=(mode:string)=>setProject(()=>{const p=structuredClone(fixture.project),i=p.tracks[0].items[0];if(mode==='policy-mismatch')i.crop_config.layoutPolicy={defaultLayout:'auto',allowed:['fill']};if(mode==='wrong-source')i.source_asset_id='different-asset';if(mode==='manual-fit')i.crop={mode:'fit',focusX:.35,focusY:.5,scale:1};if(mode==='candidate')i.crop_config.automaticLayoutCandidate='review-v1';return p;});
 (window as any).itemPlanProject=project;
 return <MemoryRouter><LocationProbe/><EditorShell {...{clip:fixture.clip,project,cleanSourceUrl:fixture.sourceUrl||'/audit-item-plan/source.mp4',renderedPreviewUrl:null,watermarkRequired:false,cues:project.tracks.find((t:any)=>t.type==='CAPTION'&&!t.hidden)?.items.flatMap((i:any)=>i.caption?.cues||[])||fixture.cues||[],canUndo:false,canRedo:false,saveStatus:saveStatus as any,saveError:saveStatus==='error'?'fixture save error':null,onSaveNow,onUndo:()=>{},onRedo:()=>{},onUpdateProject:(f:any)=>setProject((p:any)=>f(p)),onCommitProject:()=>{},onUpdateTrackItem:(trackId:string,itemId:string,patch:any)=>setProject((p:any)=>({...p,tracks:p.tracks.map((t:any)=>t.id!==trackId?t:{...t,items:t.items.map((i:any)=>i.id!==itemId?i:{...i,...patch})})})),onUpdateCueText:()=>{},onDeleteCue:()=>{},onSplitTrackItem:()=>{},onRippleDeleteTrackItem:()=>{},onDuplicateTrackItem:()=>{},onReloadData:async()=>{}} as any}/></MemoryRouter>;
}
const fixtureUrl = new URLSearchParams(location.search).has('preset') ? '/audit-item-plan/fixture-preset.json' : '/audit-item-plan/fixture.json';
fetch(fixtureUrl).then(r=>r.json()).then(fixture=>{
 (clipRenderService as any).getClipReframe=async(_id:string,candidate?:boolean)=>fixture.reframeUrl?fetch(fixture.reframeUrl+'?layoutCandidate='+(candidate?'review-v1':'off')).then(r=>{if(!r.ok)throw Error('Normal controller request failed');return r.json();}):structuredClone(fixture.responses[candidate?'candidate':'stable']);
 (CreditService as any).getUserEntitlements=async()=>({allowedSubtitlePresets:['*']});
 createRoot(document.getElementById('root')!).render(<App fixture={fixture}/>);
});
