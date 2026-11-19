export interface IndexedClipProposal {start_segment_index:number;end_segment_index:number;cold_open_segment_index?:number|null}
/** Prompt segment labels are global IDs. A returned ID outside the exact
 * supplied window is unknown, never evidence of a relative-index convention.
 * Preserve grounded proposals; omit unseen teaser footage without guessing. */
export function groundWindowClipProposals<T extends IndexedClipProposal>(proposals:T[],window:{startIndex:number;endIndex:number}):T[]{
 const {startIndex:start,endIndex:end}=window;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start)return [];
 return proposals.flatMap(p=>{
  const a=p?.start_segment_index,b=p?.end_segment_index;
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<start||b<a||b>end)return [];
  const cold=p.cold_open_segment_index;
  if(cold===undefined||cold===null)return [p];
  return [Number.isSafeInteger(cold)&&cold>=start&&cold<=end?p:{...p,cold_open_segment_index:null}];
 });
}
