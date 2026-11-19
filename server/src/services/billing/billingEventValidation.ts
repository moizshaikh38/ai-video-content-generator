import {AppError} from '../../types/index.js';
import type {NormalizedBillingEvent} from './types.js';
const eventTypes=new Set(['checkout.completed','subscription.created','subscription.active','subscription.updated','subscription.past_due','subscription.paused','subscription.canceled','payment.completed','payment.failed','refund.created']);
const statuses=new Set(['incomplete','trialing','active','past_due','unpaid','canceled','paused','incomplete_expired']);
/** Signature verification authenticates transport, not the payload's schema.
 * Refuse non-scalar lookup keys before any database query or transaction. */
export function assertBillingEventShape(event:NormalizedBillingEvent){
 const fail=()=>{throw new AppError('Billing event has invalid normalized fields.',400,'BILLING_EVENT_INVALID');};
 const text=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=1024&&v.trim()===v&&!/[\x00-\x1f\x7f]/.test(v);
 const date=(v:unknown)=>v instanceof Date&&Number.isFinite(v.getTime());
 if(!event||!['paddle','razorpay'].includes(event.provider)||!text(event.eventId)||!text(event.rawEventType)||!eventTypes.has(event.eventType)||!date(event.occurredAt))fail();
 for(const value of [event.userId,event.customerId,event.subscriptionId,event.invoiceId])if(value!=null&&!text(value))fail();
 for(const value of [event.currentPeriodStart,event.currentPeriodEnd,event.canceledAt])if(value!=null&&!date(value))fail();
 if(event.currentPeriodStart&&event.currentPeriodEnd&&event.currentPeriodEnd<event.currentPeriodStart)fail();
 if(event.planId!=null&&!['free','creator','pro','studio'].includes(event.planId))fail();
 if(event.interval!=null&&!['month','year'].includes(event.interval))fail();
 if(event.status!=null&&!statuses.has(event.status))fail();
 if(event.amount!=null&&(!Number.isSafeInteger(event.amount)||event.amount<0))fail();
 if(event.currency!=null&&(typeof event.currency!=='string'||!/^[A-Z]{3}$/.test(event.currency)))fail();
 if(event.cancelAtPeriodEnd!=null&&typeof event.cancelAtPeriodEnd!=='boolean')fail();
 if(!event.rawPayload||typeof event.rawPayload!=='object'||Array.isArray(event.rawPayload))fail();
 const data=event.rawPayload?.data;if(data&&typeof data==='object')for(const value of [data.id,data.transaction_id])if(value!=null&&!text(value))fail();
}
