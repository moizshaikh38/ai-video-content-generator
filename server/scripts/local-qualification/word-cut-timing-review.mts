import fs from'node:fs';import os from'node:os';import path from'node:path';import{pathToFileURL}from'node:url';import{execFileSync as run}from'node:child_process';import{SmartReframeService as S}from'../../src/services/smartReframeService.js';import{applyWordEnergyFusion as after}from'../../src/utils/wordEnergyFusion.js';
// Pin pre-fix implementation from this repository, not an external download.
const baselineDir=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-word-cut-'));
let before:typeof after;
try{const p=path.join(baselineDir,'baseline.ts');fs.writeFileSync(p,run('git',['show','68a8674acf5195b55be8787ccc2ab1bb6d23a726:server/src/utils/wordEnergyFusion.ts'],{encoding:'utf8'}));before=(await import(pathToFileURL(p).href)).applyWordEnergyFusion;}finally{fs.rmSync(baselineDir,{recursive:true,force:true});}
const out=process.argv[2];if(!out||fs.existsSync(out))throw Error('New output required');fs.mkdirSync(out,{recursive:true});
const samples=Array.from({length:16},(_,i)=>({time:i*.25,faces:[{track_id:i<8?'left':'right',x:i<8?.15:.7,y:.2,width:.1,height:.15,center_x:i<8?.2:.75,center_y:.275,confidence:.95}]}));
const k=S.smoothAndGenerateKeyframes({samples,dominantTrackId:'left',duration:4,sceneCuts:[2],sourceWidth:960,sourceHeight:540});
const words=[{start:1.8,end:2.2,word:'synthetic-timing-only'}];const variants={before:before(k,words),after:after(k,words)};
run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0x202020:s=960x540:r=30:d=4','-vf',"drawbox=x=144:y=108:w=96:h=81:color=yellow:t=fill:enable='lt(t,2)',drawbox=x=672:y=108:w=96:h=81:color=lime:t=fill:enable='gte(t,2)'",'-threads','1','-c:v','libx264','-preset','ultrafast',out+'/source.mp4']);
for(const[name,frames]of Object.entries(variants)){
 const filter=S.buildSmartCropFilter(frames,'9:16',960,540,4,.5);
 run('ffmpeg',['-v','error','-y','-threads','1','-i',out+'/source.mp4','-vf',filter,'-an','-threads','1','-c:v','libx264','-preset','ultrafast',out+'/'+name+'.mp4']);
}
fs.writeFileSync(out+'/result.json',JSON.stringify({scope:'Synthetic source cut/timing regression only, not diarization, real speech, or automatic clip selection',words,smoother:k,...variants},null,2));
run('ffmpeg',['-v','error','-y','-i',out+'/before.mp4','-i',out+'/after.mp4','-filter_complex','[0:v][1:v]hstack=inputs=2[v]','-map','[v]','-threads','1','-c:v','libx264','-preset','ultrafast',out+'/before-after.mp4']);
run('ffmpeg',['-v','error','-y','-ss','2.066667','-i',out+'/before-after.mp4','-frames:v','1',out+'/at-cut-plus-two-frames.png']);
console.log(JSON.stringify(variants));
