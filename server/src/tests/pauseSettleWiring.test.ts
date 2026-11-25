import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const src=fs.readFileSync(new URL('../../../src/hooks/useEditorPlayback.ts',import.meta.url),'utf8');
// Static listener-order guard (not a React render test): the 'play' listeners must arm and never reset the pause owner.
test("every 'play' listener is free of pause-owner reset; reset is only on source lifecycle events",()=>{
 const play=[...src.matchAll(/addEventListener\('play',\s*(\w+)\)/g)].map(m=>m[1]);assert.ok(play.length>=1);
 for(const h of play){const body=src.match(new RegExp('const '+h+'\\s*=\\s*\\(\\)\\s*=>\\s*(\\{[^\\n]*\\}|[^\\n]*)'))?.[1]??'';assert.ok(body.length>0,h);assert.ok(!/reset\(/.test(body),h+' must not reset');}
 assert.ok(play.some(h=>new RegExp('const '+h+'[^\\n]*onPlay\\(').test(src)),'a play listener arms via onPlay');
 const life=[...src.matchAll(/addEventListener\('(emptied|loadstart)',\s*(\w+)\)/g)];assert.equal(life.length,2);
 for(const m of life)assert.ok(new RegExp('const '+m[2]+'[^\\n]*reset\\(').test(src),m[2]+' resets');
 assert.ok(/const handlePause = \(\) => \{ if\(!v\.paused\)return;/.test(src),'stale pause guard first in handlePause');});
test('pauseForEdit ends the pause-owner run right after v.pause() and before its own receipt',()=>{
 const i=src.indexOf('const pauseForEdit');assert.ok(i>0);const body=src.slice(i,src.indexOf('const togglePlay',i));
 const a=body.indexOf('v.pause()'),b=body.indexOf('pauseSettle.endRun()'),c=body.indexOf('onTimeUpdateRef.current?.(');
 assert.ok(a>0&&b>a&&c>b,'order: v.pause(), endRun(), receipt');
 assert.ok(/\}, \[pauseSettle\]\);/.test(body));});
