import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {transform} from 'esbuild';

const source=fs.readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
for(const dev of [false,true])for(const harness of [false,true]){
 test(`studio fixture is development-only: dev=${dev}, harness=${harness}`,async()=>{
  // Compile the actual entry condition and mount branch. Dependency mocks only
  // record the chosen mount; they do not represent full frontend acceptance.
  const entry=source.replace(/^import .*;\r?$/mg,'').replace("import('./harness/studioHarness');","globalThis.fixtureMounts++;");
  const result=await transform(entry,{loader:'tsx',format:'iife',target:'es2020',define:{'import.meta.env.DEV':String(dev)},minify:true});
  const counts={fixtureMounts:0,appMounts:0};const context:any={...counts,URLSearchParams,window:{location:{search:harness?'?harness=studio':''}},document:{getElementById(){return {}; }},React:{StrictMode:'strict',createElement(){return {}; }},App(){},ReactDOM:{createRoot(){return{render(){context.appMounts++;}};}}};
  vm.runInNewContext(result.code,context);assert.equal(context.fixtureMounts,dev&&harness?1:0);assert.equal(context.appMounts,dev&&harness?0:1);
 });
}
test('production transform removes the test-only dynamic import',async()=>{
 const result=await transform(source,{loader:'tsx',format:'esm',define:{'import.meta.env.DEV':'false'},minify:true});
 assert(!result.code.includes('harness/studioHarness'));assert(!result.code.includes('harness=studio'));
});
