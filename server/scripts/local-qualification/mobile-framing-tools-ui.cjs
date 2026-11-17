// LOCAL actual Studio/API read-only mobile toolbar qualification. Uses existing Beast fixture.
const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict'),puppeteer=require('/tmp/vireo-local-restore/ui-driver/node_modules/puppeteer-core');
const procs=[];let browser;
(async()=>{
 const fixture='/tmp/vireo-local-restore/beast-aligned-fixture.json';const f=JSON.parse(fs.readFileSync(fixture));
 for(const [bin,args,cwd,env,log] of [
  ['/home/sandbox/avcg/server/node_modules/.bin/tsx',['scripts/local-qualification/render-recovered.mts'],'/home/sandbox/avcg/server',{KEEP_LOCAL_SERVER:'1',QUALIFICATION_FIXTURE:fixture,QUALIFICATION_SOURCE:'/downloads/recovered-source/beast-yacht-120-210.mp4'},'/tmp/mobile-api.log'],
  ['/home/sandbox/avcg/node_modules/.bin/vite',['--host','127.0.0.1','--port','5199'],'/home/sandbox/avcg',{VITE_API_URL:'http://127.0.0.1:5581/api'},'/tmp/mobile-vite.log']]){
  const p=cp.spawn(bin,args,{cwd,env:{...process.env,...env},detached:true,stdio:['ignore',fs.openSync(log,'w'),fs.openSync(log,'a')]});procs.push(p);
 }
 for(let n=0;n<300;n++){try{if(fs.readFileSync('/tmp/mobile-api.log','utf8').includes('LOCAL_UI_SERVER_READY')&&(await fetch('http://127.0.0.1:5199/harness-studio-e2e.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:390,height:844,isMobile:true,hasTouch:true}});
 const page=await browser.newPage(),errors=[],writes=[],metrics=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/')&&['PATCH','DELETE'].includes(r.method()))writes.push(r.url())});
 await page.goto('http://127.0.0.1:5199/harness-studio-e2e.html?clip='+f.clip_id,{waitUntil:'domcontentloaded'});
 if(process.env.CAPTURE_BASELINE==='1'){
   await page.waitForSelector('[data-testid="toolbar-layout"]',{visible:true});await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.readyState>=2&&!v.seeking));await new Promise(r=>setTimeout(r,300));await page.screenshot({path:'/downloads/mobile-framing-before.png'});console.log('baseline captured');return;
 }
 const toggle='[data-testid="mobile-framing-toggle"]';const toolbar='[data-testid="preview-framing-tools"]';
 await page.waitForSelector(toggle,{visible:true});await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.readyState>=2&&!v.seeking));
 const state=()=>page.evaluate(()=>{const bar=document.querySelector('[data-testid="preview-framing-tools"]'),summary=document.querySelector('[data-testid="mobile-framing-summary"]'),video=[...document.querySelectorAll('video')].find(v=>v.readyState>=2);const rect=x=>{const r=x.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};return {expanded:document.querySelector('[data-testid="mobile-framing-toggle"]').getAttribute('aria-expanded'),toolbarDisplay:getComputedStyle(bar).display,summary:rect(summary),video:video?rect(video):null,pageWidth:document.documentElement.scrollWidth}});
 await new Promise(r=>setTimeout(r,300));metrics.push(await state());assert.equal(metrics[0].expanded,'false');assert.equal(metrics[0].toolbarDisplay,'none');
 await page.screenshot({path:'/downloads/mobile-framing-collapsed.png'});
 await page.tap(toggle);await page.waitForSelector(toolbar,{visible:true});await new Promise(r=>setTimeout(r,200));metrics.push(await state());assert.equal(metrics[1].expanded,'true');
 await page.screenshot({path:'/downloads/mobile-framing-expanded.png'});
 await page.tap('[data-testid="toolbar-layout"]');await page.waitForSelector('[role="menu"][aria-label="Scene layout"]',{visible:true});await page.screenshot({path:'/downloads/mobile-framing-layout-menu.png'});await page.keyboard.press('Escape');
 await page.$eval('button[title^="Background:"]',el=>el.click());await page.waitForFunction(()=>document.body.innerText.includes('Fit shape'));await page.screenshot({path:'/downloads/mobile-framing-background.png'});
 const bg=await page.$eval('input[type=range]',el=>el.closest('.absolute')?.getBoundingClientRect().toJSON());if(bg){assert.ok(bg.x>=52);assert.ok(bg.right<=355)}await page.keyboard.press('Escape');
 await page.tap('button[title^="Tracker:"]');await page.waitForFunction(()=>document.body.innerText.includes('Manual subject tracking'));await page.screenshot({path:'/downloads/mobile-framing-tracker.png'});await page.keyboard.press('Escape');
 await page.tap(toggle);await new Promise(r=>setTimeout(r,200));assert.equal((await state()).expanded,'false');
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector(toggle,{visible:true});assert.equal((await state()).expanded,'false');
 for(const width of [360,320]){
  await page.setViewport({width,height:844,isMobile:true,hasTouch:true});await page.tap(toggle);await page.$eval('button[title^="Background:"]',el=>el.click());await page.waitForFunction(()=>document.body.innerText.includes('Fit shape'));
  const rect=await page.$eval('button[title^="Background:"]',el=>el.nextElementSibling.getBoundingClientRect().toJSON());assert.ok(rect.x>=50);assert.ok(rect.right<=width);await page.screenshot({path:'/downloads/mobile-framing-background-'+width+'.png'});await page.keyboard.press('Escape');await page.tap(toggle);
 }
 await page.setViewport({width:1440,height:1000,isMobile:false,hasTouch:false});await page.waitForSelector(toolbar,{visible:true});await new Promise(r=>setTimeout(r,250));await page.screenshot({path:'/downloads/mobile-framing-desktop-unchanged.png'});
 assert.equal(await page.$eval('[data-testid="mobile-framing-summary"]',el=>getComputedStyle(el).display),'none');assert.equal(writes.length,0);assert.equal(errors.length,0);assert.ok(metrics[0].pageWidth<=390);
 console.log(JSON.stringify({status:'passed',metrics,errors,writes},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();for(const p of procs){try{process.kill(-p.pid,'SIGTERM')}catch{}}});
