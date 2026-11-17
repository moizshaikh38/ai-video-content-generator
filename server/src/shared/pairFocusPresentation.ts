import type {ReframeSample} from '../types/index.js';
import type {ItemPanels,PanelRect} from './panelLayouts.js';
export type PairFocusReason = 'insufficient-duration-or-samples' | 'unsupported-source-shape' | 'invalid-time-evidence' | 'incomplete-sample-coverage' | 'not-exactly-two-faces' | 'invalid-face-evidence' | 'inconsistent-track-evidence' | 'pair-separation-or-size' | 'face-envelope-infeasible' | 'other-face-overlap' | 'proposal-only';
export interface PairFocusAssessment {
 proposal: {panels:ItemPanels;reason:string}|null;
 reason: PairFocusReason;
 observedSamples: number;
 pairedSamples: number;
 // Evidence status, never calibrated probability or a semantic safety verdict.
 status: 'abstained' | 'proposal-requires-review';
 unknowns: readonly string[];
}
/** Review-only two-person head/shoulder proposal. Not a conversation, speaker,
 * identity or background-irrelevance claim. Never wired to Auto by itself.
 * Independent panel views intentionally omit body/side context. */
export function assessPairFocus(samples:ReframeSample[],start:number,end:number,sourceW:number,sourceH:number):PairFocusAssessment {
 const evidence={observedSamples:samples.length,pairedSamples:samples.filter(s=>s.faces.length===2).length,unknowns:['side participants and objects','screen and text importance','disconnected hands and body action','speaker dominance and scene meaning']};
 const reject=(reason:PairFocusReason):PairFocusAssessment=>({...evidence,proposal:null,status:'abstained',reason});
 if(![start,end,sourceW,sourceH].every(Number.isFinite))return reject('invalid-time-evidence');
 if(end-start<.75||samples.length<4)return reject('insufficient-duration-or-samples');
 if(!(sourceW>sourceH&&sourceH>0))return reject('unsupported-source-shape');
 const ss=[...samples].sort((a,b)=>a.time-b.time);
 if(ss.some(s=>!Number.isFinite(s.time)||s.time<start||s.time>=end))return reject('invalid-time-evidence');
 if(ss[0].time-start>.3||end-ss.at(-1)!.time>.3||ss.some((v,i)=>i>0&&(v.time-ss[i-1].time>.35||v.time<=ss[i-1].time)))return reject('incomplete-sample-coverage');
 const pairs=ss.map(s=>[...s.faces].sort((a,b)=>a.center_x-b.center_x));
 if(pairs.some(p=>p.length!==2))return reject('not-exactly-two-faces');
 if(pairs.some(p=>p.some(f=>!f.track_id||![f.x,f.y,f.width,f.height,f.confidence,f.center_x,f.center_y].every(Number.isFinite)||f.confidence<.85||f.confidence>1||f.center_x<f.x||f.center_x>f.x+f.width||f.center_y<f.y||f.center_y>f.y+f.height||f.height<.04||f.height>.45||f.width<=0||f.x<0||f.y<0||f.x+f.width>1||f.y+f.height>1)))return reject('invalid-face-evidence');
 if([0,1].some(i=>new Set(pairs.map(p=>p[i].track_id)).size!==1)||pairs[0][0].track_id===pairs[0][1].track_id)return reject('inconsistent-track-evidence');
 if(pairs.some(p=>p[1].x-(p[0].x+p[0].width)<.025||Math.max(p[0].height/p[1].height,p[1].height/p[0].height)>2))return reject('pair-separation-or-size');
 const rects:PanelRect[]=[];
 for(let i=0;i<2;i++){
  const faces=pairs.map(p=>p[i]);
  const top=Math.max(0,Math.min(...faces.map(f=>f.y-f.height*.3)));
  const height=Math.min(1-top,Math.max(...faces.map(f=>f.y+f.height*2.5))-top);
  const width=height*(9/8)*sourceH/sourceW;
  const lo=Math.max(0,...faces.map(f=>f.x+f.width+.012-width));
  const hi=Math.min(1-width,...faces.map(f=>f.x-.012));
  if(lo>hi)return reject('face-envelope-infeasible');
  const cx=faces.reduce((n,f)=>n+f.center_x,0)/faces.length;
  const x=Math.max(lo,Math.min(hi,cx-width/2));
  if(pairs.some(p=>i===0?x+width>p[1].x-.01:x<p[0].x+p[0].width+.01))return reject('other-face-overlap');
  rects.push({x,y:top,w:width,h:height});
 }
 return {...evidence,status:'proposal-requires-review',reason:'proposal-only',proposal:{panels:{layout:'split2',slots:rects.map(sourceRect=>({sourceRect,focusX:.5,focusY:.5,scale:1,set:true}))},reason:'Two persistent similarly sized, separately bounded faces. Head/shoulder focus proposal only; side participants, objects, and action remain unjudged.'}};
}

/** Compatibility entry point. Assessment does not change candidate geometry. */
export function pairFocusPresentation(samples:ReframeSample[],start:number,end:number,sourceW:number,sourceH:number):{panels:ItemPanels;reason:string}|null {
 return assessPairFocus(samples,start,end,sourceW,sourceH).proposal;
}
