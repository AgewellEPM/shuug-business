import { randomUUID } from "node:crypto";
import { z } from "zod";
import { workspaceDatabase } from "../workspace/database";
import { appBaseUrl, sealSecret, openSecret } from "../connections/vault";
import { getStripeConfig } from "../payments/config";
import { checkBook } from "./client-books";
import type { WorkspaceUser } from "../auth/identity";
import { sharedBillingDocument } from "./billing-share";
import { billingBalance } from "./billing-model";
import { getPayment, pendingInvoice, putPayment, digest, type WebsitePayment } from "../website-payments/state";
import type { DatabaseSync } from "node:sqlite";
interface Connection { enabled:boolean; sealedKey:string; live:boolean }
export function billingConnection(db:DatabaseSync,bookId:string):Connection|null {
  const row=db.prepare("SELECT body FROM documents WHERE id=? AND kind='billing-connection'").get(`billing-connection:${bookId}`) as {body:string}|undefined;
  if(row)return JSON.parse(row.body);
  const office=bookId==="office"?getStripeConfig():null;
  return office?{enabled:true,sealedKey:sealSecret(office.secretKey),live:office.live}:null;
}
export function billingConnectionStatus(bookId:string) { return workspaceDatabase(db=>{const c=billingConnection(db,bookId);return{enabled:!!c?.enabled,live:c?.live??false};}); }
export function saveBillingConnection(bookId:string,raw:unknown,user:WorkspaceUser) {
  if(!user.isOwner)throw new Error("The owner must approve the payment account for each set of books.");
  const v=z.object({enabled:z.boolean(),secretKey:z.string().max(500).optional(),reviewed:z.literal(true)}).strict().parse(raw);
  const url=new URL(appBaseUrl());
  if(v.enabled&&url.protocol!=="https:"&&!["127.0.0.1","localhost"].includes(url.hostname))throw new Error("Use an HTTPS workspace before accepting payments.");
  return workspaceDatabase(db=>{
    checkBook(db,bookId,user,true);const old=billingConnection(db,bookId),key=v.secretKey?.trim()||(old?openSecret(old.sealedKey):"");
    if(v.enabled&&!/^sk_(live|test)_[A-Za-z0-9]+$/.test(key))throw new Error("Enter this business's Stripe secret key.");
    const value:Connection={enabled:v.enabled,sealedKey:key?sealSecret(key):"",live:key.startsWith("sk_live_")};
    db.prepare("INSERT INTO documents VALUES(?,'billing-connection',?) ON CONFLICT(id) DO UPDATE SET body=excluded.body").run(`billing-connection:${bookId}`,JSON.stringify(value));
    db.prepare("INSERT INTO audit(record_id,actor,action,at,snapshot) VALUES(?,?,?,?,?)").run(bookId,user.id,"billing.connection",new Date().toISOString(),JSON.stringify({enabled:value.enabled,live:value.live}));
    return {enabled:value.enabled,live:value.live};
  },true);
}
export function reserveBillingPayment(token:string,raw:unknown) {
  const amount=z.number().int().min(100).max(99_999_999).parse(raw);
  return workspaceDatabase(db=>{
    const {share,doc}=sharedBillingDocument(db,token),connection=billingConnection(db,share.bookId);
    if(doc.status!=="posted"||doc.kind!=="invoice"||!connection?.enabled)throw new Error("Online payment is unavailable for this invoice.");
    const existing=pendingInvoice(db,doc.id);if(existing)return existing;
    if(amount>billingBalance(doc).outstanding)throw new Error("Payment exceeds this invoice's remaining balance.");
    const id=randomUUID(),returnUrl=new URL(`/api/accounting/share/${token}?payment=${id}`,appBaseUrl()).href;
    const params=new URLSearchParams({mode:"payment",client_reference_id:id,"metadata[shuug_payment]":id,"payment_intent_data[metadata][shuug_payment]":id,"adaptive_pricing[enabled]":"false","line_items[0][quantity]":"1","line_items[0][price_data][currency]":"usd","line_items[0][price_data][unit_amount]":String(amount),"line_items[0][price_data][product_data][name]":`${doc.heading} ${doc.number}`,...(doc.party.email?{customer_email:doc.party.email}:{}),success_url:returnUrl,cancel_url:returnUrl,expires_at:String(Math.floor(Date.now()/1000)+23*3600)});
    const p:WebsitePayment={id,kind:"book_invoice",bookId:share.bookId,invoiceId:doc.id,accountId:null,amount,currency:"USD",title:`${doc.heading} ${doc.number}`,status:"creating",live:connection.live,createdAt:new Date().toISOString(),checkedAt:null,nextCheck:Date.now()+60000,attempts:0,sessionId:null,intentId:null,checkoutUrl:null,sealedKey:connection.sealedKey,parameters:params.toString(),requestHash:digest(doc.id+":"+amount),receiptHash:null,donor:null,recordId:null,paymentId:null,error:null};
    return putPayment(db,p);
  },true);
}
export function sharedPayment(token:string,id:string) {
  z.uuid().parse(id);return workspaceDatabase(db=>{const {share,doc}=sharedBillingDocument(db,token),p=getPayment(db,id);if(!p||p.kind!=="book_invoice"||p.bookId!==share.bookId||p.invoiceId!==doc.id)throw new Error("Payment unavailable for this invoice.");return p;});
}
