import{test}from'node:test';import assert from'node:assert/strict';import{auditPairComposition as audit}from'../shared/pairCompositionQuality.js';
const faces=[.2,.7].map((x,i)=>({x,y:.2,width:.06,height:.12,center_x:x+.03,center_y:.26,confidence:.95,track_id:String(i)}));
const panels:any={layout:'split2',slots:[{sourceRect:{x:.1,y:.14,w:.26,h:.41},focusX:.5,focusY:.5,scale:1,set:true},{sourceRect:{x:.6,y:.14,w:.26,h:.41},focusX:.5,focusY:.5,scale:1,set:true}]};
test('well-spaced symmetric views have no heuristic warning, not semantic pass',()=>{const r=audit(panels,[{time:0,faces}],1920,1080);assert.equal(r.length,2);assert.ok(r.every(v=>v.flags.length===0))});
test('reports off-centering/shoulder intent clipping separately from face visibility',()=>{const p=structuredClone(panels);p.slots[0].sourceRect.x=.19;const r=audit(p,[{time:0,faces}],1920,1080);assert.ok(r[0].flags.includes('off-center-face'));assert.ok(r[0].flags.includes('shoulder-intent-cropped'))});
test('headroom and partial competing face are warnings, not background-importance claims',()=>{const p=structuredClone(panels);p.slots[0].sourceRect.y=.2;p.slots[0].sourceRect.w=.64;p.slots[0].sourceRect.h=.8;const f=structuredClone(faces);f[1].x=.64;f[1].center_x=.67;const r=audit(p,[{time:0,faces:f}],1920,1080);assert.ok(r[0].flags.includes('tight-headroom'));assert.ok(r[0].flags.includes('other-face-fragment'))});

test('source shoulder limit and other-person body fragment are measured warnings',()=>{const p=structuredClone(panels),f=structuredClone(faces);f[0].x=.005;f[0].center_x=.035;p.slots[0].sourceRect.x=0;p.slots[0].sourceRect.w=.52;p.slots[0].sourceRect.h=.82;const persons=[{x:.5,y:.1,width:.4,height:.8,confidence:.9}];const r=audit(p,[{time:0,faces:f,persons}],1920,1080);assert.ok(r[0].flags.includes('source-edge-shoulder-limit'));assert.ok(r[0].flags.includes('other-person-fragment'));assert.ok(audit(p,[],1920,1080).every(v=>v.flags.includes('insufficient-evidence')))});
test('large partial competing torso is not exempt from fragment warning',()=>{
 const p=structuredClone(panels);p.slots[0].sourceRect={x:.1,y:.14,w:.5,h:.8};
 const persons=[{x:.4,y:.1,width:.5,height:.8,confidence:.9}];
 assert.ok(audit(p,[{time:0,faces,persons}],1920,1080)[0].flags.includes('other-person-fragment'));
});
