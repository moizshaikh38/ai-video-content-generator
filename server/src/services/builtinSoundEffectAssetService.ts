import fs from'node:fs';import path from'node:path';import os from'node:os';import{execFileSync}from'node:child_process';import ffmpegStatic from'ffmpeg-static';
import{builtinSoundEffectId,type BuiltinSoundEffectId}from'../shared/builtinSoundEffectAssets.js';
/** Static synthesis recipes, no caller-controlled filter/path fragments. Item
 * trimming, level, fades, timing and speech ducking remain in the normal mixer. */
const recipes:Record<BuiltinSoundEffectId,string>={
 ding:'sine=f=1400:d=2:r=44100',
 pop:'sine=f=880:d=2:r=44100',
 sub_bass:'sine=f=80:d=2:r=44100',
 whoosh:'anoisesrc=d=2:c=pink:r=44100:s=137,lowpass=f=1200',
 riser:'aevalsrc=0.125*sin(2*PI*(400*t+300*t*t)):s=44100:d=2',
};
/** Resolve only an exact builtin into a fresh private child directory. Existing
 * cache files/symlinks never confer provenance. Nothing is downloaded. */
export function cacheBuiltinSoundEffect(value:unknown,renderDirectory:string):string|null {
 const id=builtinSoundEffectId(value);if(!id)return null;
 const tmp=fs.realpathSync(os.tmpdir()),root=fs.realpathSync(renderDirectory);
 if(root===tmp||!root.startsWith(tmp+path.sep)||!fs.statSync(root).isDirectory())throw Error('Built-in sound cache requires a private render directory.');
 const dir=fs.mkdtempSync(path.join(root,'builtin-sfx-')),target=path.join(dir,id+'.wav');
 try{execFileSync((ffmpegStatic as unknown as string)||'ffmpeg',['-nostdin','-v','error','-threads','1','-filter_threads','1','-f','lavfi','-i',recipes[id],'-t','2','-ac','1','-ar','44100','-c:a','pcm_s16le','-n',target],{timeout:10000,stdio:'pipe'});if(!fs.statSync(target).isFile()||fs.statSync(target).size<44)throw Error('Built-in sound synthesis returned no audio.');return target;}
 catch(error){fs.rmSync(dir,{recursive:true,force:true});throw error;}
}
