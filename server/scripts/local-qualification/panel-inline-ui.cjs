// LOCAL ONLY: real Studio panel inline crop, desktop/touch apply/cancel, save/reload and bounded720p API.
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
 page.on('response',res=>{if(res.request().method()==='PATCH'&&res.url().includes('/api/')){assert.equal(res.status(),200)}});page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/')&&['PATCH','DELETE'].includes(r.method()))writes.push(r.url())});
 await page.goto('http://127.0.0.1:5199/harness-studio-e2e.html?clip='+f.clip_id,{waitUntil:'domcontentloaded'});
 const clickText=async(text)=>{await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()===text),{},text);await page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text).click(),text)};
 const slots=async()=>{const st=await(await fetch('http://127.0.0.1:5581/api/editor-projects/'+f.editor_id,{headers:{authorization:'Bearer e2e-studio-token'}})).json();return (st.data||st.project||st).tracks.find(t=>t.type==='VIDEO').items[0].panels.slots};
 const original=await slots();
 const save=async()=>{const expected=writes.length+2;await clickText('Save');for(let i=0;i<100;i++){if(writes.length>=expected)break;await new Promise(r=>setTimeout(r,100))}assert.equal(writes.length,expected);await new Promise(r=>setTimeout(r,250))};
 const dragCorner=async()=>{const r=await page.$eval('[data-testid="crop-stage"]',e=>e.getBoundingClientRect().toJSON());const box=await page.$eval('[data-testid="crop-box"]',e=>e.getBoundingClientRect().toJSON());const x=box.right-2,y=box.bottom-2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-r.width*.2,y-r.height*.2,{steps:8});await page.mouse.up()};
 await page.waitForSelector('[data-testid="mobile-framing-toggle"]',{visible:true});await page.tap('[data-testid="mobile-framing-toggle"]');await clickText('Panel 1');await page.waitForSelector('[data-testid="inline-preview-crop"]',{visible:true});
 await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="inline-preview-crop"] video')].every(v=>v.readyState>=2&&!v.seeking));
 await page.screenshot({path:'/downloads/panel-inline-phone-before.png'});
 console.log('CROP_RECT',await page.$eval('[data-testid="crop-stage"]',e=>e.getBoundingClientRect().toJSON()));
 await dragCorner();await page.tap('button[aria-label="Close"]');await page.waitForFunction(()=>!document.querySelector('[data-testid="inline-preview-crop"]'));
 assert.deepEqual(await slots(),original);assert.equal(writes.length,0);
 await page.setViewport({width:1440,height:1000,isMobile:false,hasTouch:false});await new Promise(r=>setTimeout(r,350));await clickText('Panel 1');await page.waitForSelector('[data-testid="inline-preview-crop"]',{visible:true});
 await page.screenshot({path:'/downloads/panel-inline-desktop-before.png'});
 await dragCorner();await clickText('Apply');await save();const changed=await slots();assert.notDeepEqual(changed[0],original[0]);assert.deepEqual(changed[1],original[1]);assert.ok(changed[0].scale>1);assert.ok(writes.length>=2);console.log('DESKTOP_APPLY_SAVE',changed);
 await page.reload({waitUntil:'domcontentloaded'});await clickText('Panel 1');await page.waitForSelector('[data-testid="inline-preview-crop"]',{visible:true});await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="inline-preview-crop"] video')].every(v=>v.readyState>=2&&!v.seeking));await page.screenshot({path:'/downloads/panel-inline-desktop-reloaded.png'});assert.deepEqual(await slots(),changed);await page.keyboard.press('Escape');
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.waitForSelector('[data-testid="mobile-framing-toggle"]',{visible:true});await page.tap('[data-testid="mobile-framing-toggle"]');await clickText('Panel 2');await page.waitForSelector('[data-testid="inline-preview-crop"]',{visible:true});
 const r=await page.$eval('[data-testid="crop-stage"]',e=>e.getBoundingClientRect().toJSON());const b=await page.$eval('[data-testid="crop-box"]',e=>e.getBoundingClientRect().toJSON());const cdp=await page.createCDPSession();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.right-2,y:b.bottom-2}]});for(let n=1;n<=6;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.right-2-r.width*.18*n/6,y:b.bottom-2-r.height*.18*n/6}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.screenshot({path:'/downloads/panel-inline-phone-adjusted.png'});
 await page.tap('button.bg-white.text-black');await page.waitForFunction(()=>!document.querySelector('[data-testid="inline-preview-crop"]'));await save();const phone=await slots();assert.deepEqual(phone[0],changed[0]);assert.notDeepEqual(phone[1],changed[1]);assert.ok(phone[1].scale>1);console.log('TOUCH_APPLY_SAVE',phone);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('[data-testid="mobile-framing-toggle"]',{visible:true});await page.waitForFunction(()=>[...document.querySelectorAll('[data-testid="panels-preview"] video')].length>0&&[...document.querySelectorAll('[data-testid="panels-preview"] video')].every(v=>v.readyState>=2&&!v.seeking));await new Promise(r=>setTimeout(r,300));await page.screenshot({path:'/downloads/panel-inline-phone-reloaded.png'});assert.deepEqual(await slots(),phone);
 const res=await fetch('http://127.0.0.1:5581/api/clips/'+f.clip_id+'/render',{method:'POST',headers:{authorization:'Bearer e2e-studio-token','content-type':'application/json'},body:JSON.stringify({resolution:'720p'})});assert.equal(res.status,202);let state;
 for(let n=0;n<150;n++){await new Promise(r=>setTimeout(r,300));state=await(await fetch('http://127.0.0.1:5581/__qualification/status')).json();if(['completed','failed'].includes(state.job?.status))break}assert.equal(state.job?.status,'completed');fs.copyFileSync('/tmp/vireo-local-restore/objects/local-clips/'+state.clip.output_storage_path,'/downloads/panel-inline-after-720p.mp4');assert.equal(errors.length,0);

 console.log(JSON.stringify({status:'passed',metrics,errors,writes},null,2));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();for(const p of procs){try{process.kill(-p.pid,'SIGTERM')}catch{}}});
