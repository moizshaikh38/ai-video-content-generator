import crypto from 'node:crypto';
/** The project intent actually read by an analysis. Only preference/notes
 * edits invalidate it; processing timestamps and unrelated metadata do not. */
export function selectionContextIdentity(project:{clip_preferences?:unknown;notes?:unknown}):string {
 const canonical=(value:any):any=>value===undefined?null:Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 return crypto.createHash('sha256').update(JSON.stringify(canonical({clip_preferences:project.clip_preferences,notes:project.notes}))).digest('hex');
}
