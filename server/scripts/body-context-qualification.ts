/** Local helper evidence only. Requires existing /tmp/realmedia sources and explicit model env. Not an API acceptance test. */
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {SmartReframeService as S} from '../src/services/smartReframeService.js';
const [name,duration]=process.argv.slice(2);const path=`/tmp/realmedia/${name}.mp4`;
const cv=await S.runCvAnalyzer(path,4,0,Number(duration),120000);
S.associateTracks(cv.samples);
fs.writeFileSync(`/tmp/body-${name}-analysis.json`,JSON.stringify(cv));
const options={rawSamples:cv.samples,sceneCuts:cv.scene_cuts,duration:Number(duration),sourceWidth:cv.source_width,sourceHeight:cv.source_height};
const after=S.computeShotComposition(options);
const before=S.computeShotComposition({...options,rawSamples:cv.samples.map(s=>({...s,persons:undefined}))});
fs.writeFileSync(`/tmp/body-${name}-plans.json`,JSON.stringify({before,after}));
for(const [mode,plan] of [['before',before],['after',after]] as const){
 const filter=S.buildShotCompositionFilter({plan,duration:Number(duration),sourceWidth:cv.source_width,sourceHeight:cv.source_height});
 fs.writeFileSync(`/tmp/body-${name}-${mode}-filter.txt`,filter);
 execFileSync('ffmpeg',['-y','-v','error','-threads','2','-filter_complex_threads','1','-i',path,'-filter_complex',filter,'-map','[out]','-an','-t',duration,'-c:v','libx264','-threads','2','-preset','ultrafast','-crf','24',`/tmp/body-${name}-${mode}.mp4`],{timeout:120000});
}
console.log(name,JSON.stringify({before,after}));
