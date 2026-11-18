// TEST ONLY: real PreviewCanvas, explicit frame-stepped playhead. No auth or API mutations.
import {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter} from 'react-router-dom';
import {PreviewCanvas} from '../components/editor/PreviewCanvas';
import '../index.css';
function App({project}:{project:any}) {
  const [time,setTime]=useState(0);
  const videoRef=useRef<HTMLVideoElement>(null);
  (window as any).setAuditTime=setTime;
  return <MemoryRouter><div style={{display:'flex',width:760,height:1480,background:'#111'}}>
    <PreviewCanvas {...{project,playhead:time,isPlaying:false,cleanSourceUrl:'/audit-motion/source.mp4',renderedPreviewUrl:null,viewMode:'edit',onTogglePlay:()=>{},selectedItemId:null,onSelectItem:()=>{},onUpdateItemTransform:()=>{},showSafeGuides:false,videoRef,cues:project.tracks.find((t:any)=>t.type==='CAPTION')?.items[0]?.caption?.cues||[]} as any}/>
  </div></MemoryRouter>;
}
fetch('/audit-motion/project.json').then(r=>r.json()).then(project=>createRoot(document.getElementById('root')!).render(<App project={project}/>));
