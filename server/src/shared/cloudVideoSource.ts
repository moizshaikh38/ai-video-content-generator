import {AppError} from '../types/index.js';
export type CloudVideoSource={provider:'google_drive'|'dropbox';normalizedUrl:string;downloadUrl:string;fileId?:string};
/** Public single-file shares only. Never accepts credentials, folders or a
 * caller-supplied download host. Keep resource keys needed by link permissions. */
export function parseCloudVideoSource(u:URL):CloudVideoSource|null{
 const h=u.hostname.toLowerCase();if(!['drive.google.com','drive.usercontent.google.com','dropbox.com','www.dropbox.com','dl.dropboxusercontent.com'].includes(h))return null;
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw new AppError('Use a standard HTTPS file share link.',400,'INVALID_CLOUD_VIDEO_URL');
 if(h.includes('dropbox')){
  if(h!=='dl.dropboxusercontent.com'&&!/^\/(?:s\/[\w-]+\/[^/]+|scl\/fi\/[\w.-]+\/[^/]+)$/.test(u.pathname))throw new AppError('Paste a shared Dropbox file link, not a folder or account page.',400,'CLOUD_FILE_LINK_REQUIRED');
  const d=new URL(u);d.hash='';d.searchParams.delete('raw');d.searchParams.set('dl','1');return{provider:'dropbox',normalizedUrl:u.toString(),downloadUrl:d.toString()};
 }
 const match=u.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/view|\/preview|\/edit)?\/?$/);const id=match?.[1]??(['\/open','\/uc','\/download'].includes(u.pathname)?u.searchParams.get('id'):null);
 if(!id||!/^[A-Za-z0-9_-]{10,200}$/.test(id))throw new AppError('Paste a shared Google Drive video file link, not a folder or document.',400,'CLOUD_FILE_LINK_REQUIRED');
 const d=new URL('https://drive.usercontent.google.com/download');d.searchParams.set('id',id);d.searchParams.set('export','download');const rk=u.searchParams.get('resourcekey');if(rk){if(!/^[A-Za-z0-9_-]{1,300}$/.test(rk))throw new AppError('Invalid Drive resource key.',400,'INVALID_CLOUD_VIDEO_URL');d.searchParams.set('resourcekey',rk)}return{provider:'google_drive',fileId:id,normalizedUrl:u.toString(),downloadUrl:d.toString()};
}
const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
/** Only Google's ordinary public-file download confirmation form is accepted.
 * Login, access requests, quota, abuse and arbitrary forms stay closed. */
export function driveDownloadConfirmation(html:string,source:CloudVideoSource):string|null{
 if(source.provider!=='google_drive'||html.length>1024*1024)return null;
 const form=html.match(/<form\b[^>]*\bid=["']download-form["'][^>]*>[\s\S]*?<\/form>/i)?.[0];if(!form)return null;
 const action=form.match(/\baction=["']([^"']+)["']/i)?.[1];if(!action)return null;let u:URL;try{u=new URL(decode(action))}catch{return null}
 if(u.origin!=='https://drive.usercontent.google.com'||u.pathname!=='/download'||u.username||u.password||u.port)return null;
 const params=new URLSearchParams();for(const tag of form.matchAll(/<input\b[^>]*>/gi)){const name=tag[0].match(/\bname=["']([^"']+)["']/i)?.[1],value=tag[0].match(/\bvalue=["']([^"']*)["']/i)?.[1];if(name&&value!==undefined&&['id','export','confirm','uuid','resourcekey'].includes(name))params.set(name,decode(value));}
 if(params.get('id')!==source.fileId||params.get('export')!=='download'||!params.get('confirm'))return null;
 if([...params.values()].some(v=>!/^[A-Za-z0-9_-]{1,300}$/.test(v)))return null;
 if(source.downloadUrl.includes('resourcekey='))params.set('resourcekey',new URL(source.downloadUrl).searchParams.get('resourcekey')!);u.search=params.toString();return u.toString();
}
