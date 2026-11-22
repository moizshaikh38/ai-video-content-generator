import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyGlassSurfaces } from '../build-glass-surfaces.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'vireo-glass-test-'));
  try {
    const out = join(root, 'dist');
    const css = join(root, 'shared.css');
    await mkdir(join(out, 'tools/captions'), { recursive: true });
    await writeFile(css, ':root{--vc-glass-bg:rgba(22,22,22,.78)}@media(prefers-reduced-transparency:reduce){}');
    await run({ out, css });
  } finally { await rm(root, { recursive: true, force: true }); }
}
const html = '<!doctype html><html><head><title>Captions</title><meta name="description" content="unchanged"></head><body><header><nav id="site-nav"><a href="/#faq">FAQ</a></nav></header><main><video src="/demo.mp4"></video></main><script src="/site-assets/demo.js" defer></script></body></html>';

test('adds shared style and accessible storage link without changing existing body or scripts', () => fixture(async ({out,css}) => {
  const path=join(out,'tools/captions/index.html');await writeFile(path,html);
  const result=await applyGlassSurfaces(out,css);const after=await readFile(path,'utf8');
  assert.equal(result.pages,1);assert.match(after,/data-vc-shared-glass/);assert.match(after,/data-vc-storage-link/);
  assert.equal(after.replace('<link rel="stylesheet" data-vc-shared-glass href="/site-assets/glass-surfaces.css">','').replace('<a data-vc-storage-link href="/privacy">Privacy &amp; storage</a>',''),html);
  assert.equal(await readFile(join(out,'site-assets/glass-surfaces.css'),'utf8'),await readFile(css,'utf8'));
}));
test('is byte-idempotent', () => fixture(async ({out,css}) => {
  const path=join(out,'tools/captions/index.html');await writeFile(path,html);await applyGlassSurfaces(out,css);const once=await readFile(path);await applyGlassSurfaces(out,css);assert.deepEqual(await readFile(path),once);
}));
test('does not alter app bootstrap or a media frame', () => fixture(async ({out,css}) => {
  const app='<html><head></head><body><div id="root"></div><script type="module" src="/assets/index.js"></script></body></html>';
  const frame='<video src="/demo.mp4"></video>';await writeFile(join(out,'index.html'),app);await writeFile(join(out,'frame.html'),frame);assert.equal((await applyGlassSurfaces(out,css)).pages,0);assert.equal(await readFile(join(out,'index.html'),'utf8'),app);assert.equal(await readFile(join(out,'frame.html'),'utf8'),frame);
}));
test('fails closed on malformed navigation HTML', () => fixture(async ({out,css}) => {
  await writeFile(join(out,'bad.html'),'<nav id="site-nav"></nav>');await assert.rejects(applyGlassSurfaces(out,css),/head/);
}));
test('fails closed when shared material or accessibility fallback is missing', () => fixture(async ({out,css}) => {
  await writeFile(css,'body{color:white}');await assert.rejects(applyGlassSurfaces(out,css),/incomplete/);
}));
test('does not insert or enable analytics', () => fixture(async ({out,css}) => {
  const path=join(out,'tools/captions/index.html');await writeFile(path,html);await applyGlassSurfaces(out,css);const after=await readFile(path,'utf8');assert.doesNotMatch(after,/analytics|googletagmanager|gtag\(/i);assert.equal((after.match(/<script\b/g)||[]).length,1);
}));

test('static menus escape a nested header backdrop and keep an opaque unsupported-selector fallback', async () => {
 const css = await readFile(new URL('../../src/styles/glass-surfaces.css', import.meta.url), 'utf8');
 assert.ok(css.includes('body>header:has(.site-nav.is-open)'));
 assert.ok(css.includes('body>header:has(.site-nav .nav-group[open]){backdrop-filter:none;-webkit-backdrop-filter:none}'));
 assert.ok(css.includes('@supports not selector(:has(*))'));
});
