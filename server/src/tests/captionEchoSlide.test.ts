import {describe,it} from 'node:test';import assert from 'node:assert/strict';
import {getCaptionEchoMotion} from '../shared/captionEchoMotion.js';
import {resolveCaptionPreset,getPreviewFrame,buildPresetCueEvents,buildPresetAssScript,regroupCuesForPreset} from '../shared/captionPresets.js';
import {applyPresetToEditorCaption,resolveEditorCaptionStyle} from '../../../src/lib/captionPresets.js';
import {findPresetGroupId} from '../../../src/lib/captionPresetGroups.js';
const cue={id:'phrase',start:0,end:2.4,text:'Make every word count',words:['Make','every','word','count'].map((text,i)=>({text,start:Number((i*.6).toFixed(3)),end:Number(((i+1)*.6).toFixed(3))}))};
const style=resolveCaptionPreset('vireo_echo_slide');
describe('Original Echo Slide candidate',()=>{
 it('has monotonic cubic movement and trails that vanish at rest, distinct from stamp',()=>{
  const states=[0,.04,.12,.2,.26,.5].map(t=>getCaptionEchoMotion(0,2.4,t));
  assert.equal(states[0].offsetX,40);assert.equal(states[0].opacity,0);
  for(let i=1;i<states.length;i++){assert.ok(states[i].offsetX<=states[i-1].offsetX);assert.ok(states[i].layerOpacity<=states[i-1].layerOpacity)}
  assert.deepEqual(states[states.length-1],{scale:1,rotation:0,opacity:1,offsetX:0,layerOpacity:0});
 });
 it('is deterministic for seeks and handles invalid/outside/short cues without runaway events',()=>{
  const first=getCaptionEchoMotion(0,2.4,.04);getCaptionEchoMotion(0,2.4,2);assert.deepEqual(getCaptionEchoMotion(0,2.4,.04),first);
  for(const time of[-1,2.4,NaN])assert.equal(getCaptionEchoMotion(0,2.4,time).opacity,0);
  assert.equal(getCaptionEchoMotion(0,.05,.04).offsetX,0);
  assert.ok(buildPresetCueEvents({...cue,end:.05},style).length<=9);
  assert.deepEqual(buildPresetCueEvents({...cue,end:NaN},style),[]);
  assert.equal(getCaptionEchoMotion(.321,.921,.341).offsetX,getCaptionEchoMotion(0,.6,.02).offsetX);
 });
 it('reaches the gallery and survives preset selection plus JSON roundtrip with its original style',()=>{
  assert.equal(findPresetGroupId('vireo_echo_slide'),'clean');
  const caption=applyPresetToEditorCaption({cues:[cue],position:'bottom'}as any,'vireo_echo_slide');
  const loaded=JSON.parse(JSON.stringify(caption));const s=resolveEditorCaptionStyle(loaded,'9:16')!;
  assert.equal(s.presetId,'vireo_echo_slide');assert.equal(s.cueMotion,'echo');assert.equal(s.fontFamily,'Inter');assert.equal(s.fontSize,88);
  assert.ok(getPreviewFrame(cue,.12,s).stampMotion);
 });
 it('uses real phrase timing and shared grouping without modifying source word timestamps',()=>{
  const original=JSON.stringify(cue),parts=regroupCuesForPreset([cue],style).cues;
  assert.equal(parts.length,1);assert.equal(parts[0].text,cue.text);assert.equal(JSON.stringify(cue),original);
  assert.deepEqual(parts[0].words?.map(w=>[w.start,w.end]),cue.words.map(w=>[w.start,w.end]));
 });
 it('emits the same slide offset and trail alpha as preview state',()=>{
  const f=getPreviewFrame(cue,.12,style),m=f.stampMotion!;assert.ok('offsetX'in m);
  const events=buildPresetCueEvents(cue,style).filter(e=>e.includes('0:00:00.12,0:00:00.14'));
  assert.equal(events.length,3);assert.ok(events.every(e=>e.includes('\\frz0')&&e.includes('\\fscx100')));
  assert.ok(events[2].includes(`\\pos(${(540+m.offsetX).toFixed(3)},1560.000)`));
  const settled=buildPresetCueEvents(cue,style).filter(e=>e.includes('0:00:00.26,0:00:02.40'));
  assert.ok(settled.slice(0,2).every(e=>e.includes('\\alpha&HFF&')));assert.ok(settled[2].includes('\\alpha&H00&'));
 });
 it('preserves two lines and manual center geometry in both paths',()=>{
  const c={...cue,text:'Make every\\Nword count',position_x:.4,position_y:.6,position_anchor:'center' as const};
  assert.equal(getPreviewFrame(c,.12,style).stampOrigin,'center center');
  const events=buildPresetCueEvents(c,style);assert.ok(events.every(e=>e.includes('\\an5')&&e.endsWith('Make every\\Nword count')));
 });
 it('retains supported size/fill/shadow edits and shares fallback for incompatible token/box/pop edits',()=>{
  const s=resolveCaptionPreset('vireo_echo_slide',{fontSize:80,textColor:'#EECCAA',shadowEnabled:false});
  const ass=buildPresetAssScript([cue],s);assert.match(ass,/Style: Default,Inter,80/);assert.match(ass,/AACCEE/);assert.equal(buildPresetCueEvents(cue,s).length,14);
  for(const changed of[resolveCaptionPreset('vireo_echo_slide',{boxEnabled:true}),resolveCaptionPreset('vireo_echo_slide',{wordAnimationType:'pop'})])assert.equal(getPreviewFrame(cue,.12,changed).stampMotion,undefined);
 });
});
