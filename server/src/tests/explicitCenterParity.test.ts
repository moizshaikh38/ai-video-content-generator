import {test} from 'node:test';import assert from 'node:assert/strict';
import {withNewProjectFraming} from '../shared/newProjectFraming.js';
import {ProEditorService as P} from '../services/proEditorService.js';
import {buildBackdropFitChain} from '../services/clipRenderService.js';
import {automaticFitFocusY} from '../shared/automaticFitGeometry.js';
const base:any={id:'test',project_id:'p',user_id:'u',start_seconds:0,end_seconds:8,source_storage_path:'test.mp4',aspect_ratio:'9:16'};
const build=(crop_config:any)=>(P as any).buildInitialProject({...base,crop_mode:crop_config.mode,crop_config},'u',null,null,{clip_id:'test'},withNewProjectFraming({genre:'general'}));
const item=(p:any)=>p.tracks.find((t:any)=>t.type==='VIDEO').items[0];
test('explicit center create keeps center in the editor plan (no smart/auto override)',()=>{
  const cc={mode:'center',layout_mode:'track',layout_mode_source:'genre_recommendation',framing_request:'explicit_center'};
  const v=item(build(cc));assert.equal(v.automatic_framing,undefined);assert.equal(v.crop_config.mode,'center');assert.notEqual(v.crop_config.layout_mode_source,'auto');
});
test('center without the explicit marker (legacy or defaulted) keeps the existing automatic default',()=>{
  const v=item(build({mode:'center',layout_mode:'track',layout_mode_source:'genre_recommendation'}));assert.equal(v.automatic_framing?.enabled,true);assert.equal(v.crop_config.mode,'smart');
});
test('smart request is unchanged: automatic default applies',()=>{
  const v=item(build({mode:'smart',layout_mode:'track',layout_mode_source:'auto'}));assert.equal(v.automatic_framing?.enabled,true);assert.equal(v.crop_config.mode,'smart');
});
test('fallback auto Fit band is placed at the shared automatic focus, centered when no placement is given',()=>{
  const y=automaticFitFocusY('9:16');
  const placed=buildBackdropFitChain('9:16',1,{kind:'blur',bandAspect:4/3,bandPlaceY:y},'t',1);
  assert.match(placed,new RegExp(`overlay=\\(W-w\\)/2:\\(H-h\\)\\*${y.toFixed(4)}:`));
  const plain=buildBackdropFitChain('9:16',1,{kind:'blur',bandAspect:4/3},'t',1);assert.match(plain,/overlay=\(W-w\)\/2:\(H-h\)\/2:/);
  const noBand=buildBackdropFitChain('9:16',1,{kind:'blur',bandPlaceY:y},'t',1);assert.match(noBand,/overlay=\(W-w\)\/2:\(H-h\)\/2:/);
});

test('editor (Pro) compiler no-track automatic Fit fallback places the band at the shared automatic focus, same as the quick route',()=>{
  const item:any={id:'it1',type:'VIDEO',crop_config:{mode:'smart',layout_mode:'track',layout_mode_source:'auto'},automatic_framing:{enabled:true}};
  const canvas:any={width:1080,height:1920,aspect_ratio:'9:16'};
  const f=(P as any).buildSliceCropFilter(item,undefined,0,10,canvas) as string;
  assert.match(f,new RegExp(`overlay=\\(W-w\\)/2:\\(H-h\\)\\*${automaticFitFocusY('9:16').toFixed(4)}:`));
  const sq=(P as any).buildSliceCropFilter(item,{aspectRatio:'1:1'},0,10,{width:1080,height:1080,aspect_ratio:'1:1'}) as string;
  assert.match(sq,/overlay=\(W-w\)\/2:\(H-h\)\*0\.5000:/);
});
