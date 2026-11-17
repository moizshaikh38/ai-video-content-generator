/** Offline contract for a future candidate ranker. Not imported by runtime.
 * Semantic output can choose a predefined ID or abstain, never invent geometry
 * or upgrade an unqualified candidate to safe. Human review remains required. */
export type Candidate={id:string;geometryQualified:boolean;manualWitnessOnly:boolean};
export function parseCandidateRanking(raw:unknown,candidates:Candidate[]){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {status:'rejected',reason:'object required'};
 const r=raw as Record<string,unknown>;
 if(Object.keys(r).some(k=>!['candidateId','uncertain','visibleLosses'].includes(k)))return {status:'rejected',reason:'unexpected field or geometry'};
 if(typeof r.uncertain!=='boolean'||!Array.isArray(r.visibleLosses)||r.visibleLosses.some(v=>typeof v!=='string'))return {status:'rejected',reason:'invalid evidence structure'};
 if(r.candidateId===null||r.uncertain||r.visibleLosses.length)return {status:'abstained',reason:'uncertain or visible context loss'};
 if(typeof r.candidateId!=='string')return {status:'rejected',reason:'invalid candidate ID'};
 const c=candidates.find(c=>c.id===r.candidateId);
 if(!c)return {status:'rejected',reason:'unknown candidate ID'};
 if(!c.geometryQualified||c.manualWitnessOnly)return {status:'review-only',candidateId:c.id,reason:'not independently automatic-geometry qualified'};
 return {status:'review-only',candidateId:c.id,reason:'semantic ranking is not independent proof of safety'};
}
