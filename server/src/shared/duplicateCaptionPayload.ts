/** Duplicate caption payload without sharing cue identities. Existing editor
 * readers recognize relative legacy cues by the first cue before item start;
 * preserve that clock convention, offset absolute cues by the placement delta.
 * Manual text/style/position and both token shapes remain unchanged otherwise. */
export function duplicateCaptionPayload<T extends {cues?:any[];cues_covered_end?:number}>(caption:T|undefined,itemStart:number,newStart:number,newId:()=>string):T|undefined {
 if(!caption)return caption;
 const copy=structuredClone(caption);
 if(!Array.isArray(copy.cues))return copy;
 const first=copy.cues[0]?.start;
 const relative=itemStart>0&&typeof first==='number'&&first>=0&&first<itemStart-.05;
 const offset=relative?0:newStart-itemStart;
 if(typeof copy.cues_covered_end==='number'&&Number.isFinite(copy.cues_covered_end))copy.cues_covered_end=Number((copy.cues_covered_end+offset).toFixed(3));
 const shift=(rows:any)=>Array.isArray(rows)?rows.map(w=>({...w,start:Number((w.start+offset).toFixed(3)),end:Number((w.end+offset).toFixed(3))})):rows;
 copy.cues=copy.cues.map(c=>({...c,id:newId(),start:Number((c.start+offset).toFixed(3)),end:Number((c.end+offset).toFixed(3)),...(Array.isArray(c.words)?{words:shift(c.words)}:{}),...(Array.isArray(c.tokens)?{tokens:shift(c.tokens)}:{})}));
 return copy;
}
