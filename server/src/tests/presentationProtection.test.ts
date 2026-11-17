import {test} from 'node:test';import assert from 'node:assert/strict';
import {SmartReframeService as S} from '../services/smartReframeService.js';
import {presentFit43} from '../shared/automaticLayoutPolicy.js';
import {freezeAutomaticPlan} from '../shared/automaticFraming.js';
const samples=()=>Array.from({length:8},(_,i)=>({time:i*.25,faces:[.3,.65].map((x,j)=>({x,y:.2,width:.05,height:.1,center_x:x+.025,center_y:.25,confidence:.95,track_id:String(j)}))}));
const region={start:0,end:2,x:0,y:.8,width:1,height:.15,confidence:.95};
test('final protected fallback survives repeated preview presentation and freeze',()=>{
 for(const layoutPolicy of[undefined,{defaultLayout:'auto' as const,allowed:['fill' as const]}]){
 const plan=S.computeShotComposition({rawSamples:samples(),duration:2,sourceWidth:1920,sourceHeight:1080,windowScope:'shot',automaticFitAspect:'4:3',pairFocusReview:true,protectedContentRegions:[region],layoutPolicy});
 assert.equal(plan[0].windowW,1);assert.equal(plan[0].windowH,1);
 const preview=freezeAutomaticPlan(presentFit43(plan,1920,1080),{enabled:false,freeze_source_time:1},0);
 assert.equal(preview[0].windowW,1);assert.equal(preview[0].windowH,1);assert.deepEqual(preview[0].keyframes,[{time:0,centerX:.5,centerY:.5}]);
 }
});
test('ordinary unprotected fullsource Fit still uses owner-selected4:3',()=>{
 const p=presentFit43([{start:0,windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]}],1920,1080)[0];assert.equal(p.windowW,.75);assert.equal(p.windowH,1);
});
test('protection survives JSON transport and changed human-readable explanation',()=>{
 const raw={start:0,end:2,windowW:1,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}],uncertainty:'Different localized explanation',presentationProtection:{preserveWindow:true as const,reason:'measured-context' as const}};
 const transported=JSON.parse(JSON.stringify(raw));assert.deepEqual(presentFit43([transported],1920,1080),[raw]);
});
test('developmental repeated-face infeasibility fallback cannot be re-narrowed by preview',async()=>{
 const {anchorFitToMeasuredFaces}=await import('../shared/fitSubjectAnchor.js');
 const rows=samples().map(s=>({...s,faces:s.faces.map((f,i)=>({...f,x:i?.92:.01,width:.06,height:.12,center_x:i?.95:.04}))}));
 const base={start:0,end:2,windowW:.75,windowH:1,keyframes:[{time:0,centerX:.5,centerY:.5}]};
 assert.equal(anchorFitToMeasuredFaces([base],rows,1920,1080)[0],base);
 const reviewed=anchorFitToMeasuredFaces([base],rows,1920,1080,true);assert.equal(reviewed[0].windowW,1);assert.equal(presentFit43(reviewed,1920,1080)[0].windowW,1);
});
