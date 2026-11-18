import crypto from'node:crypto';
export interface EditorRenderSnapshot{id:string;version:number;digest:string}
function stable(value:unknown):unknown{
 if(Array.isArray(value))return value.map(stable);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Record<string,unknown>).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)]));
 return value;
}
/** Render-affecting saved document only. No last-render fence/audit metadata. */
export function editorRenderSnapshot(project:any):EditorRenderSnapshot|null{
 if(!project)return null;
 if(typeof project.id!=='string'||!Number.isSafeInteger(project.version)||project.version<1)throw new Error('Editor project revision is invalid.');
 const payload={id:project.id,clip_id:project.clip_id,user_id:project.user_id,version:project.version,canvas:project.canvas,tracks:project.tracks,settings:project.settings};
 return{id:project.id,version:project.version,digest:crypto.createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex')};
}
