import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {reviewEncodedAudio} from '../services/encodedAudioReviewService.js';
test('real encoded AAC peaks are measured, never replaced by target values or listening approval',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'encoded-review-'));
 try {
 const safe=path.join(dir,'safe.m4a'),hot=path.join(dir,'hot.m4a');
 for(const [file,volume]of [[safe,'1'],[hot,'20']])execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=600:sample_rate=48000:duration=2','-af',`volume=${volume}`,'-c:a','aac','-b:a','128k',file],{timeout:10000});
 const a=await reviewEncodedAudio(safe,false),b=await reviewEncodedAudio(hot,false);
 assert.equal(a.status,'measured');assert((a.true_peak_dbtp as number)<0);assert.notEqual(a.integrated_lufs,-16);assert.equal(a.listening_verified,false);
 assert.equal(b.status,'needs_review');assert((b.true_peak_dbtp as number)>=0);assert.deepEqual(b.issues,['true_peak_above_zero']);assert.equal(b.listening_verified,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('missing measurement stays unavailable and explicit mute does not pretend audio was checked',async()=>{
 const a=await reviewEncodedAudio('/no/such/audio.mp4',false),b=await reviewEncodedAudio('/no/such/audio.mp4',true);
 assert.equal(a.status,'unavailable');assert.equal(a.integrated_lufs,null);assert.equal(a.true_peak_dbtp,null);assert.deepEqual(a.issues,['measurement_unavailable']);
 assert.equal(b.status,'muted');assert.equal(b.true_peak_dbtp,null);assert.equal(b.listening_verified,false);
});
