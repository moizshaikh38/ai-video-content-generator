import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import {fileURLToPath} from 'node:url';
import {buildPresetAssScript,resolveCaptionPreset,FONT_EM_PER_ASS_SIZE} from '../shared/captionPresets.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
describe('Caption candidate bundled font selection',()=>{
  for(const [id,font,file,postscript] of [
    ['vireo_comic_punch','Komika Axis','komika-axis/KOMIKAX_.ttf','KomikaAxis'],
    ['chip_background','Poppins','poppins/Poppins-Bold.ttf','Poppins-Bold'],
    ['glide','Montserrat','montserrat/Montserrat-ExtraBold.ttf','Montserrat-ExtraBold'],
    ['with_backdrop','Lemon','lemon/Lemon-Regular.ttf','Lemon-Regular'],
    ['crossline','Cal Sans','cal-sans/CalSans-Regular.ttf','CalSans-Regular'],
    ['retro_3d','Bungee','bungee/Bungee-Regular.ttf','Bungee-Regular'],
    ['soft_cut','Figtree','figtree/Figtree-SemiBold.ttf','Figtree-SemiBold'],
    ['word_cut','Inter','inter/Inter-Bold.ttf','Inter-Bold'],
    ['soft_build','League Spartan','league-spartan/LeagueSpartan-Regular.ttf','LeagueSpartan-Regular'],
    ['typewriter','JetBrains Mono','jetbrains-mono/JetBrainsMono-Bold.ttf','JetBrainsMono-Bold'],
  ]) it(`${id} selects its bundled face rather than system fallback`,()=>{
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'caption-font-'));
    try{
      const style=resolveCaptionPreset(id);const fonts=path.join(tmp,'fonts');fs.mkdirSync(fonts);
      fs.copyFileSync(path.join(root,'assets/fonts',file),path.join(fonts,path.basename(file)));
      const ass=path.join(tmp,'font.ass');fs.writeFileSync(ass,buildPresetAssScript([{id:'q',start:0,end:1,text:'Caption font sample'}],style));
      const result=spawnSync(process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg',['-hide_banner','-loglevel','info','-f','lavfi','-i','color=s=540x960:r=1:d=1','-vf',`ass=${ass}:fontsdir=${fonts}`,'-threads','1','-f','null','-'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
      assert.equal(result.status,0,String(result.stderr));
      const selection=String(result.stderr).split('\n').filter(line=>line.includes('fontselect:')).join('\n');
      assert.ok(selection.includes(postscript), selection);
      assert.ok(!selection.includes('DejaVu'),selection);
      assert.equal(style.fontFamily,font);
      assert.ok(FONT_EM_PER_ASS_SIZE[style.fontFamily] > .3);
      assert.ok(fs.existsSync(path.join(fonts,path.basename(file))));
    }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  });
});
