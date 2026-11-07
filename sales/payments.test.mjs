import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {payments,endOfTerm,verifyWebhook} from './payments.mjs';
const env={GIGTAX_STRIPE_SECRET_KEY:'sk_live_synthetic',GIGTAX_STRIPE_WEBHOOK_SECRET:'whsec_synthetic',GIGTAX_SALES_ORIGIN:'https://gigtax.pro'};
const row={id:42,contact_email:'owner@example.test'},info={leadId:'12',terms:{hash:'a'.repeat(64)},acceptedAt:'2026-11-07T00:00:00Z',checkoutId:'cs_synthetic'};
const session=()=>({id:'cs_synthetic',mode:'subscription',client_reference_id:'42',metadata:{gigtax_enrollment:'42',terms_hash:info.terms.hash},currency:'usd',amount_total:50000,livemode:true,customer_email:row.contact_email,payment_status:'paid',status:'complete',subscription:'sub_synthetic',customer:'cus_synthetic',url:'https://checkout.stripe.com/c/pay/synthetic'});
const subscription=()=>({id:'sub_synthetic',status:'active',metadata:{gigtax_enrollment:'42',terms_hash:info.terms.hash},billing_cycle_anchor:1794009600,cancel_at:null,items:{data:[{quantity:1,price:{unit_amount:30000,currency:'usd',recurring:{interval:'month',interval_count:1}}}]}});
test('checkout fixes $500 upfront, $300 monthly and a one-time $200 fee; retries have the same provider request',async()=>{
  const calls=[];const p=payments(env,async(url,options)=>{calls.push({url,options});return Response.json(session());});
  await p.create(row,info,'synthetic-token');await p.create(row,info,'synthetic-token');
  assert.equal(calls[0].options.body,calls[1].options.body);assert.equal(calls[0].options.headers['Idempotency-Key'],calls[1].options.headers['Idempotency-Key']);
  const body=new URLSearchParams(calls[0].options.body);assert.equal(body.get('mode'),'subscription');assert.equal(body.get('line_items[0][price_data][unit_amount]'),'30000');assert.equal(body.get('line_items[1][price_data][unit_amount]'),'20000');assert.equal(body.get('line_items[0][price_data][recurring][interval]'),'month');assert.equal(body.get('allow_promotion_codes'),null);
});
test('unpaid, wrong amount, wrong office and test mode cannot confirm a live office',async()=>{
  for(const patch of [{payment_status:'unpaid'},{amount_total:20000},{livemode:false},{client_reference_id:'43'},{metadata:{gigtax_enrollment:'43',terms_hash:info.terms.hash}}]){
    const p=payments(env,async()=>Response.json({...session(),...patch}));await assert.rejects(p.verify(row,info));
  }
});
test('verification confirms the subscription amount and installs its 12-month billing stop before activation',async()=>{
  const calls=[],sub=subscription();const p=payments(env,async(url,options)=>{calls.push({url,options});if(url.includes('/checkout/'))return Response.json(session());if(options.method==='POST')sub.cancel_at=Number(new URLSearchParams(options.body).get('cancel_at'));return Response.json(sub);});
  const result=await p.verify(row,info);assert.equal(calls.length,3);assert.equal(result.initialAmountCents,50000);assert.equal(sub.cancel_at,endOfTerm(sub.billing_cycle_anchor));assert(result.live);
});
test('subscription amount mismatch and failed term-stop configuration prevent activation',async()=>{
  for(const bad of ['amount','end']){
    const sub=subscription();if(bad==='amount')sub.items.data[0].price.unit_amount=1;
    const p=payments(env,async url=>Response.json(url.includes('/checkout/')?session():sub));await assert.rejects(p.verify(row,info));
  }
});
test('term date clamps leap-day billing to February 28 of the following year',()=>{
  assert.equal(new Date(endOfTerm(Date.parse('2028-02-29T12:30:00Z')/1000)*1000).toISOString(),'2029-02-28T12:30:00.000Z');
});
test('signed webhooks verify exact raw bytes and reject tampering, duplicates and stale signatures',()=>{
  const raw=Buffer.from('{"type":"checkout.session.completed"}'),now=1794009600000,t=String(now/1000),key='whsec_synthetic';
  const sig=createHmac('sha256',key).update(`${t}.`).update(raw).digest('hex');
  assert(verifyWebhook(raw,`t=${t},v1=${sig}`,key,now));assert(!verifyWebhook(Buffer.from('{}'),`t=${t},v1=${sig}`,key,now));assert(!verifyWebhook(raw,`t=${t},t=${t},v1=${sig}`,key,now));assert(!verifyWebhook(raw,`t=${t},v1=${sig}`,key,now+600000));
});
test('missing payment account fails before a provider request',async()=>{
  let called=false;const p=payments({},async()=>{called=true;});await assert.rejects(p.create(row,info,'test'),/need the GigTax Stripe/);assert(!called);
});
