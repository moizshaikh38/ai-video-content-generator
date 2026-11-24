import test from 'node:test';import assert from 'node:assert/strict';
import {regroupCuesForPreset,resolveCaptionPreset,buildPresetAssScript,getPreviewFrame,computeCueWordSlices,shouldHoldSingleWordThroughGap,getShortGapHoldUntil}from'../shared/captionPresets.js';
const parent=(second={start:.6,end:.9},end=1)=>({id:'p',start:0,end,text:'hay in',words:[{text:'hay',start:0,end:.3},{text:'in',...second,}].map((w,i)=>i?{...w,text:'in'}:w)});
const ass=(cues:any[],style:any)=>buildPresetAssScript(cues,style).split('\n').filter(l=>l.startsWith('Dialogue'));
const spans=(lines:string[],word:string)=>lines.filter(l=>l.endsWith(word)||l.includes('}'+word)).map(l=>l.split(',').slice(1,3).join(','));
for(const id of ['word_cut','soft_cut'] as const){
 const style=resolveCaptionPreset(id);
 test(`${id}: short gap hold reaches ASS and preview without changing measured word clocks`,()=>{
  const {cues}=regroupCuesForPreset([parent() as any],style);
  assert.deepEqual(cues.map(c=>[c.start,c.end]),[[0,.6],[.6,.9]]);
  assert.equal(cues[0].words![0].start,0);assert.equal(cues[0].words![0].end,.3);
  const lines=ass(cues,style);
  assert.ok(spans(lines,'hay').includes('0:00:00.00,0:00:00.30'));assert.ok(spans(lines,'hay').includes('0:00:00.30,0:00:00.60'));
  assert.ok(!lines.some(l=>l.includes('hay')&&l.split(',')[2]>'0:00:00.60'));
  assert.ok(!lines.some(l=>l.endsWith('in')||l.includes('}in'))||spans(lines,'in').every(s=>s.split(',')[0]>='0:00:00.60'));
  const held=getPreviewFrame(cues[0],.45,style);assert.ok(held.words.length===1&&held.words[0].text.toLowerCase()==='hay');assert.ok(getPreviewFrame(cues[0],.45,style).words[0].active!==true);
  assert.equal(getPreviewFrame(cues[0],.15,style).words[0].text.toLowerCase(),'hay');
 });
 test(`${id}: no hold across a long gap, for the final word, or for a different preset override`,()=>{
  const long=regroupCuesForPreset([parent({start:1,end:1.2},1.3) as any],style).cues;assert.deepEqual(long.map(c=>[c.start,c.end]),[[0,.3],[1,1.2]]);
  assert.deepEqual(computeCueWordSlices(long[0] as any,undefined,true).map(s=>[s.start,s.end]),[[0,.3]]);
  const last=regroupCuesForPreset([parent() as any],style).cues.at(-1)!;assert.equal(last.end,.9);assert.deepEqual(computeCueWordSlices(last as any,undefined,true).map(s=>[s.start,s.end]),[[.6,.9]]);
  const other=regroupCuesForPreset([{...parent(),presetOverride:id==='word_cut'?'soft_cut':'word_cut'} as any],style).cues;assert.equal(other[0].end,.3);
 });
}
test('other presets and the generic one-word envelope are unchanged',()=>{
 const one={id:'a',start:0,end:.6,text:'hay',words:[{text:'hay',start:0,end:.3}]} as any;
 assert.deepEqual(computeCueWordSlices(one).map(s=>[s.start,s.end]),[[0,.3]]);
 assert.deepEqual(computeCueWordSlices(one,undefined,false).map(s=>[s.start,s.end]),[[0,.3]]);
});
for(const id of ['word_cut','soft_cut'] as const){
 const style=resolveCaptionPreset(id);
 test(`${id}: provenance guards (mixed-track override, unregrouped final cue, clipped end, separate cues)`,()=>{
  // reviewer repro: track simple, cue override word_cut, single final measured word 0-.3 inside raw cue 0-2
  const simple=resolveCaptionPreset('simple' as any);
  const mixed={id:'m',start:0,end:2,text:'hay',presetOverride:id,words:[{text:'hay',start:0,end:.3}]} as any;
  const r=regroupCuesForPreset([mixed],simple).cues;
  assert.equal(getShortGapHoldUntil(r[0]),undefined);
  const resolved=resolveCaptionPreset(id);
  assert.deepEqual(computeCueWordSlices(mixed,undefined,shouldHoldSingleWordThroughGap(resolved,mixed)).map(s=>[s.start,s.end]),[[0,.3]]);
  assert.ok(!ass([mixed],resolved).some(l=>l.includes('0:00:02.00')||l.includes('0:00:01.')),'no long hold for unregrouped final word');
  // arbitrary unregrouped cue with extended end, no provenance
  const un={id:'u',start:0,end:.6,text:'hay',words:[{text:'hay',start:0,end:.3}]} as any;
  assert.deepEqual(computeCueWordSlices(un,undefined,shouldHoldSingleWordThroughGap(style,un)).map(s=>[s.start,s.end]),[[0,.3]]);
  // forged provenance beyond .45 is not trusted
  const forged={...un,end:1.5,shortGapHoldUntil:1.5} as any;
  assert.deepEqual(computeCueWordSlices(forged,undefined,true).map(s=>[s.start,s.end]),[[0,.3]]);
  // clipped cue end: hold never exceeds cue.end
  const reg=regroupCuesForPreset([parent() as any],style).cues[0] as any;assert.equal(getShortGapHoldUntil(reg),.6);
  const clipped={...reg,end:.45};
  assert.deepEqual(computeCueWordSlices(clipped,undefined,true).map(s=>[s.start,s.end]),[[0,.3],[.3,.45]]);
  // separate original cues (scene/position boundary): no merge, no hold across
  const a={id:'a',start:0,end:.3,text:'hay',position_y:.7,words:[{text:'hay',start:0,end:.3}]} as any;
  const b={id:'b',start:.5,end:.8,text:'in',position_y:.3,words:[{text:'in',start:.5,end:.8}]} as any;
  const sep=regroupCuesForPreset([a,b],style).cues;
  assert.deepEqual(sep.map(c=>[c.start,c.end,getShortGapHoldUntil(c)]),[[0,.3,undefined],[.5,.8,undefined]]);
 });
}

