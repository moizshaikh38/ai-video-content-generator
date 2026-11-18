import https from 'node:https';
import http from 'node:http';
import dns from 'node:dns/promises';
import net from 'node:net';
import {Readable} from 'node:stream';
import {UrlValidator} from './urlValidator.js';
import {config} from '../config/index.js';
import {AppError} from '../types/index.js';

/** Resolve once and bind that validated address to this TLS connection.
 * URL hostname remains the TLS identity/Host header. No ambient proxy or
 * reusable socket can silently select a different destination. No redirects.
 */
export async function pinnedPublicMediaFetch(raw: string, signal: AbortSignal, options: {method?:'GET'|'HEAD';httpsOnly?:boolean;allowDevelopmentLoopback?:boolean} = {}): Promise<Response> {
  const url = new URL(raw);
  if (!['http:','https:'].includes(url.protocol) || (options.httpsOnly && url.protocol !== 'https:') || url.username || url.password) throw new AppError('Invalid asset URL.',400,'EDITOR_SOURCE_NOT_ALLOWED');
  const host = url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  const devLoopback = options.allowDevelopmentLoopback && !config.isProduction && (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1');
  signal.throwIfAborted();
  let onAbort: (()=>void) | undefined;
  const addresses = await Promise.race([
    net.isIP(host) ? Promise.resolve([{address:host,family:net.isIP(host)}]) : dns.lookup(host,{all:true}),
    new Promise<never>((_resolve,reject)=>{
      onAbort=()=>reject(signal.reason || new Error('Asset lookup aborted.'));
      signal.addEventListener('abort',onAbort,{once:true});
    }),
  ]).finally(()=>{if(onAbort)signal.removeEventListener('abort',onAbort)});
  if (!addresses.length || (!devLoopback && addresses.some(row=>UrlValidator.isPrivateIp(row.address)))) {
    throw new AppError('Asset destination is private or unavailable.',400,'SSRF_BLOCKED');
  }
  signal.throwIfAborted();
  const selected = addresses.find(row=>row.family===4) || addresses[0];
  return new Promise<Response>((resolve,reject)=>{
    const transport=url.protocol==='https:'?https:http;
    const request = transport.request(url,{
      method:options.method||'GET',agent:false,signal,
      headers:{'User-Agent':'VireoClip/1.0'},
      lookup:((_hostname: string, options: any, callback: any)=>{
        if(options?.all) callback(null,[selected]);
        else callback(null,selected.address,selected.family);
      }) as any,
    },incoming=>{
      const headers = new Headers();
      for(const [name,value] of Object.entries(incoming.headers)){
        if(Array.isArray(value))for(const one of value)headers.append(name,one);
        else if(value!==undefined)headers.set(name,String(value));
      }
      const status=incoming.statusCode||502;
      if (options.method==='HEAD' || [204,205,304].includes(status)) {
        incoming.resume();
        resolve(new Response(null,{status,headers}));
      } else {
        resolve(new Response(Readable.toWeb(incoming) as any,{status,headers}));
      }
    });
    request.on('error',reject);request.end();
  });
}

export function pinnedHttpsAssetFetch(raw: string, signal: AbortSignal): Promise<Response> {
  return pinnedPublicMediaFetch(raw,signal,{httpsOnly:true,allowDevelopmentLoopback:true});
}
