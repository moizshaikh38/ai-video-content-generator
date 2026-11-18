/** Detector provenance is measurement, never a face identity or editorial role grant. */
export interface FaceEvidence {
  schema_version: 1;
  detector: string;
  coordinate_space: 'source-pixels';
  source_width: number;
  source_height: number;
  raw_box: [number, number, number, number];
  raw_score?: number;
  clipped: {left:boolean;top:boolean;right:boolean;bottom:boolean};
  landmarks?: Array<{name:'right_eye'|'left_eye'|'nose'|'right_mouth'|'left_mouth';x:number;y:number}>;
  verification: {state:'unknown';reason:'detector-candidate-only'};
}
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
export function normalizeFaceEvidence(raw:unknown):FaceEvidence|undefined {
 const r=raw as any;
 if(!r||r.schema_version!==1||typeof r.detector!=='string'||!r.detector||r.detector.length>100||r.coordinate_space!=='source-pixels'||!finite(r.source_width)||!finite(r.source_height)||r.source_width<=0||r.source_height<=0||!Array.isArray(r.raw_box)||r.raw_box.length!==4||!r.raw_box.every(finite)||r.raw_box[2]<=0||r.raw_box[3]<=0||!r.clipped||!['left','top','right','bottom'].every(k=>typeof r.clipped[k]==='boolean'))return undefined;
 const result:FaceEvidence={schema_version:1,detector:r.detector,coordinate_space:'source-pixels',source_width:r.source_width,source_height:r.source_height,raw_box:[...r.raw_box] as FaceEvidence['raw_box'],clipped:{left:r.clipped.left,top:r.clipped.top,right:r.clipped.right,bottom:r.clipped.bottom},verification:{state:'unknown',reason:'detector-candidate-only'}};
 if(finite(r.raw_score))result.raw_score=r.raw_score;
 const names=['right_eye','left_eye','nose','right_mouth','left_mouth'];
 if(Array.isArray(r.landmarks)&&r.landmarks.length===5&&r.landmarks.every((p:any,i:number)=>p&&p.name===names[i]&&finite(p.x)&&finite(p.y)))result.landmarks=r.landmarks.map((p:any)=>({name:p.name,x:p.x,y:p.y}));
 return result;
}
