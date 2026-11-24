import{test}from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{SmartReframeService as S}from'../services/smartReframeService.js';
const recorded=JSON.parse(fs.readFileSync(new URL('./fixtures/podcast-pair-normal-cv.json',import.meta.url),'utf8'));
test('recorded visual ranking is unchanged by absent, overlapping or disjoint transcript intervals, not AV identity',()=>{
 const samples=structuredClone(recorded.samples);const{tracks}=S.associateTracks(samples,.35,[]);const before=JSON.stringify(samples);
 const intervalInputs=[[],[{start:0,end:12}],[{start:1000,end:1001}],[{start:0,end:8},{start:4,end:12}]];
 const scores=intervalInputs.map(speechIntervals=>S.selectDominantTrack(tracks,samples.length,{speechIntervals}));
 for(const score of scores)assert.deepEqual(score,scores[0]);assert.equal(JSON.stringify(samples),before);
});
test('synthetic moving-mouth control can beat established anchor without proving a speaker',()=>{
 const face=(x:number,mouth:number)=>({x,y:.2,width:.18,height:.18,center_x:x+.09,center_y:.29,confidence:.9,mouth_score:mouth});
 const tracks=new Map([['established',Array.from({length:10},()=>face(.1,.05))],['moving-mouth',Array.from({length:7},()=>face(.6,.85))]]);
 const inputs=[[],[{start:0,end:3}],[{start:1000,end:1001}]];const scores=inputs.map(speechIntervals=>S.selectDominantTrack(tracks,10,{speechIntervals}));
 assert.equal(scores[0].dominantTrackId,'moving-mouth');for(const score of scores)assert.deepEqual(score,scores[0]);
 for(const rows of tracks.values())for(const f of rows)delete (f as any).mouth_score;
 assert.equal(S.selectDominantTrack(tracks,10).dominantTrackId,'established');
});
