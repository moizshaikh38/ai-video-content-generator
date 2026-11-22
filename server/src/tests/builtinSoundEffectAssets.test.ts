import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import{execFileSync}from'node:child_process';
import{BUILTIN_SOUND_EFFECT_IDS,builtinSoundEffectId}from'../shared/builtinSoundEffectAssets.js';
import{cacheBuiltinSoundEffect}from'../services/builtinSoundEffectAssetService.js';
import{isAllowedClientEditorSourcePath}from'../utils/editorAssetValidator.js';
import{assertRenderAssetOwnership}from'../utils/renderAssetOwnership.js';
import{ProEditorService}from'../services/proEditorService.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'vireo-builtin-sfx-test-'));
test('only exact canonical built-in SFX references are accepted',()=>{
 for(const id of BUILTIN_SOUND_EFFECT_IDS){assert.equal(builtinSoundEffectId(`builtin://sfx/${id}.wav`),id);assert(isAllowedClientEditorSourcePath('owner',`builtin://sfx/${id}.wav`));}
 for(const value of [null,{},'builtin://sfx/unknown.wav','builtin://sfx/../ding.wav','builtin://sfx/ding.wav?x=1','builtin://sfx/ding.wav#x','builtin://sfx/%64ing.wav','BUILTIN://sfx/ding.wav','builtin://other/ding.wav','builtin://sfx/ding.mp3','builtin://sfx/ding.wav/extra']){assert.equal(builtinSoundEffectId(value),null);assert.equal(cacheBuiltinSoundEffect(value,root),null);if(typeof value==='string')assert(!isAllowedClientEditorSourcePath('owner',value));}
});
test('every canonical built-in becomes real mono PCM audio inside a fresh private child',()=>{
 for(const id of BUILTIN_SOUND_EFFECT_IDS){const file=cacheBuiltinSoundEffect(`builtin://sfx/${id}.wav`,root)!;assert(file.startsWith(root+path.sep));assert(fs.statSync(file).isFile());const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8'})),a=probe.streams[0];assert.equal(probe.streams.length,1);assert.equal(a.codec_name,'pcm_s16le');assert.equal(a.sample_rate,'44100');assert.equal(a.channels,1);assert.equal(Number(a.duration),2);}
});
test('canonical reference passes preflight, actual preload resolves it and postflight verifies the private file',async()=>{
 const item:any={id:'sound',type:'AUDIO',source_path:'builtin://sfx/ding.wav',timeline_start:1};const p:any={user_id:'owner',tracks:[{type:'VIDEO',items:[{timeline_start:0,source_path:'ignored-owned-primary'}]},{type:'AUDIO',items:[item]}]};assert.doesNotThrow(()=>assertRenderAssetOwnership(p,root));await ProEditorService.preloadRemoteOverlayAssets(p,root);assert(item.source_path.startsWith(root+path.sep));assert.doesNotThrow(()=>assertRenderAssetOwnership(p,root));
});
test('private cache root, fresh names and symlink escapes remain guarded',()=>{
 assert.throws(()=>cacheBuiltinSoundEffect('builtin://sfx/ding.wav',os.tmpdir()),/private render directory/);const a=cacheBuiltinSoundEffect('builtin://sfx/ding.wav',root)!,b=cacheBuiltinSoundEffect('builtin://sfx/ding.wav',root)!;assert.notEqual(a,b);fs.writeFileSync(a,'tampered');assert(fs.statSync(b).size>44);const outside=path.join(root,'outside.wav'),render=path.join(root,'render');fs.writeFileSync(outside,'private');fs.mkdirSync(render);fs.symlinkSync(outside,path.join(render,'escape.wav'));const p:any={user_id:'owner',tracks:[{type:'VIDEO',items:[{timeline_start:0}]},{type:'AUDIO',items:[{timeline_start:0,source_path:path.join(render,'escape.wav')}]}]};assert.throws(()=>assertRenderAssetOwnership(p,render),{code:'EDITOR_ASSET_OWNERSHIP_REQUIRED'});
});
// Tiny generated test WAVs are separate from retained user/source media.
