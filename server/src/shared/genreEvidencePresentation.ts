export interface GenreEvidencePresentation {state:'suggested'|'review-required';genreId?:string;description:string}
/** Present stored evidence, never a probability of correctness or a claim that
 * an automatic suggestion overrode the user's selected genre. */
export function genreEvidencePresentation(metadata:any,knownGenres:readonly string[]):GenreEvidencePresentation|null {
 if(!metadata||typeof metadata!=='object')return null;
 const genre=metadata.suggested_genre,evidence=metadata.genre_evidence,semantic=metadata.genre_semantic_evidence;
 const hasSuggestion=typeof genre==='string'&&genre.length>0;
 if(!hasSuggestion&&!evidence&&!semantic)return null;
 const review=(description:string):GenreEvidencePresentation=>({state:'review-required',description});
 if(semantic?.status==='review-required'||evidence?.status==='abstained'||genre==='general')return review('Automatic genre evidence is weak, mixed or uncertain. Review the recording or choose a genre.');
 if(!hasSuggestion||!knownGenres.includes(genre))return review('No recognized automatic genre suggestion is available. Review the recording or choose a genre.');
 if(evidence?.version!==1||evidence.status!=='suggested'||evidence.confidenceIsProbability!==false)return review('This saved genre suggestion has no current evidence record. Review it before sharing.');
 if(evidence.method==='source-bound-semantic'){
  if(semantic?.status!=='suggested'||semantic.scope!=='sampled-source'||![5,9].includes(semantic.sampleCount))return review('The saved visual genre evidence needs review.');
  return {state:'suggested',genreId:genre,description:`Based on ${semantic.sampleCount} sampled frames. Unseen content may differ. This is a suggestion, not an accuracy score.`};
 }
 if(evidence.method==='local-heuristic')return {state:'suggested',genreId:genre,description:'Local heuristic suggestion, not measured accuracy. Review the recording before sharing.'};
 return review('This saved genre suggestion has no recognized evidence method. Review it before sharing.');
}
