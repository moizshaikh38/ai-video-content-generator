import {captionAssReviewStates} from './captionAssReviewStates.js';
/** Offline measurement aid, never an unclipped-ink certificate. Enlarges a
 * supported explicit-position ASS canvas without changing its scale or wrap
 * width. The caller must compare cropped native/guard rasters and separately
 * justify the guard extent. No renderer, save or placement consumer. */
export function captionAssGuardReview(ass:string,input:{width:number;height:number;guard:number;cue:{start:number;end:number}}){
 const no=(reason:string)=>({status:'unavailable' as const,reason,establishesUnclippedBounds:false as const});
 const stateReview=captionAssReviewStates(ass,input?.cue);
 if(stateReview.status!=='ready')return no(stateReview.reason);
 const {width,height,guard}=input;
 if(![width,height,guard].every(Number.isSafeInteger)||width<1||height<1||guard<1||guard>360||width+2*guard>2048||height+2*guard>2048)return no('Guard raster exceeds the bounded integer canvas budget.');
 const lines=ass.split(/\r?\n/),xs=lines.filter(l=>/^\s*PlayResX\s*:/i.test(l)),ys=lines.filter(l=>/^\s*PlayResY\s*:/i.test(l));
 if(xs.length!==1||ys.length!==1||!/^PlayResX:\s*\d+$/.test(xs[0])||!/^PlayResY:\s*\d+$/.test(ys[0]))return no('Exactly one explicit script resolution is required.');
 const pw=Number(xs[0].slice(9).trim()),ph=Number(ys[0].slice(9).trim()),gx=guard*pw/width,gy=guard*ph/height;
 if(![pw,ph,gx,gy].every(Number.isSafeInteger)||pw<=0||ph<=0||pw>8192||ph>8192||gx!==gy)return no('The guard must preserve exact integer script scale in both axes.');
 if(/\\(?:i?clip|move|t)\s*\(/.test(ass)||/^\s*(?:LayoutRes[XY]|Timer)\s*:/mi.test(ass))return no('Unsupported clipping, motion, timer or layout-resolution semantics.');
 const styleFormat='Format:Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding';
 let section='',styleReady=false,styles=0,events=0,reason='';
 const shifted=lines.map(line=>{
  if(/^\[/.test(line)){section=line.trim();if(!['[Script Info]','[V4+ Styles]','[Events]'].includes(section))reason='Unsupported ASS section.';return line;}
  if(/^PlayResX:/.test(line))return 'PlayResX: '+(pw+2*gx);
  if(/^PlayResY:/.test(line))return 'PlayResY: '+(ph+2*gy);
  if(section==='[V4+ Styles]'&&line.startsWith('Format:')){styleReady=line.replace(/\s/g,'')===styleFormat;if(!styleReady)reason='Unsupported ASS style format.';return line;}
  if(section==='[V4+ Styles]'&&line.startsWith('Style:')){const f=line.split(',');if(!styleReady||f.length!==23||[19,20,21].some(i=>!/^\d+$/.test(f[i])||!Number.isSafeInteger(Number(f[i]))||Number(f[i])>8192)){reason='Unsupported ASS style margins.';return line;}for(const i of[19,20,21])f[i]=String(Number(f[i])+gx);styles++;return f.join(',');}
  if(section==='[Events]'&&line.startsWith('Dialogue:')){const f=line.split(',');if([5,6,7].some(i=>!/^\d+$/.test(f[i])||!Number.isSafeInteger(Number(f[i]))||Number(f[i])>8192)){reason='Unsupported ASS dialogue margins.';return line;}for(const i of[5,6,7])if(Number(f[i])>0)f[i]=String(Number(f[i])+gx);line=f.join(',');const positions=[...line.matchAll(/\\pos\(([-\d.]+),([-\d.]+)\)/g)];if(positions.length!==1||!positions[0].slice(1).every(v=>Number.isFinite(Number(v)))){reason='Each event needs exactly one finite explicit position.';return line;}const origins=[...line.matchAll(/\\org\(/g)];if(origins.length>1||origins.length!==[...line.matchAll(/\\org\(([-\d.]+),([-\d.]+)\)/g)].length){reason='Unsupported ASS origin syntax.';return line;}events++;return line.replace(/\\(pos|org)\(([-\d.]+),([-\d.]+)\)/g,(_,tag,x,y)=>{if(![Number(x),Number(y)].every(Number.isFinite))reason='Invalid origin coordinates.';return `\\${tag}(${Number(x)+gx},${Number(y)+gy})`;});}
  return line;
 });
 if(reason||!styles||!events)return no(reason||'No supported styles and explicit-position events.');
 return {status:'candidate-guard-script' as const,ass:shifted.join('\n'),width:width+2*guard,height:height+2*guard,crop:{left:guard,top:guard,width,height},states:stateReview.states,establishesUnclippedBounds:false as const,requiresExactCroppedAlphaComparison:true as const,requiresSeparatelyJustifiedGuardExtent:true as const};
}
