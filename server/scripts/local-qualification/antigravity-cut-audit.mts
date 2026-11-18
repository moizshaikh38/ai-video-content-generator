import {SmartReframeService as S} from '../../src/services/smartReframeService.js';
const faces=(id:string,x:number)=>[{track_id:id,center_x:x,center_y:.4,x:x-.05,y:.35,width:.1,height:.1,confidence:.95}];
for(const [label,cuts,fps]of [['unsorted',[5.58,5.5],30],['rapid',[3,3.35],24]] as const){
 const samples=[{time:1,faces:faces('t1',.2)},{time:3.1,faces:faces('t1',.5)},{time:3.5,faces:faces('t1',.8)},{time:6,faces:faces('t1',.8)}];
 const result=S.smoothAndGenerateKeyframes({samples,dominantTrackId:'t1',duration:10,sourceFps:fps,sceneCuts:[...cuts]} as any);
 console.log(JSON.stringify({label,keys:result}));
}
