import type{ContentGenre}from'../types/index.js';
const genres=new Set(['podcast_interview','education_tutorial','motivation','business_finance','gaming','watch_party','streaming','sports','news_politics','comedy_entertainment','storytelling','documentary','product_marketing','general']);
export const genrePreferenceKey=(p:any)=>JSON.stringify({genre:p?.genre??null,mode:p?.genreSelectionMode??null});
const valid=(x:unknown):x is ContentGenre=>typeof x==='string'&&genres.has(x);
/** Snapshot of the effective selection genre, not a visual camera-role claim. */
export interface EffectiveClipGenre {version:1;genre:ContentGenre;selectionMode:'auto'|'manual'|'suggested';sourceKey:string;sourceSha256:string;transcriptSha256:string;preferenceOverride?:{genre:unknown;mode:unknown};candidateId:string;preferenceKey:string;contractVersion:1}
export function candidateEffectiveGenre(metadata:any,preferences:any,candidateId:string):EffectiveClipGenre|undefined {
 const r=metadata?.selection_source_receipt;
 if(!candidateId||!metadata?.genre_preference_input)return;
 const input=metadata.genre_preference_input;
 if(input.genre!==(preferences?.genre??null)||input.mode!==(preferences?.genreSelectionMode??null))return;
 if(!valid(metadata?.genre)||!['auto','manual','suggested'].includes(metadata?.genre_selection_mode)||r?.version!==1||typeof r.source_key!=='string'||!/^[a-f0-9]{64}$/.test(r.source_receipt?.sha256)||!/^[a-f0-9]{64}$/.test(r.transcript_content_sha256))return;
 // Matching manual preferences retain their accepted choice; changed inputs require reanalysis.
 const genre=preferences?.genreSelectionMode==='manual'&&valid(preferences.genre)?preferences.genre:metadata.genre;
 return{version:1,genre,selectionMode:preferences?.genreSelectionMode==='manual'?'manual':metadata.genre_selection_mode,sourceKey:r.source_key,sourceSha256:r.source_receipt.sha256,transcriptSha256:r.transcript_content_sha256,candidateId,preferenceKey:genrePreferenceKey(preferences),contractVersion:1,...(metadata.genre_preference_override?{preferenceOverride:metadata.genre_preference_override}:{})};
}
export function resolveClipReframeGenre(preferences:any,clip:any,sourceSha256:string):ContentGenre|undefined {
 if(preferences?.genreSelectionMode==='manual'&&valid(preferences.genre))return preferences.genre;
 const e=clip?.crop_config?.effective_genre as EffectiveClipGenre,r=clip?.selection_source_receipt;
 if(e?.version===1&&e.contractVersion===1&&e.candidateId===clip.candidate_id&&e.preferenceKey===genrePreferenceKey(preferences)&&valid(e.genre)&&['auto','manual','suggested'].includes(e.selectionMode)&&e.sourceKey===clip?.source_storage_path&&e.sourceKey===r?.source_key&&e.sourceSha256===sourceSha256&&e.sourceSha256===r?.source_receipt?.sha256&&e.transcriptSha256===r?.transcript_content_sha256&&/^[a-f0-9]{64}$/.test(e.transcriptSha256))return e.genre;
 return valid(preferences?.genre)?preferences.genre:undefined;
}

/** Cache identity covers only genre inputs, not manual picture edits. */
export function reframeGenreContextKey(preferences:any,clip:any,sourceSha256:string):string {
 return JSON.stringify({version:1,preferences:genrePreferenceKey(preferences),genre:resolveClipReframeGenre(preferences,clip,sourceSha256)??null,effective:clip?.crop_config?.effective_genre??null});
}
export function genreTrackStale(preferences:any,clip:any,track:any):boolean {
 const recorded=track?.metadata?.genre_context_key;
 if(recorded===undefined)return !!clip?.crop_config?.effective_genre;
 return recorded!==reframeGenreContextKey(preferences,clip,track?.metadata?.analyzed_source_sha256);
}
