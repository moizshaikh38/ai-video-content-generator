import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {getCaptionStampMotion} from '../shared/captionStampMotion.js';
import {CAPTION_PRESETS,resolveCaptionPreset,getPreviewFrame,buildPresetCueEvents,buildPresetAssScript,regroupCuesForPreset,resolveRenderPresetId,DEFAULT_CAPTION_PRESET_ID} from '../shared/captionPresets.js';
import {findPresetGroupId} from '../../../src/lib/captionPresetGroups.js';
const cue={id:'one',start:0,end:.6,text:'MAKE',words:[{text:'MAKE',start:0,end:.6}]};
const style=resolveCaptionPreset('vireo_prism_stamp');
describe('Independent Prism Stamp candidate',()=>{
 it('is a new reachable style, preserving existing names and default',()=>{
  assert.equal(CAPTION_PRESETS.vireo_prism_stamp.qualification,'candidate');
  assert.equal(resolveRenderPresetId('vireo_prism_stamp'),'vireo_prism_stamp');
  assert.equal(findPresetGroupId('vireo_prism_stamp'),'neon');
  assert.equal(CAPTION_PRESETS.word_cut.label,'Word Cut');assert.equal(DEFAULT_CAPTION_PRESET_ID,'simple');
 });
 it('has a real time-dependent tilt and overshoot, not just color/name aliases',()=>{
  const first=getCaptionStampMotion(0,.6,0),peak=getCaptionStampMotion(0,.6,.12),settled=getCaptionStampMotion(0,.6,.3);
  assert.equal(first.scale,.76);assert.equal(first.rotation,-8);assert.equal(first.opacity,0);
  assert.equal(peak.scale,1.06);assert.equal(peak.rotation,1.5);assert.equal(peak.opacity,1);
  assert.deepEqual(settled,{scale:1,rotation:0,opacity:1});
 });
 it('uses bounded duration for short cues and hides outside the cue',()=>{
  assert.deepEqual(getCaptionStampMotion(0,.06,.04),{scale:1,rotation:0,opacity:1});
  for(const t of[-1,.6,1,NaN])assert.equal(getCaptionStampMotion(0,.6,t).opacity,0);
 });
 it('has deterministic centisecond/20ms seek state independent of previous seeks',()=>{
  const a=getPreviewFrame(cue,.04,style).stampMotion;
  getPreviewFrame(cue,.3,style);assert.deepEqual(getPreviewFrame(cue,.04,style).stampMotion,a);
  assert.deepEqual(getCaptionStampMotion(0,.6,.04),getCaptionStampMotion(0,.6,.049));
 });
 it('samples identical motion into ASS and preview, with three explicit layers',()=>{
  const f=getPreviewFrame(cue,.12,style),events=buildPresetCueEvents(cue,style).filter(e=>e.includes('0:00:00.12,0:00:00.14'));
  assert.equal(events.length,3);assert.equal(f.stampMotion?.scale,1.06);
  assert.ok(events.every(e=>e.includes('\\fscx106')&&e.includes('\\frz-1.5')&&e.includes('\\org(540.000,1520.000)')));
  assert.ok(events.some(e=>e.startsWith('Dialogue: 1,')));
 });
 it('keeps cue line breaks and neutralizes ASS injection without reusing vendor assets',()=>{
  const events=buildPresetCueEvents({...cue,text:'MAKE\\NEVERY'},style);
  assert.ok(events.every(e=>e.endsWith('MAKE\\NEVERY')));
  const bad=buildPresetCueEvents({...cue,text:'x{\\pos(1,1)}'},style).join('\n');
  assert.ok(!bad.includes('\\pos(1,1)'));assert.ok(bad.includes('/pos(1,1)'));
 });
 it('moves all passes with manual center anchor, including two lines',()=>{
  const manual={...cue,text:'MAKE\\NEVERY',position_x:.38,position_y:.62,position_anchor:'center' as const};
  const f=getPreviewFrame(manual,.12,style);assert.equal(f.stampOrigin,'center center');assert.equal(f.positionAnchor,'center');
  const out=buildPresetCueEvents(manual,style).join('\n');assert.match(out,/\\an5/);assert.match(out,/\\org\(410.400,1190.400\)/);
 });
 it('respects top/center/bottom default anchors across supported ratios',()=>{
  for(const aspect of['9:16','1:1','16:9'] as const)for(const position of['top','center','bottom']as const){
   const s=resolveCaptionPreset('vireo_prism_stamp',{position},aspect),f=getPreviewFrame(cue,.12,s);
   assert.equal(f.stampOrigin,`center ${position}`);
   const out=buildPresetAssScript([cue],s);assert.match(out,new RegExp(`PlayResX: ${s.playResX}`));assert.match(out,/\\frz-1.5/);
  }
 });
 it('retains source timings and metadata through shared grouping',()=>{
  const words=['Make','every','word','count'].map((text,i)=>({text,start:Number((i*.6).toFixed(3)),end:Number((i*.6+.6).toFixed(3))}));
  const original={...cue,end:2.4,text:words.map(w=>w.text).join(' '),words,position_x:.4,position_y:.7,position_anchor:'center' as const};
  const before=JSON.stringify(original),parts=regroupCuesForPreset([original],style).cues;
  assert.equal(parts.length,4);assert.deepEqual(parts.flatMap(c=>c.words!.map(w=>[w.start,w.end])),words.map(w=>[w.start,w.end]));
  assert.ok(parts.every(c=>c.position_x===.4&&c.position_y===.7&&c.position_anchor==='center'));assert.equal(JSON.stringify(original),before);
 });
 it('animates segment-only cues from real cue timing, without fabricating word timing',()=>{
  const c={id:'segment',start:0,end:1,text:'A whole phrase'};const f=getPreviewFrame(c,.12,style);
  assert.equal(f.wordTiming,false);assert.ok(f.stampMotion);assert.equal(f.words.length,3);
  assert.ok(buildPresetCueEvents(c,style).length<=39);
 });
 it('falls back together for incompatible token effects, box, pop and non-centered alignment',()=>{
  for(const s of[resolveCaptionPreset('vireo_prism_stamp',{boxEnabled:true}),resolveCaptionPreset('vireo_prism_stamp',{wordAnimationType:'pop'}),resolveCaptionPreset('vireo_prism_stamp',{alignment:'left'})]){
   assert.equal(getPreviewFrame(cue,.12,s).stampMotion,undefined);assert.ok(!buildPresetCueEvents(cue,s).join('\n').includes('\\frz'));
  }
  const custom={...cue,words:[{...cue.words[0],customStyle:{color:'#00FF00'}}]};assert.equal(getPreviewFrame(custom,.12,style).stampMotion,undefined);
 });
 it('retains editable font/size/color and explicit shadow overrides',()=>{
  const s=resolveCaptionPreset('vireo_prism_stamp',{fontFamily:'Inter',fontSize:80,textColor:'#EECCAA',shadowEnabled:true,shadowDepth:3});
  assert.equal(s.shadowLayers,undefined);assert.equal(s.fontFamily,'Inter');assert.equal(s.fontSize,80);
  const out=buildPresetAssScript([cue],s);assert.match(out,/Style: Default,Inter,80/);assert.match(out,/\\shad3/);assert.match(out,/AACCEE/);
 });
});
