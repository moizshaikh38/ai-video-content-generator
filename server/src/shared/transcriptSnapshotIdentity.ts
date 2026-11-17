import crypto from 'node:crypto';
/** Content identity only. Matching snapshots do not prove audio accuracy or that
 * the transcript was generated from the currently downloaded source bytes. */
export function transcriptSnapshotIdentity(transcript:Record<string,any>):string {
 const canonical=(value:any):any=>{if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value;};
 return crypto.createHash('sha256').update(JSON.stringify(canonical({id:transcript.id,updated_at:transcript.updated_at,transcript_text:transcript.transcript_text,duration_seconds:transcript.duration_seconds,segments:transcript.segments,words:transcript.words,language:transcript.language,quality_assessment:transcript.quality_assessment}))).digest('hex');
}
