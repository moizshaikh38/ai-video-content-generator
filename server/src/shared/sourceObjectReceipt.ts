/** Receipt binds an exact downloaded hash to a storage validator observed during
 * that download. A path/current HEAD alone must never mint one for old bytes. */
export interface SourceObjectReceipt {
  key:string;
  size:number;
  etag:string;
  sha256:string;
}
export function sourceObjectReceiptMatches(value:unknown,key:string,head:{size:number;etag?:string},sha256?:string):value is SourceObjectReceipt {
  if(!value||typeof value!=='object')return false;
  const r=value as SourceObjectReceipt;
  return r.key===key && typeof r.etag==='string' && r.etag.length>0 && !r.etag.startsWith('W/') &&
    Number.isSafeInteger(r.size) && r.size>0 && /^[a-f0-9]{64}$/.test(r.sha256) &&
    head.size===r.size && head.etag===r.etag && (sha256===undefined||r.sha256===sha256);
}
