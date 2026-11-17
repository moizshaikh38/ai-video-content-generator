import fs from'node:fs';
import{assFontsDirArg}from'../../src/services/editorFontFiles.js';
import{resolveCaptionPreset,buildPresetAssScript}from'../../src/shared/captionPresets.js';
import{reviewCaptionPlacement}from'../../src/shared/captionPlacementReview.js';
const D='/downloads/caption-placement-review';fs.mkdirSync(D,{recursive:true});fs.writeFileSync(D+'/fontsdir.txt',assFontsDirArg().slice(11,-1));
const cue={id:'synthetic-placement',start:0,end:3,text:'MAKE THIS MOMENT COUNT',position_x:.5,position_y:.5,position_anchor:'center'as const};
const style=resolveCaptionPreset('vireo_comic_default');
if(process.argv.includes('--measure')){fs.writeFileSync(D+'/measure.ass',buildPresetAssScript([cue],style));}
else{const envelope=JSON.parse(fs.readFileSync(D+'/envelope.json','utf8'));const report:any[]=[];for(const [name,regions,evidence]of[['fit-lower',[],'complete-for-interval'],['fit-top',[{x:0,y:1400,width:1080,height:290,kind:'hud',source:'manual-review'}],'complete-for-interval'],['unknown',[],'incomplete']]as const){const r=reviewCaptionPlacement({itemId:'synthetic-item',sourceId:'cottonbro-qualification',compositionRevision:'synthetic-fit-composition-1',start:0,end:3,canvas:{width:1080,height:1920},picture:{x:0,y:555,width:1080,height:810},caption:envelope,regions:regions as any,evidence:evidence as any});report.push({name,result:r});if(r.anchor)fs.writeFileSync(D+'/'+name+'.ass',buildPresetAssScript([{...cue,position_x:r.anchor.x,position_y:r.anchor.y}],style));}fs.writeFileSync(D+'/review.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));}
