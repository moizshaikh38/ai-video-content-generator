export interface ParticipantBounds {left:number;right:number;top:number;bottom:number}
const valid=(b:ParticipantBounds)=>[b.left,b.right,b.top,b.bottom].every(Number.isFinite)&&b.left>=0&&b.right<=1&&b.top>=0&&b.bottom<=1&&b.left<b.right&&b.top<b.bottom;
const overlaps=(a:ParticipantBounds,b:ParticipantBounds)=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top);
const contains=(a:ParticipantBounds,b:ParticipantBounds)=>a.left<=b.left&&a.right>=b.right&&a.top<=b.top&&a.bottom>=b.bottom;
/** Candidate geometry only. Trim synthetic padding at a measured gap, never a
 * measured participant envelope. Does not establish body ownership or context.
 * The caller must verify complete, unambiguous shot-local ownership separately.
 */
export function separateParticipantPadding(padded:ParticipantBounds[],measured:ParticipantBounds[]):ParticipantBounds[]|null{
 if(padded.length<2||padded.length!==measured.length||padded.some((b,i)=>!valid(b)||!valid(measured[i])||!contains(b,measured[i])))return null;
 const out=padded.map(b=>({...b}));
 for(let i=0;i<out.length;i++)for(let j=i+1;j<out.length;j++){
  if(!overlaps(out[i],out[j]))continue;
  const a=measured[i],b=measured[j];
  if(overlaps(a,b))return null;
  if(a.right<=b.left){const edge=(a.right+b.left)/2;out[i].right=Math.min(out[i].right,edge);out[j].left=Math.max(out[j].left,edge);}
  else if(b.right<=a.left){const edge=(b.right+a.left)/2;out[j].right=Math.min(out[j].right,edge);out[i].left=Math.max(out[i].left,edge);}
  else if(a.bottom<=b.top){const edge=(a.bottom+b.top)/2;out[i].bottom=Math.min(out[i].bottom,edge);out[j].top=Math.max(out[j].top,edge);}
  else if(b.bottom<=a.top){const edge=(b.bottom+a.top)/2;out[j].bottom=Math.min(out[j].bottom,edge);out[i].top=Math.max(out[i].top,edge);}
  else return null;
 }
 if(out.some((b,i)=>!valid(b)||!contains(b,measured[i])||out.some((other,j)=>i<j&&overlaps(b,other))))return null;
 return out;
}
