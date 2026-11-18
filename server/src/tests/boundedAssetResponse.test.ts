import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {readBoundedAssetResponse} from '../utils/boundedAssetResponse.js';

test('bounded body preserves bytes exactly up to budget',async()=>{
 assert.deepEqual(await readBoundedAssetResponse(new Response(new Uint8Array([1,2,3,4])),4),Buffer.from([1,2,3,4]));
});
test('oversized and malformed declared lengths are rejected before buffering',async()=>{
 for(const length of ['5','-1','abc','9007199254740992']){
  let cancelled=false;
  const body=new ReadableStream({cancel(){cancelled=true;}});
  await assert.rejects(readBoundedAssetResponse(new Response(body,{headers:{'content-length':length}}),4),/byte budget|invalid length/);
  assert.equal(cancelled,true);
 }
});
test('chunked body cannot evade limit without a length header',async()=>{
 let cancelled=false,index=0;
 const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array([++index,2,3]));},cancel(){cancelled=true;}});
 await assert.rejects(readBoundedAssetResponse(new Response(body),4),/byte budget/);
 assert.equal(cancelled,true);
});
test('falsely small declared length does not disable stream byte limit',async()=>{
 await assert.rejects(readBoundedAssetResponse(new Response(new Uint8Array(6),{headers:{'content-length':'1'}}),4),/byte budget/);
});
test('empty and interrupted bodies fail without partial bytes',async()=>{
 await assert.rejects(readBoundedAssetResponse(new Response(null),4),/no body/);
 await assert.rejects(readBoundedAssetResponse(new Response(new Uint8Array(0)),4),/empty/);
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1]));controller.error(new Error('synthetic abort'));}});
 await assert.rejects(readBoundedAssetResponse(new Response(stream),4),/synthetic abort/);
});
test('invalid limits are rejected',async()=>{
 for(const budget of [0,-1,NaN,1.5])await assert.rejects(readBoundedAssetResponse(new Response('x'),budget),/budget/);
});
test('preload checks current destination and bounds time/body before writing',()=>{
 const source=fs.readFileSync(path.resolve('src/services/proEditorService.ts'),'utf8');
 const preload=source.slice(source.indexOf('public static async preloadRemoteOverlayAssets'),source.indexOf('/** Save-time gate'));
 assert.match(preload,/await validateEditorSourcePath\(project.user_id, rawPath\)/);
 assert.match(preload,/redirect: 'manual', signal: AbortSignal.timeout\(EDITOR_OVERLAY_TIMEOUT_MS\)/);
 assert.match(preload,/await readBoundedAssetResponse\(res\)/);
 assert.doesNotMatch(preload,/res.arrayBuffer\(/);
});
