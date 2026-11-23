import type {EditorProject,EditorTrackItem} from '../types/index.js';
/** Explicit Producer Apply replaces only requested program edge fade channels.
 * Interior fades, gain, normalization, muted state and secondary audio survive. */
export function applyProducerProgramFade(project:EditorProject,parameters:{fade_in_sec?:number;fade_out_sec?:number}):void {
 const track=project.tracks.find(t=>t.type==='VIDEO'&&!t.hidden);
 const items=(track?.items||[]).filter(i=>!i.hidden).sort((a,b)=>a.timeline_start-b.timeline_start);
 const first=items[0],last=items.at(-1);
 if(!first||!last||track?.locked||![project.canvas.duration,...items.flatMap(i=>[i.timeline_start,i.timeline_end])].every(Number.isFinite)||items.some((i,n)=>i.timeline_end<=i.timeline_start||(n>0&&i.timeline_start<items[n-1].timeline_end-.001))||Math.abs(first.timeline_start)>.001||Math.abs(last.timeline_end-project.canvas.duration)>.001||first.locked||last.locked)throw Error('unsupported-program-edge');
 const value=(n:unknown,fallback:number)=>{const v=n??fallback;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>10)throw Error('invalid-program-fade');return Math.min(v,project.canvas.duration)};
 const fadeIn=value(parameters.fade_in_sec,.15),fadeOut=value(parameters.fade_out_sec,.25);
 const audio=(i:EditorTrackItem)=>i.audio??{volume:1,fade_in:.15,fade_out:.25,normalized:true,target_lufs:-16};
 first.audio={...audio(first),fade_in:fadeIn};last.audio={...audio(last),fade_out:fadeOut};
}
