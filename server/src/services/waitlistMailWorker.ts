import{getMongoDb}from'../db/mongoClient.js';import{mailCryptoReady}from'../utils/waitlistMail.js';import{processWaitlistMailOnce,ResendTransport}from'./waitlistMailDispatcher.js';import{logger}from'../utils/logger.js';
export async function ensureWaitlistReady():Promise<void>{const db=await getMongoDb();await db.collection('waitlist').createIndex({email:1},{unique:true});await db.collection('waitlist_mail_intents').createIndex({email:1,kind:1},{unique:true});await db.collection('waitlist_mail_intents').createIndex({status:1,created_at:1});await db.collection('waitlist_mail_intents').createIndex({status:1,claimed_at:1});}
export function waitlistTransportReady():boolean{
 const base=process.env.WAITLIST_PUBLIC_BASE_URL||'',logo=process.env.WAITLIST_LOGO_URL||'';
 return process.env.WAITLIST_MAIL_ENABLED==='1'&&mailCryptoReady()&&!!process.env.RESEND_API_KEY&&/^Vireo <[^<>\s@]+@updates\.vireoclip\.com>$/.test(process.env.WAITLIST_FROM_EMAIL||'')&&/^https:\/\/(?:www\.)?vireoclip\.com$/.test(base)&&/^https:\/\/(?:www\.)?vireoclip\.com\//.test(logo);
}
export function startWaitlistMailWorker():()=>void{
 if(!waitlistTransportReady())return()=>{};
 let busy=false,stopped=false;
 const tick=async()=>{if(busy||stopped)return;busy=true;try{await ensureWaitlistReady();const db=await getMongoDb();const result=await processWaitlistMailOnce(db,new ResendTransport(),10);if(result.sent||result.failed||result.ambiguous)logger.info('Waitlist mail tick',{sent:result.sent,failed:result.failed,ambiguous:result.ambiguous});}catch{logger.warn('Waitlist mail worker unavailable; durable intents retained');}finally{busy=false;}};
 void tick();const timer=setInterval(()=>void tick(),60000);timer.unref();return()=>{stopped=true;clearInterval(timer);};
}
