/** Only display an actual heuristic/model ranking. A review fallback's numeric
 * persistence sort sentinel is not a quality score. Legacy scored records keep
 * their display behavior; missing or nonfinite numbers stay unranked. */
export function candidateRankingDisplay(candidate:any):number|null {
 if(!candidate||candidate.metadata?.ranking_status==='unranked'||candidate.metadata?.selection_origin==='short-source-fallback')return null;
 const value=candidate.metadata?.vireo_score??candidate.engagement_score;
 return typeof value==='number'&&Number.isFinite(value)?value:null;
}
