import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOfficeTransition,assertOfficeBody,officeSnapshot,officeObjectId,officeLedgers} from '../office-model.mjs';
import {DEFAULT_BOOK_ACCOUNTS} from '../case-books.mjs';
import {feeTotals} from '../office-billing.mjs';
import {applyCaseTransition,caseSnapshot,caseBookVersion} from '../case-model.mjs';
import {newReturn} from '../../tax-engine/index.mjs';
import {encode64} from '../envelope.mjs';
const actor='synthetic-staff',at='2026-11-12T12:00:00.000Z',command=(type,input)=>({actionId:crypto.randomUUID(),type,input}),apply=(body,type,input,evidence=null)=>applyOfficeTransition(body,command(type,input),{actor,at,evidence});
const create=()=>apply(null,'office.create',{title:'Synthetic client finance',notes:''});
const open=(body,ledgerId='synthetic-ledger',from='2025-01-01',through='2025-12-31')=>apply(body,'ledger.open',{ledgerId,title:'Synthetic business ledger',currency:'USD',from,through,accounts:structuredClone(DEFAULT_BOOK_ACCOUNTS),notes:''});
const issue=(body,invoiceId='invoice-one',number='SYN-1')=>apply(body,'fee.issue',{invoiceId,number,date:'2025-01-01',due:'2025-02-01',issuer:'Synthetic firm',billTo:'Synthetic client',lines:[{description:'Tax services',quantity:'2.5',unitCents:4000,discountCents:0,taxCents:0}],terms:'Net 30',notes:''});
const settle=(body,type,amountCents,reference,date='2025-01-02')=>apply(body,type,{invoiceId:'invoice-one',date,amountCents,method:'Synthetic recorded bank transfer',reference,document:null,notes:''});
test('canonical routing pins the same client finance record across cases and distinguishes every scope',async()=>{
  const scope={workspaceId:'synthetic-firm',accountId:'synthetic-account',clientId:'synthetic-client'},id=await officeObjectId(scope);assert.match(id,/^shuug-case:[a-f0-9]{64}$/);assert.equal(await officeObjectId({...scope}),id);
  for(const key of Object.keys(scope))assert.notEqual(await officeObjectId({...scope,[key]:'another-scope'}),id);
});
test('fee history reconciles partial payments, credits, refunds and voids without conflating business receipts',()=>{
  let body=open(issue(create()));const original=structuredClone(body);
  body=settle(body,'fee.payment',4000,'payment-one');body=apply(body,'fee.credit',{invoiceId:'invoice-one',date:'2025-01-03',amountCents:2000,reason:'Reduced fee',notes:''});
  assert.equal(officeSnapshot(body,new Map()).fees.totals.outstandingCents,4000);body=settle(body,'fee.payment',4000,'payment-two','2025-01-04');body=apply(body,'fee.credit',{invoiceId:'invoice-one',date:'2025-01-05',amountCents:1000,reason:'Additional correction',notes:''});
  assert.equal(officeSnapshot(body,new Map()).fees.totals.outstandingCents,-1000);body=settle(body,'fee.refund',1000,'refund-one','2025-01-06');
  let view=officeSnapshot(body,new Map());assert.deepEqual(view.fees.totals,{invoicedCents:10000,creditedCents:3000,paidCents:8000,refundedCents:1000,outstandingCents:0});assert.equal(view.ledgers[0].report.bankCents,0);assert.equal(view.ledgers[0].entries.length,0);assert.equal(view.fees.paymentCollectionActivated,false);assert.deepEqual(body.history.slice(0,original.history.length),original.history);
  body=issue(body,'invoice-two','SYN-2');body=apply(body,'fee.void',{invoiceId:'invoice-two',date:'2025-01-01',reason:'Created in error',notes:''});view=officeSnapshot(body,new Map());assert.equal(view.fees.totals.invoicedCents,10000);assert.equal(view.fees.invoices.length,2);assert.equal(view.fees.invoices[1].voided,true);
});
test('duplicate settlements, excess payments/credits/refunds and erased invoice activity are refused',()=>{
  let body=issue(create());assert.throws(()=>settle(body,'fee.payment',10001,'excess'),/outstanding/);assert.throws(()=>settle(body,'fee.refund',1,'no-credit'),/Refund/);assert.throws(()=>issue(body),/unique/);
  body=settle(body,'fee.payment',4000,'same-reference');assert.throws(()=>settle(body,'fee.payment',1000,'same-reference'),/already recorded/);assert.throws(()=>apply(body,'fee.void',{invoiceId:'invoice-one',date:'2025-01-02',reason:'Erase payment',notes:''}),/financial activity/);
  assert.throws(()=>apply(body,'fee.credit',{invoiceId:'invoice-one',date:'2025-01-03',amountCents:10001,reason:'Excess',notes:''}),/uncredited/);assert.throws(()=>settle(body,'fee.payment',1,'backdated','2025-01-01'),/chronological/);assert.throws(()=>settle(body,'fee.payment',1,'future','2027-01-01'),/future/);
  const wrong=structuredClone(body);wrong.history.at(-1).input.amountCents=10001;assert.throws(()=>assertOfficeBody(wrong));wrong.history.at(-1).input.amountCents=4000;wrong.total=0;assert.throws(()=>assertOfficeBody(wrong));
});
test('fiscal ledgers share the accounting rules, refuse overlapping periods and keep history immutable',()=>{
  let body=open(create(),'fiscal','2024-07-01','2025-06-30');body=apply(body,'ledger.journal.post',{ledgerId:'fiscal',date:'2025-01-01',memo:'Synthetic revenue',lines:[{accountNumber:1000,debitCents:12345,creditCents:0},{accountNumber:4000,debitCents:0,creditCents:12345}],document:null,notes:''});assert.equal(officeSnapshot(body,new Map()).ledgers[0].report.bankCents,12345);
  assert.throws(()=>open(body,'overlap','2025-01-01','2025-12-31'),/overlap/);assert.throws(()=>open(create(),'long','2024-01-01','2025-12-31'),/366/);
  body=apply(body,'ledger.period.close',{ledgerId:'fiscal',through:'2025-01-31',notes:'Reconciled'});assert.throws(()=>apply(body,'ledger.journal.post',{ledgerId:'fiscal',date:'2025-01-01',memo:'Backdated',lines:[{accountNumber:1000,debitCents:1,creditCents:0},{accountNumber:4000,debitCents:0,creditCents:1}],document:null,notes:''}),/closed/);
  body=open(body,'next','2025-07-01','2026-06-30');assert.equal(officeLedgers(body.history).length,2);
});
test('two tax cases reference one ledger; fee updates preserve book review and journal changes invalidate both',()=>{
  let office=open(create());const ref={objectId:'synthetic-office-reference',revision:office.history.length,envelopeDigest:encode64(new Uint8Array(32).fill(3)),domain:'tax-document'},draftRef={...ref,objectId:'synthetic-draft',revision:1},draft=newReturn('1040'),fileRef={...ref,objectId:'synthetic-file',revision:1},bytes=new TextEncoder().encode('%PDF-SYNTHETIC'),file={version:1,type:'private-file',filename:'source.pdf',mime:'application/pdf',data:encode64(bytes),byteLength:bytes.length,purpose:'tax-document',category:'tax',notes:'',savedAt:at};
  const caseApply=(body,type,input,evidence=null)=>applyCaseTransition(body,command(type,input),{actor,at,evidence});
  const records=new Map([[ref.objectId,{...ref,verifiedOffice:office}],[draftRef.objectId,draftRef],[fileRef.objectId,fileRef]]),cases=[];
  for(let i=0;i<2;i++){let body=caseApply(null,'case.create',{title:'Synthetic case '+i,year:2025,kind:'1040'});body=caseApply(body,'request.add',{requestId:'request',title:'Income file',due:'',notes:''});body=caseApply(body,'document.review',{requestId:'request',document:fileRef,decision:'reviewed',notes:''},{reference:fileRef,payload:file});body=caseApply(body,'books.link',{document:ref,ledgerId:'synthetic-ledger',ledgerVersion:officeLedgers(office.history)[0].version,notes:''},{reference:ref,payload:{version:1,type:'client-office',body:office,certificate:{}}});body=caseApply(body,'draft.link',{document:draftRef,notes:'',booksVersion:caseBookVersion(body.history,2025)},{reference:draftRef,payload:draft});assert.equal(caseSnapshot(body,records).ready,true);cases.push(body);}
  office=issue(office);records.set(ref.objectId,{...ref,revision:office.history.length,verifiedOffice:office});for(const body of cases)assert.equal(caseSnapshot(body,records).ready,true);
  office=apply(office,'ledger.account.add',{ledgerId:'synthetic-ledger',account:{number:1050,name:'Second bank',classification:'bank'},notes:''});records.set(ref.objectId,{...ref,revision:office.history.length,verifiedOffice:office});for(const body of cases){assert.equal(caseSnapshot(body,records).ready,false);assert.equal(caseSnapshot(body,records).bookLink.freshness,'stale');assert.equal(caseSnapshot(body,records).draft.booksFreshness,'stale');assert.throws(()=>caseApply(body,'books.open',{title:'Shadow books',currency:'USD',from:'2025-01-01',through:'2025-12-31',accounts:structuredClone(DEFAULT_BOOK_ACCOUNTS),notes:''}));}records.delete(ref.objectId);assert.equal(caseSnapshot(cases[0],records).bookLink.freshness,'unavailable');
});
test('invoice quantities use exact decimal rounding and reject excess values',()=>{
  assert.equal(feeTotals([{description:'Fractional',quantity:'0.3333',unitCents:100,discountCents:0,taxCents:0}]).totalCents,33);assert.equal(feeTotals([{description:'Half cent',quantity:'0.005',unitCents:100,discountCents:0,taxCents:0}]).totalCents,1);
  for(const quantity of ['1e6','0','-1','1.00001'])assert.throws(()=>feeTotals([{description:'Bad',quantity,unitCents:100,discountCents:0,taxCents:0}]));
});