for(const id of ['word_cut','soft_cut'] as const){
 const style=resolveCaptionPreset(id);
 test(`${id}: stale/persisted marker rejected; legitimate regroup marker survives local spreads`,()=>{
  // reviewer repro: raw mixed override word_cut, word 0-.3, end 2, stale in-range numeric marker .6
  const raw={id:'s',start:0,end:2,text:'hay',presetOverride:id,shortGapHoldUntil:.6,words:[{text:'hay',start:0,end:.3}]} as any;
  assert.equal(shouldHoldSingleWordThroughGap(style,raw),false);
  assert.deepEqual(computeCueWordSlices(raw,undefined,shouldHoldSingleWordThroughGap(style,raw)).map(s=>[s.start,s.end]),[[0,.3]]);
  const bypass=regroupCuesForPreset([raw],resolveCaptionPreset('simple' as any)).cues[0];assert.equal(getShortGapHoldUntil(bypass),undefined);
  // legitimate regroup marker is not JSON-persistable but survives ordinary object spreads
  const reg=regroupCuesForPreset([parent() as any],style).cues[0];assert.equal(getShortGapHoldUntil(reg),.6);
  assert.equal(getShortGapHoldUntil({...reg,position_y:.5}),.6);
  assert.equal(getShortGapHoldUntil(JSON.parse(JSON.stringify(reg))),undefined);
  assert.deepEqual(computeCueWordSlices({...reg} as any,undefined,true).map(s=>[s.start,s.end]),[[0,.3],[.3,.6]]);
  // re-feeding regroup output through a bypass path clears inherited marker
  const re=regroupCuesForPreset([{...reg,presetOverride:id==='word_cut'?'soft_cut':'word_cut'} as any],style).cues[0];assert.equal(getShortGapHoldUntil(re),undefined);
 });
}
