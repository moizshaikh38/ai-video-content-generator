import test from 'node:test';import assert from 'node:assert/strict';
import{auditCaptionReadability,resolveCaptionPreset,getCueLineBreakIndex,getPreviewFrame,buildPresetAssScript}from '../shared/captionPresets.js';
const style=resolveCaptionPreset('vireo_comic_default');
test('hard line-break syntax and literal newlines have the same visible reading load',()=>{
 const a='A'.repeat(14),b='B'.repeat(13);const run=(text:string)=>auditCaptionReadability([{id:'fixture',start:0,end:1,text}],style);
 const single=run(a+' '+b),ass=run(a+'\\N'+b),newline=run(a+'\n'+b);assert.equal(single.maxCps,28);assert.deepEqual(ass,single);assert.deepEqual(newline,single);assert.equal(ass.warnings.length,0);
});
test('genuinely over-limit visible text still warns, regardless of line-break representation',()=>{
 const a='A'.repeat(15),b='B'.repeat(14);for(const separator of [' ','\\N','\n']){const r=auditCaptionReadability([{id:'fixture',start:0,end:1,text:a+separator+b}],style);assert.equal(r.maxCps,30);assert.equal(r.warnings.length,1);}
});


test('dialogue markers inside timed atoms do not move an explicit line break one word late',()=>{
 const words=[{text:'- HELLO',start:0,end:.3},{text:'MY',start:.3,end:.6},{text:'FRIEND',start:.6,end:1}];
 for(const [text,index]of [['- HELLO\\NMY FRIEND',0],['- HELLO MY\\NFRIEND',1]]as const){const cue={id:'fixture',start:0,end:1,text,words};const before=structuredClone(cue);assert.equal(getCueLineBreakIndex(cue,words.length),index);const frame=getPreviewFrame(cue,.5,style);assert.deepEqual(frame.words.map(w=>w.breakAfter),words.map((_,i)=>i===index));assert.deepEqual(cue,before);}
});
test('ordinary atom prefixes and legacy/manual text mismatch retain their existing line-break fallback',()=>{
 const words=[{text:'ONE',start:0,end:.3},{text:'TWO',start:.3,end:.6},{text:'THREE',start:.6,end:1}];
 assert.equal(getCueLineBreakIndex({id:'fixture',start:0,end:1,text:'ONE TWO\\NTHREE',words},3),1);
 assert.equal(getCueLineBreakIndex({id:'fixture',start:0,end:1,text:'DIFFERENT MANUAL\\NWORDS HERE',words},3),1);
 assert.equal(getCueLineBreakIndex({id:'fixture',start:0,end:1,text:'ONE\\NTWO THREE'},3),0);
});

test('positive cue durations at or below50ms still contribute their visible reading load',()=>{
 for(const duration of [.01,.02,.05,.051]){const report=auditCaptionReadability([{id:'short',start:0,end:duration,text:'ONE'}],style);assert.equal(report.maxCps,3/duration);assert.equal(report.warnings.length,1);}
});
test('invalid display durations are warned about without poisoning the finite CPS result',()=>{
 for(const end of [0,-1,NaN,Infinity]){const report=auditCaptionReadability([{id:'invalid',start:0,end,text:'ONE'},{id:'valid',start:1,end:2,text:'TWO'}],style);assert.equal(report.maxCps,3);assert.equal(report.warnings.length,1);assert.match(report.warnings[0],/display duration/);}
});
test('a repaired tiny display envelope warns without changing either source word clock',async()=>{
 const {enforceZeroOverlap}=await import('../shared/captionPresets.js');const cues=[{id:'one',start:0,end:.04,text:'ONE',words:[{text:'ONE',start:0,end:.04}]},{id:'two',start:.01,end:.2,text:'TWO',words:[{text:'TWO',start:.01,end:.2}]}];const words=structuredClone(cues.map(c=>c.words));const repaired=enforceZeroOverlap(cues),before=structuredClone(repaired);const report=auditCaptionReadability(repaired,style);assert.equal(report.maxCps,300);assert.equal(report.warnings.length,1);assert.match(buildPresetAssScript(repaired,style),/; VireoWarning:.*300 cps/);assert.deepEqual(repaired,before);assert.deepEqual(repaired.map(c=>c.words),words);
});
