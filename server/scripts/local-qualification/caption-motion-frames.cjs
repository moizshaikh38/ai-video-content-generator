/** Local frame-stepped capture only, not real-time playback or listening proof.
 * PUPPETEER_CORE_PATH=/path/to/puppeteer-core node caption-motion-frames.cjs PROJECT.json SOURCE.mp4 NEW_OUTPUT_DIR
 * Explicit seeks avoid treating the product's 150ms paused scrub tolerance as an exact-frame API.
 * No network except localhost, no mutation endpoints. Temporary public fixture removed in finally. */
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const pp=require(process.env.PUPPETEER_CORE_PATH||'/tmp/vireo-local-restore/ui-driver/node_modules/puppeteer-core');
const [project,source,out]=process.argv.slice(2);const sampleTimes=process.env.AUDIT_TIMES?JSON.parse(process.env.AUDIT_TIMES):null;if(sampleTimes)assert(Array.isArray(sampleTimes)&&sampleTimes.length>0&&sampleTimes.length<=240&&sampleTimes.every(t=>Number.isFinite(t)&&t>=0&&t<28.444));const frameCount=sampleTimes?sampleTimes.length:Number(process.env.AUDIT_FRAME_COUNT||240);assert(Number.isInteger(frameCount)&&frameCount>=1&&frameCount<=240);if(!project||!source||!out)throw Error('PROJECT SOURCE NEW_OUTPUT_DIR required');if(fs.existsSync(out))throw Error('Use new evidence directory');
const base=path.resolve(__dirname,'../../..'),fixture=path.join(base,'public/audit-motion'),port=5209;
if(fs.existsSync(fixture))throw Error('Existing fixture directory: refuse to overwrite');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(out,'preview'));fs.mkdirSync(fixture,{recursive:true});fs.copyFileSync(project,path.join(fixture,'project.json'));fs.copyFileSync(source,path.join(fixture,'source.mp4'));
const fd=fs.openSync(path.join(out,'vite.log'),'w');const server=cp.spawn(path.join(base,'node_modules/.bin/vite'),['--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:base,stdio:['ignore',fd,fd]});const sleep=n=>new Promise(r=>setTimeout(r,n));
(async()=>{let browser;try{
 let ready=false;for(let n=0;n<100;n++){try{if((await fetch(`http://127.0.0.1:${port}/harness-caption-motion.html`)).ok){ready=true;break}}catch{}await sleep(100)}assert(ready,'Local server not ready');
 browser=await pp.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:800,height:1520,deviceScaleFactor:1}});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>new URL(r.url()).hostname==='127.0.0.1'&&r.method()==='GET'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:${port}/harness-caption-motion.html`,{waitUntil:'networkidle0'});await page.waitForSelector('[data-testid="preview-layout-canvas"]');await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.readyState>=2));
 const canvas=await page.$('[data-testid="preview-layout-canvas"]');const rect=await canvas.boundingBox();assert(rect.width>=700,'Discard undersized canvas');const states=[];
 const cdp=await page.createCDPSession();await cdp.send('DOM.enable');await cdp.send('CSS.enable');const doc=await cdp.send('DOM.getDocument');const wordsNodes=await cdp.send('DOM.querySelectorAll',{nodeId:doc.root.nodeId,selector:'[data-selectable-item] span'});const platformFonts=[];for(const nodeId of wordsNodes.nodeIds){const f=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});if(f.fonts?.length)platformFonts.push(f);}
 for(let i=0;i<frameCount;i++){
  const t=sampleTimes?sampleTimes[i]:i<120?i/30:18+(i-120)/30;await page.evaluate(t=>{window.setAuditTime(t);document.querySelector('video').currentTime=t},t);
  await page.waitForFunction(t=>{const v=document.querySelector('video');return v&&!v.seeking&&Math.abs(v.currentTime-t)<.002},{timeout:4000},t);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await canvas.screenshot({path:path.join(out,'preview',String(i).padStart(4,'0')+'.png')});
  states.push(await page.evaluate(t=>({t,videoTime:document.querySelector('video').currentTime,text:[...document.querySelectorAll('[data-selectable-item]')].map(e=>e.textContent),words:[...document.querySelectorAll('[data-selectable-item] span')].filter(e=>e.children.length===0&&e.textContent.trim()).map(e=>({text:e.textContent,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right,y:e.getBoundingClientRect().y,bottom:e.getBoundingClientRect().bottom,zoom:getComputedStyle(e).zoom,transform:getComputedStyle(e).transform}))}),t));
 }
 fs.writeFileSync(path.join(out,'preview-states.json'),JSON.stringify({project,source,states,errors,rect,platformFonts},null,2));assert.deepEqual(errors,[]);console.log('PREVIEW_FRAME_CAPTURE_PASS',states.length);
}finally{if(browser)await browser.close();server.kill('SIGTERM');fs.rmSync(fixture,{recursive:true,force:true});fs.closeSync(fd)}})().catch(e=>{console.error(e);process.exitCode=1});
