import fs from 'node:fs';import {execFileSync}from'node:child_process';import{PANEL_RECTS,defaultPanelSlots,buildPanelsFilter}from'../../src/shared/panelLayouts.js';
const out='/downloads/vireo-panel-contain-matrix-0718';fs.mkdirSync(out,{recursive:true});
for(const layout of Object.keys(PANEL_RECTS)as Array<keyof typeof PANEL_RECTS>){
 const panels={layout,slots:defaultPanelSlots(layout).map((s,i)=>({...s,set:true,fit:'contain' as const,sourceRect:{x:i%2*.5,y:0,w:.5,h:1}}))};
 const f=buildPanelsFilter(panels,720,1280);fs.writeFileSync(out+'/'+layout+'.filter.txt',f);
 execFileSync('ffmpeg',['-v','error','-y','-threads','1','-filter_complex_threads','1','-f','lavfi','-i','color=c=red:s=1280x720:d=1:r=2','-filter_complex',`drawbox=x=640:y=0:w=640:h=720:c=blue:t=fill,${f}`,'-frames:v','1',out+'/'+layout+'.png']);
}
console.log('8 real ffmpeg contain layouts rendered');
