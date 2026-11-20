/** Nonportrait support is deliberately limited to an already selected whole-source
 * Auto Fit. Do not reinterpret cropped, moving, Split or experimental plans. */
export function nonPortraitAutoFullSourceFit(plan:any[]|undefined,aspect:string):boolean {
 return ['1:1','16:9'].includes(aspect)&&Array.isArray(plan)&&plan.length>0&&plan.every(s=>
  typeof s==='object'&&s!==null&&!Array.isArray(s)&&
  s.kind==='fit'&&!s.split&&s.windowW===1&&s.windowH===1&&
  Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start&&
  Array.isArray(s.keyframes)&&s.keyframes.length>0&&s.keyframes.every((k:any)=>typeof k==='object'&&k!==null&&!Array.isArray(k)&&k.centerX===.5&&k.centerY===.5));
}
