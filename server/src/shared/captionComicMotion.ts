import type{CaptionStampMotion}from'./captionStampMotion.js';
/** Reference-informed original phrase overshoot. Inputs and state remain clip-timeline only. */
export function getCaptionComicMotion(start:number,end:number,time:number):CaptionStampMotion{
 if(![start,end,time].every(Number.isFinite)||end<=start||time<start||time>=end)return{scale:1,rotation:0,opacity:0};
 const duration=Math.min(.16,(end-start)*.6),elapsed=Math.max(0,Math.floor((Number(time.toFixed(2))-Number(start.toFixed(2))+1e-6)*100)/100),p=Math.min(1,elapsed/duration);
 const points=[[0,.84],[.375,1.10],[.625,1.06],[.875,1.01],[1,1]];
 let scale=1;for(let i=1;i<points.length;i++){if(p<=points[i][0]){const[a,x]=points[i-1],[b,y]=points[i];scale=x+(y-x)*(p-a)/(b-a);break;}}
 return{scale:Number(scale.toFixed(4)),rotation:0,opacity:1};
}
