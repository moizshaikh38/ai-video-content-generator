const fs=require('fs'),cp=require('child_process'),puppeteer=require(process.env.PUPPETEER_CORE_PATH || '/tmp/vireo-local-restore/ui-driver/node_modules/puppeteer-core');
const r=JSON.parse(fs.readFileSync('/tmp/vireo-local-restore/persistence-result.json'));const procs=[];let browser;
(async()=>{const api=cp.spawn('/home/sandbox/avcg/server/node_modules/.bin/tsx',['scripts/local-qualification/render-recovered.mts'],{cwd:'/home/sandbox/avcg/server',env:{...process.env,KEEP_LOCAL_SERVER:'1',QUALIFY_CHIP:'1',QUALIFY_PANELS:'1',QUALIFY_INLINE_CROP:'1',...(process.env.QUALIFY_REAL_ANALYSIS==='1'?{QUALIFY_REAL_ANALYSIS:'1',PYTHON_PATH:'/tmp/vireo-local-restore/cv-env/bin/python'}:{})},stdio:['ignore',fs.openSync('/tmp/vireo-local-restore/ui-api.log','w'),'pipe']});procs.push(api);api.stderr.on('data',d=>fs.appendFileSync('/tmp/vireo-local-restore/ui-api.log',d));
const vite=cp.spawn('/home/sandbox/avcg/node_modules/.bin/vite',['--host','127.0.0.1','--port','5199'],{cwd:'/home/sandbox/avcg',env:{...process.env,VITE_API_URL:'http://127.0.0.1:5581/api'},stdio:['ignore',fs.openSync('/tmp/vireo-local-restore/vite.log','w'),'pipe']});procs.push(vite);
for(let i=0;i<400;i++){try{if(fs.readFileSync('/tmp/vireo-local-restore/ui-api.log','utf8').includes('LOCAL_UI_SERVER_READY')&&(await fetch('http://127.0.0.1:5199/harness-studio-e2e.html')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
browser=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:1440,height:1000}});const page=await browser.newPage();const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',async x=>{if(x.url().includes('/api/')&&x.request().method()==='PATCH')writes.push({url:x.url(),status:x.status(),body:x.request().postData(),response:await x.text().catch(()=>'<body unavailable>')})});
await page.goto('http://127.0.0.1:5199/harness-studio-e2e.html?clip='+r.clip_id,{waitUntil:'domcontentloaded',timeout:20000});await page.waitForFunction(()=>document.body.innerText.includes('Main Video'),{timeout:15000});await page.screenshot({path:'/downloads/restored-editor-desktop.png'});

await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.videoWidth>0));

const phone=process.env.PHONE_CROP==='1';if(phone)await page.setViewport({width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});const cdp=phone?await page.createCDPSession():null;const results=[];
const clickText=async text=>{const h=await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text),text);if(!h.asElement())throw Error('No button '+text);await h.asElement().click()};
const readEditor=async()=> (await(await fetch('http://127.0.0.1:5581/api/editor-projects/'+r.editor_id,{headers:{authorization:'Bearer e2e-studio-token'}})).json()).data;
for(const [label,panels] of [['Game screen first',2]]){
 await page.click('[data-testid="toolbar-layout"]');const h=await page.evaluateHandle(label=>[...document.querySelectorAll('[role="menuitemradio"]')].find(b=>b.textContent.trim()===label),label);await h.asElement().click();
 await page.waitForFunction(label=>document.querySelector('[data-testid="toolbar-layout"]')?.textContent.includes(label),{},label);
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.videoWidth>0));
 const before=await readEditor();const row={label,panels,gestures:[],writesBefore:writes.length};
 if(!panels&&label!=='Fill'){
  row.disabled=await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Crop')?.disabled);if(row.disabled!==true)throw Error(label+' Crop unexpectedly enabled');
 }else{
  for(let n=1;n<=(panels||1);n++){
   const text=panels?'Panel '+n:null;const control=await page.evaluateHandle(text=>[...document.querySelectorAll('button')].find(b=>text?b.textContent.trim().startsWith(text):b.textContent.trim()==='Crop'),text);await control.asElement().evaluate(b=>b.scrollIntoView({inline:'center',block:'nearest'}));if(phone)await control.asElement().tap();else await control.asElement().click();
   await page.waitForSelector('[data-testid="crop-box"]');await page.waitForFunction(()=>{const v=document.querySelector('[data-testid="crop-stage"] video');return v&&v.readyState>=2&&!v.seeking});
   const scope=panels?'crop-dialog':'inline-preview-crop';
   const stage=await(await page.$('[data-testid="crop-stage"]')).boundingBox();
   const corner=await(await page.$('[data-testid="crop-corner-br"]')).boundingBox();
   if(phone){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:corner.x+corner.width/2-1,y:corner.y+corner.height/2-2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:corner.x+corner.width/2-12,y:corner.y+corner.height/2-stage.height*.12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{await page.mouse.move(corner.x+corner.width/2-1,corner.y+corner.height/2-2);await page.mouse.down();await page.mouse.move(corner.x+corner.width/2-12,corner.y+corner.height/2-stage.height*.12,{steps:8});await page.mouse.up();}
   const box=await(await page.$('[data-testid="crop-box"]')).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+(n%2?12:-12),box.y+box.height/2+6,{steps:6});await page.mouse.up();
   const gesture=await page.$eval('[data-testid="'+scope+'"]',e=>e.innerText);row.gestures.push(gesture);
   await page.screenshot({path:'/downloads/game-screen-first-'+(phone?'phone-':'')+label.toLowerCase()+'-panel-'+n+'-gesture.png'});
   if(phone){const ab=await(await page.evaluateHandle(()=>[...document.querySelectorAll('[data-testid="crop-dialog"] button')].find(b=>b.textContent.trim()==='Apply'))).asElement().boundingBox();if(ab.y<0||ab.y+ab.height>844)throw Error('Phone Apply offscreen');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ab.x+ab.width/2,y:ab.y+ab.height/2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>!document.querySelector('[data-testid="crop-dialog"]'));}else await clickText('Apply');
  }
  if(!phone){await page.keyboard.press('Escape');await page.$eval('button[title="Lock Track"]',b=>b.click());await page.waitForSelector('button[title="Unlock Track"]');
  row.lockedDisabled=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>/^(Crop|Panel \d)/.test(b.textContent.trim())).every(b=>b.disabled));if(!row.lockedDisabled){console.log('LOCK_DEBUG',label,await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>/^(Crop|Panel \d)/.test(b.textContent.trim())).map(b=>({text:b.textContent,disabled:b.disabled}))),JSON.stringify((await readEditor()).tracks.map(t=>({id:t.id,name:t.name,locked:t.locked}))));await page.screenshot({path:'/downloads/crop-lock-failure.png'});throw Error(label+' locked controls enabled');}
  await page.$eval('button[title="Unlock Track"]',b=>b.click());await page.waitForSelector('button[title="Lock Track"]');}
 }
 row.writesBefore=writes.length;await clickText('Save');for(let i=0;i<80&&writes.length<row.writesBefore+2;i++)await new Promise(r=>setTimeout(r,80));if(writes.length<row.writesBefore+2||writes.slice(row.writesBefore).some(w=>w.status!==200))throw Error(label+' Save failed');
 let saved=await readEditor();row.savedItem=saved.tracks.find(t=>t.type==='VIDEO').items[0];
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.body.innerText.includes('Main Video'));await page.waitForFunction(label=>document.querySelector('[data-testid="toolbar-layout"]')?.textContent.includes(label),{},label);
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.videoWidth>0));await page.waitForFunction(()=>{const vs=[...document.querySelectorAll('video')].filter(v=>v.videoWidth>0);return vs.length&&vs.every(v=>v.readyState>=2&&!v.seeking)},{timeout:15000});await new Promise(r=>setTimeout(r,700));
 row.reloadItem=(await readEditor()).tracks.find(t=>t.type==='VIDEO').items[0];console.log('CROP_COMPARE',label,JSON.stringify({before:row.savedItem.crop,after:row.reloadItem.crop,panelsBefore:row.savedItem.panels,panelsAfter:row.reloadItem.panels,writes:writes.map(w=>({url:w.url,status:w.status}))}));if(JSON.stringify(row.reloadItem.crop)!==JSON.stringify(row.savedItem.crop)||JSON.stringify(row.reloadItem.panels)!==JSON.stringify(row.savedItem.panels))throw Error(label+' reload changed crop');
 await page.screenshot({path:'/downloads/game-screen-first-'+(phone?'phone-':'')+label.toLowerCase()+'-reload.png'});
 if(panels&&!row.reloadItem.panels.slots.every(s=>s.set&&s.scale>1))throw Error(label+' panel gestures not saved');
 if(label==='Fill'&&!(row.reloadItem.crop.scale>1))throw Error('Fill gesture not saved');
 if(panels||label==='Fill'){
  const res=await fetch('http://127.0.0.1:5581/api/editor-projects/'+r.editor_id+'/render',{method:'POST',headers:{authorization:'Bearer e2e-studio-token','content-type':'application/json'},body:JSON.stringify({resolution:'720p'})});row.renderAccept=res.status;if(res.status!==202)throw Error('Render not accepted '+await res.text());let state;
  for(let i=0;i<150;i++){await new Promise(r=>setTimeout(r,250));state=await(await fetch('http://127.0.0.1:5581/__qualification/status')).json();if(['failed','completed'].includes(state.job?.status))break;}
  row.job=state.job?.status;if(row.job!=='completed')throw Error(label+' render failed '+state.clip?.render_error_message);fs.copyFileSync('/tmp/vireo-local-restore/objects/local-clips/'+state.clip.output_storage_path,'/downloads/game-screen-first-'+(phone?'phone-':'')+label.toLowerCase()+'-api-720p.mp4');
 }
 results.push(row);fs.writeFileSync('/tmp/vireo-local-restore/game-screen-first-'+(phone?'phone-':'')+'result.json',JSON.stringify({results,writes,errors},null,2));console.log('LAYOUT_PASS',label,JSON.stringify(row.gestures),row.job||'disabled check');
}
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();for(const p of procs)p.kill('SIGTERM')});
