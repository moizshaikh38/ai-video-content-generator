import {AppError} from '../types/index.js';
export type LiveSource={provider:'kick'|'twitch'|'youtube';url:string};
export function liveSource(raw:unknown):LiveSource{
 const fail=()=>new AppError('Use a Kick, Twitch or YouTube live channel/video URL.',400,'INVALID_LIVE_URL');
 let u:URL;try{u=new URL(String(raw))}catch{throw fail()}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw fail();
 const h=u.hostname.toLowerCase(),p=u.pathname;
 if(['kick.com','www.kick.com'].includes(h)&&/^\/[\w-]{1,100}\/?$/.test(p)&&!u.search)return{provider:'kick',url:'https://kick.com'+p.replace(/\/$/,'')};
 if(['twitch.tv','www.twitch.tv'].includes(h)&&/^\/[\w]{1,100}\/?$/.test(p)&&!u.search)return{provider:'twitch',url:'https://www.twitch.tv'+p.replace(/\/$/,'')};
 if(h==='youtu.be'&&/^\/[\w-]{11}$/.test(p)&&!u.search)return{provider:'youtube',url:'https://www.youtube.com/watch?v='+p.slice(1)};
 if(['youtube.com','www.youtube.com'].includes(h)){
  if(/^\/live\/[\w-]{11}$/.test(p)&&!u.search)return{provider:'youtube',url:'https://www.youtube.com/watch?v='+p.split('/')[2]};
  if(/^\/(?:@[\w.-]+|channel\/[\w-]+)(?:\/live)?\/?$/.test(p)&&!u.search)return{provider:'youtube',url:'https://www.youtube.com'+p.replace(/\/$/,'').replace(/\/live$/,'')+'/live'};
  if(p==='/watch'&&/^[\w-]{11}$/.test(u.searchParams.get('v')||'')&&[...u.searchParams.keys()].every(k=>k==='v'))return{provider:'youtube',url:'https://www.youtube.com/watch?v='+u.searchParams.get('v')};
 }
 throw fail();
}
export function liveCaptureOptions(body:any,planMaxBytes:number){
 const duration=body?.durationSeconds,maxHeight=body?.maxHeight??720;
 if(!Number.isInteger(duration)||duration<5||duration>120)throw new AppError('Choose a capture duration from5to120seconds.',400,'LIVE_DURATION_REQUIRED');
 if(body?.start!=='now')throw new AppError('This capture mode requires start:now. Rewind is not supported.',400,'LIVE_START_REQUIRED');
 if(![360,480,720].includes(maxHeight))throw new AppError('Choose360,480or720p.',400,'LIVE_QUALITY_INVALID');
 const maxBytes=Math.min(planMaxBytes,128*1024*1024);if(!Number.isFinite(maxBytes)||maxBytes<1024*1024)throw new AppError('Capture file limit unavailable.',403,'LIVE_PLAN_LIMIT');
 return{source:liveSource(body.url),durationSeconds:duration,maxHeight,maxBytes,start:'now' as const};
}
export type LivePlaylist={kind:'master';variants:{url:string;height:number;bandwidth:number}[]}|{kind:'media';sequence:number;target:number;ended:boolean;segments:{url:string;duration:number;sequence:number}[]};
export function livePlaylist(text:string,base:string):LivePlaylist{
 const fail=()=>new AppError('Live capture currently needs clear, muxed MPEG-TS HLS without gaps or separate audio.',400,'LIVE_FORMAT_UNSUPPORTED');
 if(text.length>1024*1024||!text.trimStart().startsWith('#EXTM3U'))throw fail();
 const lines=text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
 const link=(v:string)=>{const u=new URL(v,base);if(u.protocol!=='https:'||u.username||u.password||u.port)throw fail();return u.toString()};
 if(lines.some(l=>/^#EXT-X-(?:MAP|BYTERANGE|DISCONTINUITY|GAP|PART|PRELOAD-HINT|SKIP|DEFINE|I-FRAME)/.test(l)||/^#EXT-X-(?:SESSION-)?KEY:/.test(l)&&l!=='#EXT-X-KEY:METHOD=NONE'||/^#EXT-X-MEDIA:/.test(l)&&!/^#EXT-X-MEDIA:TYPE=VIDEO,/.test(l)))throw fail();
 if(lines.some(l=>l.startsWith('#EXT-X-STREAM-INF:'))){const variants=[];for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){const info=lines[i],next=lines[++i];if(!next||next.startsWith('#')||/(?:AUDIO|SUBTITLES)=/.test(info))throw fail();const height=Number(info.match(/RESOLUTION=\d+x(\d+)/)?.[1]),bandwidth=Number(info.match(/(?:[:,])BANDWIDTH=(\d+)/)?.[1]);if(!Number.isSafeInteger(height)||height<=0||!Number.isFinite(bandwidth)||bandwidth<=0)throw fail();variants.push({url:link(next),height,bandwidth});}if(!variants.length||variants.length>20)throw fail();return{kind:'master',variants};}
 const sequence=Number(lines.find(l=>l.startsWith('#EXT-X-MEDIA-SEQUENCE:'))?.split(':')[1]),target=Number(lines.find(l=>l.startsWith('#EXT-X-TARGETDURATION:'))?.split(':')[1]);if(!Number.isSafeInteger(sequence)||sequence<0||!Number.isFinite(target)||target<1||target>15)throw fail();
 const segments=[];let duration:number|undefined;for(const line of lines){if(line.startsWith('#EXTINF:')){if(duration!==undefined)throw fail();duration=Number(line.slice(8).split(',')[0]);if(!Number.isFinite(duration)||duration<=0||duration>15)throw fail();}else if(!line.startsWith('#')){if(duration===undefined)throw fail();segments.push({url:link(line),duration,sequence:sequence+segments.length});duration=undefined;}}
 if(duration!==undefined||!segments.length||segments.length>1000)throw fail();return{kind:'media',sequence,target,segments,ended:lines.includes('#EXT-X-ENDLIST')};
}
