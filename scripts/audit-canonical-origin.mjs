import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {pages,origin} from '../site-pages/catalog.mjs';
import {extraPages} from '../site-pages/extra-pages.mjs';
import {editorLessons} from '../site-pages/editor-lessons.mjs';
const root=process.env.SITE_OUT||'dist';
assert.equal(origin,'https://vireoclip.com','Canonical origin must be the verified custom domain');
const routes=[...pages,...extraPages].map(p=>p.path).concat(editorLessons.map(p=>'/resources/learning-center/'+p.id),'/tools/ai-gaming-clip-generator/');
assert.equal(new Set(routes).size,routes.length);
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
const locations=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert.deepEqual(new Set(locations),new Set(['/',...routes].map(p=>origin+p)));
assert.equal(locations.length,routes.length+1,'No duplicate sitemap locations');
for(const route of routes){
 const html=fs.readFileSync(path.join(root,route,'index.html'),'utf8');
 const canonical=[...html.matchAll(/<link\b(?=[^>]*\brel=["']canonical["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]);
 assert.deepEqual(canonical,[origin+route],route+' canonical');
 for(const property of ['og:url','og:image']){
  const matches=[...html.matchAll(new RegExp('<meta\\b(?=[^>]*\\bproperty=["\\\']'+property+'["\\\'])[^>]*\\bcontent=["\\\']([^"\\\']+)["\\\'][^>]*>','gi'))];
  assert.equal(matches.length,1,route+' '+property+' count');
  const url=new URL(matches[0][1]);assert.equal(url.origin,origin,route+' '+property+' origin');
  if(property==='og:url')assert.equal(url.href,origin+route);
  else assert(fs.existsSync(path.join(root,url.pathname)),route+' social image');
 }
 assert(!html.includes('https://vireoclip.vercel.app'),route+' old canonical origin');
}
const robots=fs.readFileSync(path.join(root,'robots.txt'),'utf8');assert(robots.includes('Sitemap: '+origin+'/sitemap.xml'));
assert(!sitemap.includes('vireoclip.vercel.app'));assert(!robots.includes('vireoclip.vercel.app'));
console.log(`PASS canonical/OG origin for ${routes.length} static subpages, ${locations.length} exact sitemap URLs including homepage, and robots.`);
