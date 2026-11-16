const fs=require('fs'),cp=require('child_process'),puppeteer=require(process.env.PUPPETEER_CORE_PATH || '/tmp/vireo-local-restore/ui-driver/node_modules/puppeteer-core');
const r=JSON.parse(fs.readFileSync('/tmp/vireo-local-restore/persistence-result.json'));const procs=[];let browser;
(async()=>{const api=cp.spawn('/home/sandbox/avcg/server/node_modules/.bin/tsx',['scripts/local-qualification/render-recovered.mts'],{cwd:'/home/sandbox/avcg/server',env:{...process.env,KEEP_LOCAL_SERVER:'1',QUALIFY_CHIP:'1',QUALIFY_PANELS:'1',QUALIFY_INLINE_CROP:'1',...(process.env.QUALIFY_REAL_ANALYSIS==='1'?{QUALIFY_REAL_ANALYSIS:'1',PYTHON_PATH:'/tmp/vireo-local-restore/cv-env/bin/python'}:{})},stdio:['ignore',fs.openSync('/tmp/vireo-local-restore/ui-api.log','w'),'pipe']});procs.push(api);api.stderr.on('data',d=>fs.appendFileSync('/tmp/vireo-local-restore/ui-api.log',d));
const vite=cp.spawn('/home/sandbox/avcg/node_modules/.bin/vite',['--host','127.0.0.1','--port','5199'],{cwd:'/home/sandbox/avcg',env:{...process.env,VITE_API_URL:'http://127.0.0.1:5581/api'},stdio:['ignore',fs.openSync('/tmp/vireo-local-restore/vite.log','w'),'pipe']});procs.push(vite);
for(let i=0;i<400;i++){try{if(fs.readFileSync('/tmp/vireo-local-restore/ui-api.log','utf8').includes('LOCAL_UI_SERVER_READY')&&(await fetch('http://127.0.0.1:5199/harness-studio-e2e.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:1440,height:1000}});const page=await browser.newPage();const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',async x=>{if(x.url().includes('/api/')&&x.request().method()==='PATCH')writes.push({url:x.url(),status:x.status(),body:x.request().postData(),response:await x.text()})});
await page.goto('http://127.0.0.1:5199/harness-studio-e2e.html?clip='+r.clip_id,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForFunction(()=>document.body.innerText.includes('Main Video'),{timeout:15000});await page.screenshot({path:'/downloads/restored-editor-desktop.png'});

await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.videoWidth>0));
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crop')?.click());
await page.waitForSelector('[data-testid="inline-preview-crop"]');
await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="crop-stage"] video');return v&&v.readyState>=2&&!v.seeking});
await page.screenshot({path:'/downloads/inline-crop-before.png'});
const box=await page.$('[data-testid="crop-box"]');const bb=await box.boundingBox();
await page.mouse.move(bb.x+bb.width/2,bb.y+bb.height/2);await page.mouse.down();await page.mouse.move(bb.x+bb.width/2-25,bb.y+bb.height/2,{steps:8});await page.mouse.up();
const corner=await page.$('[data-testid="crop-corner-br"]');const cb=await corner.boundingBox();
await page.mouse.move(cb.x+cb.width/2-1,cb.y+cb.height/2-2);await page.mouse.down();await page.mouse.move(cb.x+cb.width/2-15,cb.y+cb.height/2-55,{steps:10});await page.mouse.up();
await page.screenshot({path:'/downloads/inline-crop-gesture.png'});
// Cancel must not mutate persisted data or create history entries.
await page.keyboard.press('Escape');
if(writes.length)throw Error('Gesture before Apply wrote data');
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crop')?.click());
if(!(await page.$eval('[data-testid="inline-preview-crop"]',e=>e.innerText)).includes('1.00x'))throw Error('Cancel leaked crop');
const b2=await(await page.$('[data-testid="crop-corner-br"]')).boundingBox();
await page.mouse.move(b2.x+b2.width/2-1,b2.y+b2.height/2-2);await page.mouse.down();await page.mouse.move(b2.x+b2.width/2-25,b2.y+b2.height/2-55,{steps:10});await page.mouse.up();
console.log('CANCEL_NO_WRITE_RESET');
await page.evaluate(()=>[...document.querySelectorAll('[data-testid="inline-preview-crop"] button')].find(b=>b.textContent.trim()==='Apply')?.click());
await page.click('button[title="Undo (Cmd+Z)"]');
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crop')?.click());
if(!(await page.$eval('[data-testid="inline-preview-crop"]',e=>e.innerText)).includes('1.00x'))throw Error('One undo did not restore crop');
await page.keyboard.press('Escape');await page.click('button[title="Redo (Cmd+Shift+Z)"]');
console.log('ONE_UNDO_REDO');
await page.click('button[title="Lock Track"]');
if(!await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crop')?.disabled))throw Error('Locked crop is enabled');
await page.click('button[title="Unlock Track"]');console.log('LOCKED_CROP_DISABLED');
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save')?.click());
for(let i=0;i<80&&writes.length<2;i++)await new Promise(r=>setTimeout(r,100));console.log('WRITES',writes.map(x=>({url:x.url,status:x.status,response:x.status===200?'ok':x.response})));if(writes.length<2||writes.some(w=>w.status!==200))throw Error('Save failed');
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('Main Video'));
await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.readyState>=2&&!v.seeking));await new Promise(r=>setTimeout(r,600));
await page.screenshot({path:'/downloads/inline-crop-reload.png'});
let state=await(await fetch('http://127.0.0.1:5581/__qualification/status')).json();if(process.env.SKIP_FRAMING_RENDER!=='1')for(const route of ['clips/'+r.clip_id+'/render','editor-projects/'+r.editor_id+'/render']){
 const res=await fetch('http://127.0.0.1:5581/api/'+route,{method:'POST',headers:{authorization:'Bearer e2e-studio-token','content-type':'application/json'},body:JSON.stringify({resolution:'720p'})});console.log('RENDER',route,res.status,await res.text());if(res.status!==202)throw Error('Not accepted');
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,300));state=await(await fetch('http://127.0.0.1:5581/__qualification/status')).json();if(['failed','completed'].includes(state.job?.status))break;}
 console.log('FINAL',state.job?.status,state.clip?.render_error_message);if(state.job?.status!=='completed')throw Error('Not complete');fs.copyFileSync('/tmp/vireo-local-restore/objects/local-clips/'+state.clip.output_storage_path,'/downloads/inline-crop-'+(route.startsWith('clips')?'clip':'editor')+'-api-720p.mp4');
}
const savedRes=await fetch('http://127.0.0.1:5581/api/editor-projects/'+r.editor_id,{headers:{authorization:'Bearer e2e-studio-token'}});const saved=(await savedRes.json()).data;
const crop=saved.tracks.find(t=>t.type==='VIDEO').items[0].crop;
console.log('SAVED_CROP',JSON.stringify(crop));if(!(crop.focusX>=0&&crop.focusX<=1&&crop.scale>1))throw Error('Move/resize was lost');
await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});
await page.waitForFunction(()=>document.body.innerText.includes('Main Video'));
await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Crop'),{timeout:10000});
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crop')?.scrollIntoView({inline:'center'}));
const cropButton=await page.evaluateHandle(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crop'));
await cropButton.asElement().tap();await page.waitForSelector('[data-testid="inline-preview-crop"]');
await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="crop-stage"] video');return v&&v.readyState>=2&&!v.seeking});
await page.screenshot({path:'/downloads/inline-crop-phone-before.png'});
const tc=await(await page.$('[data-testid="crop-corner-br"]')).boundingBox();const cdp=await page.createCDPSession();
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tc.x+tc.width/2-1,y:tc.y+tc.height/2-2}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tc.x+tc.width/2-20,y:tc.y+tc.height/2-35}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.screenshot({path:'/downloads/inline-crop-phone-touch.png'});
console.log('PHONE_TOUCH_ZOOM',await page.$eval('[data-testid="inline-preview-crop"]',e=>e.innerText));
await new Promise(r=>setTimeout(r,700));
const applyPhone=await page.evaluateHandle(()=>[...document.querySelectorAll('[data-testid="inline-preview-crop"] button')].find(b=>b.textContent.trim()==='Apply'));
const ab=await applyPhone.asElement().boundingBox();if(ab.y<0||ab.y+ab.height>844)throw Error('Phone Apply outside viewport');
console.log('PHONE_APPLY_BOX',ab,await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML,{x:ab.x+ab.width/2,y:ab.y+ab.height/2}));await page.evaluate(()=>{window.__touchEvents=[];for(const type of ['touchstart','touchend','pointerdown','pointerup','click'])document.addEventListener(type,e=>window.__touchEvents.push([type,e.target.tagName,e.target.textContent?.slice(0,35),e.defaultPrevented]),{capture:true,once:true})});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ab.x+ab.width/2,y:ab.y+ab.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});console.log('TOUCH_EVENTS',await page.evaluate(()=>window.__touchEvents));await new Promise(r=>setTimeout(r,500));console.log('PHONE_APPLY_REMAINS',await page.$$eval('[data-testid="inline-preview-crop"]',es=>es.length));
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Save')?.click());
for(let i=0;i<70&&writes.length<4;i++)await new Promise(r=>setTimeout(r,100));console.log('PHONE_WRITES',writes.map(w=>({status:w.status,response:w.status===200?'ok':w.response})));console.log('PHONE_BODY',await page.evaluate(()=>document.body.innerText.slice(0,350)));if(writes.length!==4||writes.some(w=>w.status!==200))throw Error('Touch save failed');
await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('Main Video'));
await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Crop'));
await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crop')?.click());await page.waitForSelector('[data-testid="inline-preview-crop"]');
await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="crop-stage"] video');return v&&v.readyState>=2&&!v.seeking});
await page.screenshot({path:'/downloads/inline-crop-phone-reload.png'});
console.log('PHONE_TOUCH_SAVE_RELOAD',await page.$eval('[data-testid="inline-preview-crop"]',e=>e.innerText));
if(process.env.SKIP_FRAMING_RENDER!=='1'){
 const res=await fetch('http://127.0.0.1:5581/api/clips/'+r.clip_id+'/render',{method:'POST',headers:{authorization:'Bearer e2e-studio-token','content-type':'application/json'},body:JSON.stringify({resolution:'720p'})});if(res.status!==202)throw Error('Phone render not accepted');
 for(let i=0;i<100;i++){await new Promise(r=>setTimeout(r,300));state=await(await fetch('http://127.0.0.1:5581/__qualification/status')).json();if(['failed','completed'].includes(state.job?.status))break;}
 if(state.job?.status!=='completed')throw Error('Phone render failed');fs.copyFileSync('/tmp/vireo-local-restore/objects/local-clips/'+state.clip.output_storage_path,'/downloads/inline-crop-phone-api-720p.mp4');console.log('PHONE_API_COMPLETED',state.clip.render_version);
}
fs.writeFileSync('/tmp/vireo-local-restore/inline-crop-ui-result.json',JSON.stringify({writes,state,errors},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();for(const p of procs)p.kill('SIGTERM')});
