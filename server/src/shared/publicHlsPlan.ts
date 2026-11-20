import{AppError}from'../types/index.js';
export type HlsPlan={kind:'master';variants:Array<{url:string;bandwidth:number;height?:number}>}|{kind:'media';segments:string[];duration:number;ranges?:Array<{start:number;length:number}|null>};
/** Completed clear muxed HLS only. FFmpeg never receives a remote manifest,
 * key URL, unbounded byte range, live stream or unreviewed auxiliary playlist. */
export function parsePublicHls(text:string,base:string):HlsPlan{
 const fail=()=>new AppError('This HLS video format cannot be safely imported. Use a downloadable video file.',400,'HLS_FORMAT_UNSUPPORTED');
 if(text.length>1024*1024||!text.trimStart().startsWith('#EXTM3U'))throw fail();
 const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);const link=(s:string)=>{const u=new URL(s,base);if(u.protocol!=='https:'||u.username||u.password||u.port)throw fail();return u.toString()};
 if(lines.some(l=>/^#EXT-X-(?:KEY|SESSION-KEY|MAP|MEDIA|I-FRAME-STREAM-INF|DEFINE|PART|PRELOAD-HINT|SKIP)(?::|$)/.test(l)))throw fail();
 if(lines.some(l=>l.startsWith('#EXT-X-STREAM-INF:'))){const variants:Array<{url:string;bandwidth:number;height?:number}>=[];for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){if(!lines[i+1]||lines[i+1].startsWith('#'))throw fail();const bandwidth=Number(lines[i].match(/(?:^|[:,])BANDWIDTH=(\d+)/)?.[1]);if(!Number.isFinite(bandwidth)||bandwidth<=0)throw fail();const resolution=lines[i].match(/RESOLUTION=\d+x(\d+)/)?.[1];const height=resolution?Number(resolution):undefined;variants.push({url:link(lines[++i]),bandwidth,...(height?{height}:{})})}if(!variants.length||variants.length>20)throw fail();return{kind:'master',variants:variants.sort((a,b)=>a.bandwidth-b.bandwidth)}}
 if(!lines.includes('#EXT-X-ENDLIST'))throw new AppError('Only completed videos are supported. Live playback is not imported.',400,'LIVE_SOURCE_NOT_SUPPORTED');
 const segments:string[]=[],ranges:Array<{start:number;length:number}|null>=[];let duration=0,expect=false,pending:{start:number;length:number}|null=null;
 for(const line of lines){
  if(line.startsWith('#EXT-X-BYTERANGE:')){const m=line.match(/^#EXT-X-BYTERANGE:(\d+)@(\d+)$/);if(!m||pending)throw fail();const length=Number(m[1]),start=Number(m[2]);if(!Number.isSafeInteger(length)||length<=0||!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(start+length))throw fail();pending={start,length};}
  else if(line.startsWith('#EXTINF:')){const n=Number(line.slice(8).split(',')[0]);if(expect||!Number.isFinite(n)||n<=0)throw fail();duration+=n;expect=true}
  else if(!line.startsWith('#')){if(!expect)throw fail();segments.push(link(line));ranges.push(pending);pending=null;expect=false}
 }
 if(expect||pending||!segments.length||segments.length>2000||duration>7200)throw fail();return{kind:'media',segments,duration,...(ranges.some(Boolean)?{ranges}:{})};
}
