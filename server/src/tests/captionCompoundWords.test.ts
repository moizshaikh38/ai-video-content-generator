import test from'node:test';import assert from'node:assert/strict';
import{joinTimedCaptionCompounds}from'../shared/captionCompoundWords.js';
import{getValidCueWords,regroupCuesForPreset,resolveCaptionPreset}from'../shared/captionPresets.js';
import{CaptionService}from'../services/captionService.js';
const parts=[{text:'C',start:12.32,end:12.7},{text:'-BOMBS',start:12.7,end:13.14}];
test('confirmed adjacent compound uses the exact constituent union without mutating its input',()=>{
 const before=JSON.stringify(parts),out=joinTimedCaptionCompounds(parts,'those15 C-bombs will explode');assert.equal(out.length,1);assert.equal(out[0].text,'C-BOMBS');assert.equal(out[0].start,12.32);assert.equal(out[0].end,13.14);assert.deepEqual(out[0].originalTimedParts,parts);assert.equal(JSON.stringify(parts),before);
});
test('speaker markers, missing confirmation, timing gaps, styles and invalid spans never join',()=>{
 for(const[words,text]of [[parts,'C bombs'],[[parts[0],{...parts[1],start:13}],'C-bombs'],[[parts[0],{...parts[1],text:'- BOMBS'}],'C-bombs'],[[{...parts[0],customStyle:{color:'#ff0000'}},parts[1]],'C-bombs'],[[{...parts[0],end:11},parts[1]],'C-bombs']] as const){assert.equal(joinTimedCaptionCompounds(words as any,text as string).length,2)}
});
test('display constituent provenance survives shared word validation and preset regroup',()=>{
 const words=joinTimedCaptionCompounds(parts,'C-bombs');const cue={id:'fresh',start:12.32,end:13.14,text:'C-BOMBS',words};assert.deepEqual(getValidCueWords(cue)[0].originalTimedParts,parts);assert.deepEqual(regroupCuesForPreset([cue],resolveCaptionPreset('vireo_comic_default')).cues[0].words?.[0].originalTimedParts,parts);
});
test('fresh review extraction alone joins; default-off and manual cue overrides stay unchanged',()=>{
 const transcript={text:'those15 C-bombs will explode',words:[{word:'those',start:11.3,end:11.66},{word:'15',start:11.66,end:12.32},...parts.map(w=>({word:w.text,start:w.start,end:w.end})),{word:'will',start:13.14,end:13.4},{word:'explode',start:13.4,end:13.9}]};const config={maxWordsPerCue:3};
 const baseline=CaptionService.extractClipCues(transcript,0,14,0,0,config),review=CaptionService.extractClipCues(transcript,0,14,0,0,config,{joinTimedHyphenCompounds:true});assert.equal(baseline.cues[0].text,'those 15 C');assert.equal(review.cues[0].text,'those 15 C-BOMBS');assert.equal(review.cues[0].words?.[2].end,13.14);assert.deepEqual(review.cues[0].words?.[2].originalTimedParts,parts);
 const manual={...config,caption_overrides:[{cueId:'cue-1',text:'My exact words'}]};assert.deepEqual(CaptionService.extractClipCues(transcript,0,14,0,0,manual,{joinTimedHyphenCompounds:true}),CaptionService.extractClipCues(transcript,0,14,0,0,manual));
});
