import test from 'node:test';import assert from 'node:assert/strict';import dns from 'node:dns/promises';import {config}from'../config/index.js';import{pinnedHttpsAssetFetch}from'../utils/pinnedHttpsAssetFetch.js';
test('pinned transport refuses unsupported schemes and URL credentials before DNS',async()=>{
 for(const url of ['http://example.com/a','file:///tmp/a','https://user:password@example.com/a'])await assert.rejects(pinnedHttpsAssetFetch(url,AbortSignal.timeout(100)),{code:'EDITOR_SOURCE_NOT_ALLOWED'});
});
test('production direct mapped-private addresses are rejected without a request',async()=>{
 const old=config.isProduction;(config as any).isProduction=true;try{
  for(const ip of ['127.0.0.1','[::1]','[::ffff:7f00:1]','169.254.169.254'])await assert.rejects(pinnedHttpsAssetFetch(`https://${ip}/synthetic`,AbortSignal.timeout(100)),{code:'SSRF_BLOCKED'});
 }finally{(config as any).isProduction=old}
});
test('mixed public/private DNS answers fail closed before connecting',async()=>{
 const old=dns.lookup;(dns as any).lookup=async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}];try{
  await assert.rejects(pinnedHttpsAssetFetch('https://asset.example.invalid/a',AbortSignal.timeout(100)),{code:'SSRF_BLOCKED'});
 }finally{dns.lookup=old}
});
test('unresponsive resolution respects abort budget without starting TLS',async()=>{
 const old=dns.lookup;(dns as any).lookup=async()=>new Promise(()=>{});try{
  const controller=new AbortController();const promise=pinnedHttpsAssetFetch('https://asset.example.invalid/a',controller.signal);controller.abort(new Error('synthetic DNS deadline'));await assert.rejects(promise,/synthetic DNS deadline/);
 }finally{dns.lookup=old}
});
