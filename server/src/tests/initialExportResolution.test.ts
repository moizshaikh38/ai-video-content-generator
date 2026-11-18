import{test}from'node:test';import assert from'node:assert/strict';import{initialExportResolution}from'../shared/initialExportResolution.js';
test('a new configured720p clip opens at720p before any completed render',()=>assert.equal(initialExportResolution({render_resolution:'720p'}),'720p'));
test('configured next export wins over older completed metadata',()=>assert.equal(initialExportResolution({render_resolution:'720p',render_resolution_requested:'1080p'}),'720p'));
test('valid legacy completed resolution is preserved without configuration',()=>assert.equal(initialExportResolution({render_resolution_requested:'1440p'}),'1440p'));
test('invalid configuration does not hide valid legacy metadata',()=>assert.equal(initialExportResolution({render_resolution:'bad',render_resolution_requested:'2160p'}),'2160p'));
test('missing or invalid values use the established1080p fallback',()=>{for(const c of [null,undefined,{}, {render_resolution:'bad',render_resolution_requested:'bad'}])assert.equal(initialExportResolution(c),'1080p');});
test('all configured supported tiers retain the configured selection',()=>{for(const tier of ['720p','1080p','1440p','2160p']as const)assert.equal(initialExportResolution({render_resolution:tier}),tier);});
