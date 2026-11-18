import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {SmartReframeService as S}from '../services/smartReframeService.js';
const evidence=JSON.parse(fs.readFileSync(new URL('./fixtures/podcast-pair-normal-cv.json',import.meta.url),'utf8'));
test('fresh normal two-person clip cannot lose a repeated face to final 4:3 presentation',()=>{
 const shots=S.computeShotComposition({rawSamples:evidence.samples,duration:12,sourceWidth:evidence.provenance.sourceWidth,sourceHeight:evidence.provenance.sourceHeight,windowScope:'clip'});
 assert.equal(shots.length,1);assert.equal(shots[0].windowW,1);assert.equal(shots[0].windowH,1);assert.equal(shots[0].presentationProtection?.reason,'persistent-face-conflict');assert.match(shots[0].uncertainty!,/remain unverified/);
 for(const row of evidence.samples)for(const f of row.faces.filter((f:any)=>f.confidence>=.8))for(const k of shots[0].keyframes){assert(f.x>=k.centerX-shots[0].windowW/2);assert(f.x+f.width<=k.centerX+shots[0].windowW/2);}
});
