import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseSubtitleOcrTsv,sourceSubtitleReviewInputSupported} from '../shared/subtitleOcrEvidence.js';
import {BurnedSubtitleService} from '../services/burnedSubtitleService.js';
const header='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';
const frame=(y=610,confidence=96)=>[header,'1\t1\t0\t0\t0\t0\t0\t0\t1280\t720\t-1\t',...['Hello','there'].map((t,i)=>`5\t1\t1\t1\t1\t${i+1}\t${300+i*140}\t${y}\t130\t30\t${confidence}\t${t}`)].join('\n');
it('finds multiword lower-band text, not upper text or weak OCR',()=>{
 assert.deepEqual(parseSubtitleOcrTsv(frame()),{candidateTop:610/720});
 assert.deepEqual(parseSubtitleOcrTsv(frame(100)),{candidateTop:null});
 assert.deepEqual(parseSubtitleOcrTsv(frame(610,20)),{candidateTop:null});
 assert.equal(parseSubtitleOcrTsv('not TSV'),null);
});
it('does not count a single logo word, malformed geometry, or giant word as a subtitle line',()=>{
 assert.deepEqual(parseSubtitleOcrTsv(frame().replace(/5\t1\t1\t1\t1\t2[^\n]*/,'')),{candidateTop:null});
 assert.deepEqual(parseSubtitleOcrTsv(frame().replace(/\t30\t96/g,'\t300\t96')),{candidateTop:null});
 assert.deepEqual(parseSubtitleOcrTsv(frame().replace(/\t130\t/g,'\tNaN\t')),{candidateTop:null});
});
it('unavailable OCR never reports confident absence and successful empty OCR remains sampled only',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vireo-ocr-test-'));
 try {const p=path.join(dir,'frame.png'), q=path.join(dir,'other.png');await fs.writeFile(p,Buffer.alloc(24));await fs.writeFile(q,Buffer.alloc(24));
 const unknown=await BurnedSubtitleService.detectBurnedSubtitles([p,q],async()=>{throw Error('no executable')});
 assert.equal(unknown.status,'unavailable');assert.equal(unknown.confidence,0);
 const absent=await BurnedSubtitleService.detectBurnedSubtitles([p,q],async()=>({candidateTop:null}));
 assert.equal(absent.status,'not-observed');assert.match(absent.reason,/does not establish/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
it('requires sampled evidence, caps work, and never advises destructive crop',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vireo-ocr-test-'));
 try {const p=path.join(dir,'frame.png'), q=path.join(dir,'other.png');await fs.writeFile(p,Buffer.alloc(24));await fs.writeFile(q,Buffer.alloc(24));let calls=0;
 const single=await BurnedSubtitleService.detectBurnedSubtitles([p],async()=>({candidateTop:.8}));assert.equal(single.status,'unavailable');
 const paths=await Promise.all(Array.from({length:8},async(_,i)=>{const file=path.join(dir,`sample-${i}.png`);await fs.writeFile(file,Buffer.alloc(24));return file}));
 const duplicate=await BurnedSubtitleService.detectBurnedSubtitles([p,p,p],async()=>({candidateTop:.8}));assert.equal(duplicate.analyzedFrames,1);assert.equal(duplicate.status,'unavailable');
 const found=await BurnedSubtitleService.detectBurnedSubtitles(paths,async()=>{calls++;return{candidateTop:.8};});
 assert.equal(calls,5);assert.equal(found.status,'suspected-source-text');assert.equal(found.hasBurnedSubtitles,true);assert.equal(found.recommendedCropFilter,undefined);assert.equal(found.bandHeightRatio,.2);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
it('one positive among valid samples still requests review, never reports source text absent',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vireo-ocr-test-'));
 try{const files=await Promise.all(Array.from({length:5},async(_,i)=>{const p=path.join(dir,`${i}.png`);await fs.writeFile(p,Buffer.alloc(24));return p}));let i=0;
 const r=await BurnedSubtitleService.detectBurnedSubtitles(files,async()=>({candidateTop:i++===0?.8:null}));assert.equal(r.status,'suspected-source-text');assert.equal(r.confidence,.2);assert.equal(r.recommendedCropFilter,undefined);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
it('cancellation or unverified child stop cannot be laundered into absence',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vireo-ocr-test-'));
 try{const p=path.join(dir,'sample.png');await fs.writeFile(p,Buffer.alloc(24));for(const code of ['WORK_CANCELLED','PROCESS_STOP_UNVERIFIED'])await assert.rejects(BurnedSubtitleService.detectBurnedSubtitles([p],async()=>{throw Object.assign(Error('stopped'),{code})}),{code});}
 finally{await fs.rm(dir,{recursive:true,force:true});}
});

it('source-text review admits product180s cap without widening pixel or invalid-input limits',()=>{
 const base={sourceSha256:'a'.repeat(64),start:0,duration:129.845,sourceWidth:1280,sourceHeight:720};
 for(const duration of [.1,120,120.001,129.845,180])assert.equal(sourceSubtitleReviewInputSupported({...base,duration}),true);
 for(const patch of [{duration:180.001},{duration:0},{duration:NaN},{duration:Infinity},{start:-.01},{sourceWidth:1281},{sourceHeight:721},{sourceWidth:undefined},{sourceSha256:'bad'}])assert.equal(sourceSubtitleReviewInputSupported({...base,...patch}),false);
});

it('preserves sparse positive/missed/unavailable observations without converting a miss into clearance',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vireo-ocr-test-'));
 try{const files=await Promise.all(Array.from({length:4},async(_,i)=>{const p=path.join(dir,`${i}.png`);await fs.writeFile(p,Buffer.alloc(24));return p}));let i=0;
 const result=await BurnedSubtitleService.detectBurnedSubtitles(files,async()=>{const n=i++;if(n===2)throw Error('unavailable');return{candidateTop:n===0?.8:n===3?NaN:null}});
 assert.deepEqual(result.samples,[{sampleIndex:0,status:'suspected-source-text',candidateTop:.8},{sampleIndex:1,status:'not-observed',candidateTop:null},{sampleIndex:2,status:'unavailable',candidateTop:null},{sampleIndex:3,status:'unavailable',candidateTop:null}]);
 assert.equal(result.analyzedFrames,2);assert.equal(result.hasBurnedSubtitles,true);assert.equal(result.confidence,.5);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
it('timed source samples retain exact five-sample clock without interpolating missing intervals',async()=>{
 const {timedSourceSubtitleSamples}=await import('../shared/subtitleOcrEvidence.js');
 const samples=timedSourceSubtitleSamples([{sampleIndex:0,status:'suspected-source-text',candidateTop:.8},{sampleIndex:4,status:'not-observed',candidateTop:null}],100,25);
 assert.deepEqual(samples,[{sampleIndex:0,status:'suspected-source-text',candidateTop:.8,clipTime:1,sourceTime:101,establishesTextAbsence:false},{sampleIndex:4,status:'not-observed',candidateTop:null,clipTime:21,sourceTime:121,establishesTextAbsence:false}]);
 assert.deepEqual(timedSourceSubtitleSamples([],NaN,25),[]);
});
