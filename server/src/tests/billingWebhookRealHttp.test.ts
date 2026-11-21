import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import type {AddressInfo} from 'node:net';

test('real application preserves webhook bytes, rejects tampering and replays fractional invoices from both providers', async () => {
 const uri=process.env.MONGODB_URI;
 assert(uri && ['localhost','127.0.0.1'].includes(new URL(uri).hostname),'isolated local Mongo required');
 Object.assign(process.env,{NODE_ENV:'test',MONGODB_DB_NAME:'vireo_credit_qualified_0041',VIREO_SERVICE_ROLE:'api',PADDLE_ENABLED:'true',PADDLE_API_KEY:'pdl_sdbx_synthetic_fixture_not_real',PADDLE_WEBHOOK_SECRET:'synthetic-http-webhook-fixture',RAZORPAY_ENABLED:'true',RAZORPAY_KEY_ID:'rzp_test_synthetic_fixture',RAZORPAY_KEY_SECRET:'synthetic-api-secret-not-real',RAZORPAY_WEBHOOK_SECRET:'synthetic-razorpay-webhook-fixture'});
 const {config}=await import('../config/index.js');
 const {getMongoDb,closeMongo}=await import('../db/mongoClient.js');
 const {bootstrapMongo}=await import('../db/bootstrapMongo.js');
 const {setDatabaseBootstrapState}=await import('../services/databaseBootstrapState.js');
 const {default:app}=await import('../index.js');
 const db=await getMongoDb();await bootstrapMongo(db);
 setDatabaseBootstrapState('ready');
 const user=crypto.randomUUID(),event='fixture-'+crypto.randomUUID(),invoice='txn-'+crypto.randomUUID(),razorEvent='fixture-'+crypto.randomUUID();
 const server=app.listen(0,'127.0.0.1');
 try {
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const url='http://127.0.0.1:'+(server.address() as AddressInfo).port+'/api/billing/webhooks/paddle';
  const object={event_id:event,event_type:'transaction.completed',occurred_at:new Date().toISOString(),data:{id:invoice,currency_code:'USD',details:{totals:{total:'1999'}},custom_data:{userId:user}}};
  // Deliberate whitespace and a trailing newline: verification must use the
  // actual incoming bytes, not parsed-and-reserialized JSON.
  const raw=JSON.stringify(object,null,2)+'\n';
  const sign=(body:string)=>{const ts=String(Math.floor(Date.now()/1000));return `ts=${ts};h1=${crypto.createHmac('sha256',config.paddleWebhookSecret).update(ts+':'+body).digest('hex')}`;};
  const deliver=(body:string,signature:string)=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Paddle-Signature':signature},body});
  const invalid=await deliver(raw,'bad-signature');assert.equal(invalid.status,400);await invalid.text();
  assert.equal(await db.collection('billing_events').countDocuments({provider_event_id:event}),0);
  const malformed=JSON.stringify({...object,event_id:{$ne:null}});
  const badShape=await deliver(malformed,sign(malformed));assert.equal(badShape.status,400);await badShape.text();
  const signature=sign(raw);
  const tampered=await deliver(raw.replace('1999','2999'),signature);assert.equal(tampered.status,400);await tampered.text();
  assert.equal(await db.collection('billing_invoices').countDocuments({user_id:user}),0);
  const first=await deliver(raw,signature);assert.equal(first.status,200);const accepted=await first.json() as any;assert.equal(accepted.received,true);assert.equal(accepted.idempotent,false);assert.equal(accepted.ignored,false);
  const replay=await deliver(raw,signature);assert.equal(replay.status,200);assert.equal((await replay.json() as any).idempotent,true);
  assert.equal(await db.collection('billing_events').countDocuments({provider_event_id:event}),1);
  assert.equal(await db.collection('billing_invoices').countDocuments({user_id:user}),1);
  const stored=await db.collection('billing_invoices').findOne({user_id:user});assert.equal(stored?.amount_paid,19.99);assert.equal(stored?.currency,'USD');
  const razorRaw=JSON.stringify({event:'payment.captured',created_at:Math.floor(Date.now()/1000),payload:{payment:{entity:{id:'pay-'+crypto.randomUUID(),amount:199950,currency:'INR',notes:{userId:user}}}}},null,2)+'\n';
  const razorSignature=crypto.createHmac('sha256',config.razorpayWebhookSecret).update(razorRaw).digest('hex');
  const razorUrl=url.replace(/paddle$/,'razorpay');
  const razorDeliver=(body:string)=>fetch(razorUrl,{method:'POST',headers:{'Content-Type':'application/json','X-Razorpay-Signature':razorSignature,'X-Razorpay-Event-Id':razorEvent},body});
  const razorTampered=await razorDeliver(razorRaw.replace('199950','299950'));assert.equal(razorTampered.status,400);await razorTampered.text();
  const razorFirst=await razorDeliver(razorRaw);assert.equal(razorFirst.status,200);assert.equal((await razorFirst.json() as any).idempotent,false);
  const razorReplay=await razorDeliver(razorRaw);assert.equal(razorReplay.status,200);assert.equal((await razorReplay.json() as any).idempotent,true);
  const razorInvoice=await db.collection('billing_invoices').findOne({user_id:user,provider:'razorpay'});assert.equal(razorInvoice?.amount_paid,1999.5);assert.equal(razorInvoice?.currency,'INR');
  assert.equal(await db.collection('billing_events').countDocuments({provider_event_id:razorEvent}),1);
  assert.equal(await db.collection('billing_invoices').countDocuments({user_id:user}),2);
  const oversized=JSON.stringify({...object,event_id:'oversized-'+event,padding:'x'.repeat(110*1024)});
  const large=await deliver(oversized,sign(oversized));assert.equal(large.status,413);await large.text();
  assert.equal(await db.collection('billing_events').countDocuments({provider_event_id:'oversized-'+event}),0);
  console.log('REAL_APP_BOTH_PROVIDERS_RAW_BYTES_SIGNATURE_TAMPER_SHAPE_REPLAY_FRACTIONAL_INVOICES_BODY_LIMIT_PASS');
 } finally {
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  await db.collection('billing_events').deleteMany({provider_event_id:{$in:[event,razorEvent,'oversized-'+event]}});
  await db.collection('billing_invoices').deleteMany({user_id:user});
  setDatabaseBootstrapState('pending');await closeMongo();
 }
});
