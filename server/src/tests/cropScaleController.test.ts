import test from 'node:test';
import assert from 'node:assert/strict';
import { updateClipEditor } from '../controllers/clipController.js';
import { ClipRenderService as C } from '../services/clipRenderService.js';
import { explicitCropScaleUpdate } from '../shared/explicitCropScaleUpdate.js';
import { AppError } from '../types/index.js';
test('editor controller returns400 INVALID_CROP_SCALE for rejected explicit values without saving',async()=>{
 const original=C.updateClipEditorConfig;
 const stored={crop_config:{mode:'manual',scale:1.7},editor_version:4};
 const before=structuredClone(stored);let writes=0;
 try {
  C.updateClipEditorConfig=async (_clip,_user,body)=>{const crop={...stored.crop_config,...explicitCropScaleUpdate(body.cropConfig!)};writes++;stored.crop_config=crop;return stored as any;};
  for(const scale of [null,'1.7',false,{x:1}]){
   let status=0,result:any;
   const res:any={status:(n:number)=>{status=n;return res;},json:(b:any)=>{result=b;return res;}};
   await updateClipEditor({user:{id:'11111111-1111-4111-8111-111111111111'},params:{clipId:'22222222-2222-4222-8222-222222222222'},body:{cropConfig:{mode:'manual',scale}}} as any,res);
   assert.equal(status,400);assert.equal(result.code,'INVALID_CROP_SCALE');assert.equal(result.message,'Crop scale must be a finite number.');assert.deepEqual(stored,before);
  }
  assert.equal(writes,0);
  C.updateClipEditorConfig=async()=>{throw new AppError('private failure',500,'UNEXPECTED_PRIVATE_FAILURE');};
  let status=0,result:any;const res:any={status:(n:number)=>{status=n;return res;},json:(b:any)=>{result=b;return res;}};
  await updateClipEditor({user:{id:'11111111-1111-4111-8111-111111111111'},params:{clipId:'22222222-2222-4222-8222-222222222222'},body:{cropConfig:{scale:1.7}}}as any,res);
  assert.equal(status,500);assert.equal(result.code,'INTERNAL_ERROR');assert.equal(result.message,'Internal server error');
 }finally{C.updateClipEditorConfig=original;}
});
