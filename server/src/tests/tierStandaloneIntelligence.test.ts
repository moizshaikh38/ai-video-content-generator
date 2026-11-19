import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {config} from '../config/index.js';
import {VideoIntelligenceService as V} from '../services/intelligence/videoIntelligenceService.js';
import {VideoIntelligenceRepository as R} from '../db/repositories/videoIntelligenceRepository.js';
import {AudioFeatureService as A} from '../services/multimodal/audioFeatureService.js';

test('tier-enabled intelligence refuses uncaptured ASR and records failure, not completion',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-tier-guard-')),file=path.join(dir,'not-a-video.mp4');fs.writeFileSync(file,'fixture');
 const old={enabled:config.tieredTranscriptionEnabled,probe:V.probeMetadata,find:R.findBySourceHash,acquire:R.acquireLease,failed:R.markFailed,completed:R.markCompleted,silence:A.detectSilenceIntervals,volume:A.detectAudioVolume,fetch:globalThis.fetch};
 let failures=0,completions=0,network=0;
 try{
  config.tieredTranscriptionEnabled=true;
  V.probeMetadata=async()=>({durationSeconds:1,width:320,height:180,aspectRatio:'16:9',fps:30,hasAudio:true});
  R.findBySourceHash=async()=>null;
  R.acquireLease=async()=>({acquired:true,record:{id:'fixture-job',lease_token:'fixture-lease'} as any,leaseToken:'fixture-lease'});
  R.markFailed=async()=>{failures++;return null as any;};
  R.markCompleted=async()=>{completions++;return null;};
  A.detectSilenceIntervals=async()=>[];
  A.detectAudioVolume=async()=>({mean_volume_db:-24,max_volume_db:0});
  globalThis.fetch=async()=>{network++;throw Error('Unexpected provider request');};
  await assert.rejects(V.getOrAnalyzeVideo({userId:'fixture-owner',videoPath:file}),{code:'TRANSCRIPTION_POLICY_REVIEW_REQUIRED'});
  assert.equal(failures,1);assert.equal(completions,0);assert.equal(network,0);
 }finally{
  config.tieredTranscriptionEnabled=old.enabled;V.probeMetadata=old.probe;R.findBySourceHash=old.find;R.acquireLease=old.acquire;R.markFailed=old.failed;R.markCompleted=old.completed;A.detectSilenceIntervals=old.silence;A.detectAudioVolume=old.volume;globalThis.fetch=old.fetch;fs.rmSync(dir,{recursive:true,force:true});
 }
});
