/** New speech-clip defaults only. Recorded word clocks bound fades to leading
 * and trailing non-word time; this is not independent speech alignment. */
export function newSpeechEdgeFades(words:unknown,start:number,end:number):{fade_in:number;fade_out:number} {
 const fallback={fade_in:.15,fade_out:.25};
 if(!Array.isArray(words)||!words.length||![start,end].every(Number.isFinite)||start<0||end<=start)return fallback;
 if(words.some(w=>!w||![w.start,w.end].every(Number.isFinite)||w.start<0||w.end<=w.start))return fallback;
 const speech=words.filter(w=>typeof(w.word??w.text)==='string'&&String(w.word??w.text).trim()&&w.start<end&&w.end>start);
 if(!speech.length)return fallback;
 const safeGap=(gap:number,maximum:number)=>Math.min(maximum,Math.max(0,Math.floor((gap-.02+1e-9)*1000)/1000));
 return{fade_in:safeGap(Math.min(...speech.map(w=>w.start))-start,.15),fade_out:safeGap(end-Math.max(...speech.map(w=>w.end)),.25)};
}
/** Dialogue is a concatenated program. Honor only its first/last video's saved
 * edge values here; interior and secondary audio are separate processing. */
export function dialogueProgramFades(items:Array<{timeline_start:number;timeline_end:number;audio?:{fade_in?:number;fade_out?:number}}>,duration:number):{fade_in:number;fade_out:number} {
 const ordered=[...items].filter(i=>Number.isFinite(i.timeline_start)&&Number.isFinite(i.timeline_end)&&i.timeline_end>i.timeline_start).sort((a,b)=>a.timeline_start-b.timeline_start);
 const clamp=(value:unknown,fallback:number)=>typeof value==='number'&&Number.isFinite(value)?Math.min(Math.max(0,duration),Math.max(0,value)):Math.min(Math.max(0,duration),fallback);
 return{fade_in:clamp(ordered[0]?.audio?.fade_in,.15),fade_out:clamp(ordered.at(-1)?.audio?.fade_out,.25)};
}
