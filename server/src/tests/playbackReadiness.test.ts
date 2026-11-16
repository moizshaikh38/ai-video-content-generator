import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mediaTimeAdvanced} from '../../../src/lib/editorPlaybackTime.js';
import fs from 'node:fs';import path from 'node:path';
test('auxiliary readiness rejects requested play without real media progress',()=>{
 assert.equal(mediaTimeAdvanced(null,31.92,false),false);
 assert.equal(mediaTimeAdvanced(31.92,31.92,false),false);
 assert.equal(mediaTimeAdvanced(31.92,31.923,false),false);
 assert.equal(mediaTimeAdvanced(31.92,32,false),true);
 assert.equal(mediaTimeAdvanced(31.92,32,true),false);
 assert.equal(mediaTimeAdvanced(32,31.92,false),false);
 assert.equal(mediaTimeAdvanced(31.92,NaN,false),false);
});
test('actual Studio wiring separates transport intent from auxiliary media progress and exact paused panel seek',()=>{
 const shell=fs.readFileSync(path.resolve(process.cwd(),'../src/components/editor/EditorShell.tsx'),'utf8');
 assert.match(shell,/isPlaying=\{isMediaAdvancing\}/);
 const panels=fs.readFileSync(path.resolve(process.cwd(),'../src/components/editor/PanelsPreview.tsx'),'utf8');
 assert.match(panels,/playing \? 0\.3 : 0\.001/);assert.match(panels,/\[time, playing\]/);
});
