import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from './model.mjs';

export function verifyWebhook(raw, signature, key, now = Date.now()) {
  if (!key?.startsWith('whsec_') || typeof signature !== 'string' || signature.length > 4096) return false;
  const values=signature.split(',').map(p=>p.split('=')), times=values.filter(([k])=>k==='t');
  if(times.length!==1||!/^\d{10}$/.test(times[0][1])||Math.abs(now/1000-Number(times[0][1]))>300)return false;
  const expected=createHmac('sha256',key).update(`${times[0][1]}.`).update(raw).digest();
  return values.filter(([k,v])=>k==='v1'&&/^[a-f0-9]{64}$/.test(v||'')).some(([,v])=>timingSafeEqual(expected,Buffer.from(v,'hex')));
}
export function endOfTerm(anchor) {
  const date=new Date(anchor*1000),year=date.getUTCFullYear()+1,month=date.getUTCMonth(),day=date.getUTCDate();
  date.setUTCDate(1);date.setUTCFullYear(year);date.setUTCMonth(month);
  const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));
  return Math.floor(date.getTime()/1000);
}
export function payments(env,fetcher=fetch) {
  const configured=()=>/^sk_(live|test)_/.test(env.GIGTAX_STRIPE_SECRET_KEY||'')&&/^whsec_/.test(env.GIGTAX_STRIPE_WEBHOOK_SECRET||'');
  async function stripe(route,method='GET',params,idempotency) {
    if(!configured())throw new HttpError(503,'Office payments need the GigTax Stripe account and webhook connection. No payment was taken.');
    const r=await fetcher('https://api.stripe.com/v1'+route,{method,headers:{Authorization:`Bearer ${env.GIGTAX_STRIPE_SECRET_KEY}`,'Content-Type':'application/x-www-form-urlencoded','Stripe-Version':'2026-10-28.endive',...(idempotency?{'Idempotency-Key':idempotency}:{})},...(params?{body:new URLSearchParams(params).toString()}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
    const j=await r.json();if(!r.ok)throw new HttpError(502,'Stripe did not confirm this payment operation. Do not create another enrollment; retry this one.');return j;
  }
  async function create(row,info,returnToken) {
    const fragment=new URLSearchParams({id:row.id,token:returnToken});
    const params={mode:'subscription',customer_email:row.contact_email,client_reference_id:String(row.id),success_url:`${env.GIGTAX_SALES_ORIGIN}/office-signup#${fragment}&payment=return`,cancel_url:`${env.GIGTAX_SALES_ORIGIN}/office-signup#${fragment}&payment=cancelled`,'metadata[gigtax_enrollment]':String(row.id),'metadata[terms_hash]':info.terms.hash,'subscription_data[metadata][gigtax_enrollment]':String(row.id),'subscription_data[metadata][terms_hash]':info.terms.hash,'payment_method_types[0]':'card','line_items[0][price_data][currency]':'usd','line_items[0][price_data][unit_amount]':'30000','line_items[0][price_data][recurring][interval]':'month','line_items[0][price_data][product_data][name]':'Gig Tax Pros · office membership (12 months)','line_items[0][quantity]':'1','line_items[1][price_data][currency]':'usd','line_items[1][price_data][unit_amount]':'20000','line_items[1][price_data][product_data][name]':'Gig Tax Pros · one-time office enrollment','line_items[1][quantity]':'1',expires_at:String(Math.floor(Date.now()/1000)+1800)};
    // Stripe requires at least 30 minutes from the API request; using one hour
    // leaves room for the consent save and network round trips. Keep retries
    // byte-identical for the same provider idempotency key.
    params.expires_at=String(Math.floor(new Date(info.acceptedAt).getTime()/1000)+3600);
    if(info.checkoutId){const existing=await stripe(`/checkout/sessions/${info.checkoutId}`);validateSession(existing,row,info,false);if(existing.status==='expired')throw new HttpError(409,'This checkout expired. Ask the workspace owner to review and renew the invitation.');return existing;}
    const session=await stripe('/checkout/sessions','POST',params,`gigtax-office-${row.id}-${info.terms.hash}`);
    validateSession(session,row,info,false);
    if(session.status==='expired')throw new HttpError(409,'This checkout expired. Ask the workspace owner to review and renew the invitation.');
    if(session.url){const url=new URL(session.url);if(url.origin!=='https://checkout.stripe.com'||url.username||url.password)throw new HttpError(502,'Stripe returned an unexpected checkout URL.');}
    return session;
  }
  function validateSession(s,row,info,paid) {
    const live=env.GIGTAX_STRIPE_SECRET_KEY.startsWith('sk_live_');
    if(!/^cs_[a-zA-Z0-9_]+$/.test(s.id||'')||s.mode!=='subscription'||s.client_reference_id!==String(row.id)||s.metadata?.gigtax_enrollment!==String(row.id)||s.metadata?.terms_hash!==info.terms.hash||s.currency!=='usd'||s.amount_total!==50000||s.livemode!==live||s.customer_email?.toLowerCase()!==row.contact_email)throw new HttpError(409,'The payment account, office, currency or amount does not match this enrollment.');
    if(paid&&(s.status!=='complete'||s.payment_status!=='paid'))throw new HttpError(409,'The initial $500 payment has not been confirmed.');
  }
  async function verify(row,info,sessionId=info.checkoutId) {
    if(!/^cs_[a-zA-Z0-9_]+$/.test(sessionId||''))throw new HttpError(409,'No checkout session has been confirmed for this enrollment.');
    const session=await stripe(`/checkout/sessions/${sessionId}`);
    validateSession(session,row,info,true);
    if(info.checkoutId&&session.id!==info.checkoutId)throw new HttpError(409,'This payment belongs to a different checkout.');
    if(!/^sub_[a-zA-Z0-9_]+$/.test(session.subscription||''))throw new HttpError(409,'The monthly subscription was not confirmed.');
    let sub=await stripe(`/subscriptions/${session.subscription}`);
    const items=sub.items?.data||[];
    if(sub.status!=='active'||sub.livemode!==session.livemode||sub.customer!==session.customer||sub.metadata?.gigtax_enrollment!==String(row.id)||sub.metadata?.terms_hash!==info.terms.hash||items.length!==1||items[0].quantity!==1||items[0].price?.unit_amount!==30000||items[0].price?.currency!=='usd'||items[0].price?.recurring?.interval!=='month'||items[0].price?.recurring?.interval_count!==1||!Number.isInteger(sub.billing_cycle_anchor))throw new HttpError(409,'The subscription does not match the approved $300 monthly membership.');
    const end=endOfTerm(sub.billing_cycle_anchor);
    if(sub.cancel_at!==end)sub=await stripe(`/subscriptions/${sub.id}`,'POST',{cancel_at:String(end),proration_behavior:'none'},`gigtax-term-${row.id}-${sub.id}`);
    if(sub.cancel_at!==end)throw new HttpError(502,'The 12-month billing end was not confirmed. Activation is pending.');
    const paidThrough=items[0].current_period_end ?? sub.current_period_end;
    if(!Number.isInteger(paidThrough)||paidThrough<=Date.now()/1000||paidThrough>end)throw new HttpError(409,'The initial paid billing period was not confirmed. Activation is pending.');
    const invoiceId=typeof session.invoice==='string'?session.invoice:typeof sub.latest_invoice==='string'?sub.latest_invoice:null;
    if(!/^in_[a-zA-Z0-9_]+$/.test(invoiceId||''))throw new HttpError(409,'The initial membership invoice was not confirmed.');
    return {checkoutId:session.id,subscriptionId:sub.id,customerId:session.customer,invoiceId,initialAmountCents:50000,currency:'USD',live:session.livemode,billingEndsAt:new Date(end*1000).toISOString(),paidThroughAt:new Date(paidThrough*1000).toISOString(),verifiedAt:new Date().toISOString()};
  }
  async function checkoutState(row,info) {
    if(!/^cs_[a-zA-Z0-9_]+$/.test(info.checkoutId||''))throw new HttpError(409,'No checkout session is saved for this enrollment.');
    const session=await stripe(`/checkout/sessions/${info.checkoutId}`);
    validateSession(session,row,info,false);
    return {id:session.id,status:session.status,paymentStatus:session.payment_status};
  }
  return {configured,create,verify,checkoutState};
}
