/** Ordinary projects persist the private object key in source_url. Older
 * analysis-only rows used storage_path. A present canonical value always wins,
 * including when invalid: never silently analyze an obsolete alias instead. */
export function multimodalSourceKey(project:any):string|null {
 const raw=project?.source_url??project?.storage_path;
 return typeof raw==='string'&&raw.length>0&&raw.length<=2048&&!raw.startsWith('/')&&!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)?raw:null;
}
