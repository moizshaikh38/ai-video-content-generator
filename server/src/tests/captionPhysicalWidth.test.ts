import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveCaptionPreset,regroupCuesForPreset,estimateCaptionLineWidth,buildPresetAssScript,PRESET_FONT_CHOICES} from '../shared/captionPresets.js';
const text='Extraordinary storytelling makes every moment memorable';
const words=text.split(' ').map((text,n)=>({text,start:n*.5,end:(n+1)*.5}));
const cue={id:'width-regression',text,start:0,end:3,position_y:.88,words};
test('actual long-phrase regression obeys1Line and2Lines in shared preview/export grouping',()=>{
 for(const maxLines of [1,2]){
  const s=resolveCaptionPreset('vireo_editorial',{maxLines},'9:16');
  const out=regroupCuesForPreset([cue],s).cues;
  assert.deepEqual(out.flatMap(c=>c.words!.map(w=>w.text)),words.map(w=>w.text.toUpperCase()));
  assert.ok(out.length>1);
  for(const c of out){assert.equal(c.position_y,.88);const lines=c.text.split('\\N');assert.ok(lines.length<=maxLines);for(const l of lines)assert.ok(estimateCaptionLineWidth(l,s)<s.playResX-s.marginL-s.marginR);}
  assert.match(buildPresetAssScript(out,s),/Dialogue:/);
 }
});
test('ordinary words stay within the physical budget across offered fonts and ratios',()=>{
 for(const fontFamily of PRESET_FONT_CHOICES)for(const aspect of ['9:16','1:1','16:9'])for(const maxLines of [1,2]){
  const s=resolveCaptionPreset('vireo_editorial',{fontFamily,maxLines},aspect);
  const out=regroupCuesForPreset([cue],s).cues;
  for(const c of out)for(const l of c.text.split('\\N')){
   // A single token cannot be split without inventing timestamps.
   if(l.includes(' ')) assert.ok(estimateCaptionLineWidth(l,s)<=s.playResX-s.marginL-s.marginR,`${fontFamily}/${aspect}/${l}`);
  }
  assert.deepEqual(out.flatMap(c=>c.words!.map(w=>[w.start,w.end])),words.map(w=>[w.start,w.end]));
 }
});
test('oversized single token is preserved, never truncated or given fabricated timing',()=>{
 const w={text:'W'.repeat(90),start:0,end:1};const s=resolveCaptionPreset('vireo_editorial',{maxLines:1});
 const out=regroupCuesForPreset([{id:'huge',start:0,end:1,text:w.text,words:[w]}],s).cues;
 assert.equal(out[0].text,w.text);assert.deepEqual(out[0].words?.map(({text,start,end})=>({text,start,end})),[w]);
});
