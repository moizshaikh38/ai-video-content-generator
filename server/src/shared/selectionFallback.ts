import type {AIClipCandidate,TranscriptSegment} from '../types/index.js';
/** A short transcript span is a review fallback, never an invented model ranking.
 * Long sources with no proposals must not silently become a high-scored opening.
 * This does not assert story completeness, word accuracy or hook quality. */
export function buildShortSourceSelectionFallback(segments:TranscriptSegment[],duration:unknown,title?:string):AIClipCandidate|null {
 if(typeof duration!=='number'||!Number.isFinite(duration)||duration<2||duration>=15||!segments.length)return null;
 let previousEnd=-Infinity;
 for(const segment of segments){
  if(!Number.isFinite(segment.start)||!Number.isFinite(segment.end)||segment.start<0||segment.end<=segment.start||segment.start<previousEnd-1e-6||segment.end>duration+.05||typeof segment.text!=='string')return null;
  previousEnd=segment.end;
 }
 if(segments.at(-1)!.end-segments[0].start<2)return null;
 return {start_segment_index:0,end_segment_index:segments.length-1,title:title||'Short source for review',hook:'',reason:'Available short transcript-span fallback because no clip proposals were returned. Story quality and ranking are unverified.',category:'insight'};
}
