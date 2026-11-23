import crypto from 'node:crypto';
/** Output freshness only. This digest never establishes source ownership or
 * transcript accuracy. Missing legacy proof requires a new explicit render. */
export function subtitleBurnIdentity(project:any):string {
 const canonical=(v:any):any=>v===undefined?null:Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 return crypto.createHash('sha256').update(JSON.stringify(canonical({rendererContract:'subtitle-saved-shadow-controls-v6',source:project.source_url,cues:project.subtitle_cues,style:project.subtitle_style,binding:project.subtitle_cues_binding}))).digest('hex');
}
export function subtitleBurnCurrent(project:any):boolean {
 return project.subtitle_export_status==='ready'&&typeof project.subtitle_export_identity==='string'&&project.subtitle_export_identity===subtitleBurnIdentity(project);
}
export const subtitleBurnInvalidation=()=>({subtitle_export_status:'idle',subtitle_export_progress:0,subtitle_export_stage:'settings_changed',subtitle_export_error:null});
