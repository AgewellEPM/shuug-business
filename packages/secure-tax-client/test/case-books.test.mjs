import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_BOOK_ACCOUNTS,replayCaseBooks,caseBookReport,caseBookCsv} from '../case-books.mjs';
import {applyCaseTransition,assertCaseBody,caseSnapshot} from '../case-model.mjs';
import {parseBookAmount} from '../browser/case-books-editor.mjs';
import {encode64} from '../envelope.mjs';
import {newReturn} from '../../tax-engine/index.mjs';
const actor='synthetic-bookkeeper',at='2026-11-12T12:00:00.000Z';
const apply=(body,type,input,evidence=null,actionId=crypto.randomUUID())=>applyCaseTransition(body,{actionId,type,input},{actor,at,evidence});
const create=(kind='1040')=>apply(null,'case.create',{title:'Synthetic bookkeeping case',year:2025,kind});
const open=body=>apply(body,'books.open',{title:'Synthetic case books',currency:'USD',from:'2025-01-01',through:'2025-12-31',accounts:structuredClone(DEFAULT_BOOK_ACCOUNTS),notes:''});
const line=(accountNumber,debitCents,creditCents)=>({accountNumber,debitCents,creditCents});
const post=(body,date,memo,lines,changes={},evidence=null)=>apply(body,'books.journal.post',{date,memo,lines,document:null,notes:'Synthetic reviewed posting',...changes},evidence);
const books=body=>replayCaseBooks(body.history,body.year);
const report=body=>caseBookReport(books(body));
const reference={objectId:'synthetic-book-source',revision:1,envelopeDigest:encode64(new Uint8Array(32).fill(4)),domain:'tax-document'};
const raw=new TextEncoder().encode('%PDF-1.7\nSynthetic book evidence\n%%EOF');
const evidence={reference,payload:{version:1,type:'private-file',filename:'synthetic-source.pdf',mime:'application/pdf',data:encode64(raw),byteLength:raw.length,purpose:'bank-statement',category:'banking',notes:'',savedAt:at}};

test('both case families reconstruct balanced books with receivables, collections, payables and period reporting',()=>{
  for(const kind of ['1040','1120']){
    let body=open(create(kind));const original=body,initial=structuredClone(body);
    body=post(body,'2025-01-01','Opening capital',[line(1000,100000,0),line(3000,0,100000)]);
    body=post(body,'2025-01-15','Customer invoice',[line(1200,50000,0),line(4000,0,50000)]);
    body=post(body,'2025-02-01','Partial collection',[line(1000,20000,0),line(1200,0,20000)]);
    body=post(body,'2025-02-02','Supplier expense',[line(6000,10000,0),line(2000,0,10000)]);
    assert.deepEqual(original,initial);const result=report(body);
    assert.equal(result.basis,'ledger');assert.equal(result.bankCents,120000);assert.equal(result.receivableCents,30000);assert.equal(result.payableCents,10000);assert.equal(result.assetsCents,150000);assert.equal(result.liabilitiesCents,10000);assert.equal(result.equityCents,100000);assert.equal(result.netIncomeCents,40000);assert.equal(result.unclosedIncomeCents,40000);assert.equal(result.debitCents,160000);assert.equal(result.creditCents,160000);assert.equal(result.balanced,true);
    const feb=caseBookReport(books(body),{from:'2025-02-01',through:'2025-02-28'});assert.equal(feb.bankCents,120000);assert.equal(feb.incomeCents,0);assert.equal(feb.expenseCents,10000);assert.equal(feb.netIncomeCents,-10000);assert.equal(feb.unclosedIncomeCents,40000);
    const jan=caseBookReport(books(body),{through:'2025-01-31'});assert.equal(jan.bankCents,100000);assert.equal(jan.receivableCents,50000);assert.equal(jan.payableCents,0);assert.equal(jan.netIncomeCents,50000);
  }
});
test('unbalanced, fractional, unknown, repeated and zero-side journal lines fail before any approved state can exist',()=>{
  const body=open(create()),before=structuredClone(body);
  for(const entries of [[line(1000,1,0),line(4000,0,2)],[line(1000,0.5,0),line(4000,0,0.5)],[line(9999,1,0),line(4000,0,1)],[line(1000,1,0),line(1000,0,1)],[line(1000,1,1),line(4000,0,0)],[line(1000,100000000000,0),line(4000,0,100000000000)],[line(1000,-1,0),line(4000,0,-1)]])assert.throws(()=>post(body,'2025-01-02','Invalid journal',entries));
  assert.deepEqual(body,before);for(const date of ['2024-12-31','2026-01-01','2025-02-29','2025-13-01'])assert.throws(()=>post(body,date,'Invalid date',[line(1000,1,0),line(4000,0,1)]));
});
test('period locks retain original journals and permit one later reversal without rewriting earlier reports',()=>{
  let body=post(open(create()),'2025-01-01','Original',[line(1000,10001,0),line(4000,0,10001)]);const original=books(body).entries[0],before=structuredClone(body);
  body=apply(body,'books.period.close',{through:'2025-01-31',notes:'Reconciled through January.'});
  assert.throws(()=>post(body,'2025-01-31','Backdated',[line(1000,1,0),line(4000,0,1)]),/closed/);
  assert.throws(()=>apply(body,'books.journal.reverse',{entryId:original.id,date:'2025-01-15',reason:'Correction',notes:''}),/closed/);
  body=apply(body,'books.journal.reverse',{entryId:original.id,date:'2025-02-01',reason:'Correct duplicate receipt',notes:''});
  assert.equal(report(body).bankCents,0);assert.equal(report(body).netIncomeCents,0);assert.equal(caseBookReport(books(body),{through:'2025-01-31'}).netIncomeCents,10001);assert.deepEqual(body.history.slice(0,3),before.history);
  assert.throws(()=>apply(body,'books.journal.reverse',{entryId:original.id,date:'2025-02-02',reason:'Again',notes:''}),/unreversed/);
  assert.throws(()=>apply(body,'books.journal.reverse',{entryId:books(body).entries[1].id,date:'2025-02-02',reason:'Reverse reversal',notes:''}),/unreversed/);
  for(const through of ['2025-01-31','2025-01-01','2026-01-01'])assert.throws(()=>apply(body,'books.period.close',{through,notes:'Invalid close'}));
});
test('custom classified accounts are included directly and cannot change an earlier chart or overwrite history',()=>{
  let body=open(create());body=apply(body,'books.account.add',{account:{number:1050,name:'Second bank',classification:'bank'},notes:''});body=post(body,'2025-03-01','Second bank opening',[line(1050,999,0),line(3000,0,999)]);assert.equal(report(body).bankCents,999);
  assert.throws(()=>apply(body,'books.account.add',{account:{number:1050,name:'Overwrite',classification:'income'},notes:''}),/unused/);
  assert.throws(()=>open(body),/already/);assert.throws(()=>post(create(),'2025-01-01','No ledger',[line(1000,1,0),line(4000,0,1)]),/Open/);
  const changed=structuredClone(body);changed.history[1].input.accounts=changed.history[1].input.accounts.filter(item=>item.number!==3000);assert.throws(()=>assertCaseBody(changed),/existing account/);
  const empty=structuredClone(body);empty.history[1].input.currency='EUR';assert.throws(()=>assertCaseBody(empty));
});
test('exact supporting file evidence is mandatory when selected and stale sources block readiness until corrected',()=>{
  let body=open(create());const journal={date:'2025-01-01',memo:'Source posting',lines:[line(1000,100,0),line(4000,0,100)],document:reference,notes:''};
  assert.throws(()=>apply(body,'books.journal.post',journal));assert.throws(()=>apply(body,'books.journal.post',{...journal,document:{...reference,revision:2}},evidence));
  assert.throws(()=>apply(body,'books.journal.post',journal,{reference,payload:newReturn('1040')}));
  body=apply(body,'books.journal.post',journal,evidence);const records=new Map([[reference.objectId,{...reference}]]);assert.equal(caseSnapshot(body,records).books.sourcesCurrent,true);
  records.get(reference.objectId).revision=2;assert.equal(caseSnapshot(body,records).books.sourcesCurrent,false);assert.equal(caseSnapshot(body,records).books.sources[0].freshness,'stale');records.clear();assert.equal(caseSnapshot(body,records).books.sources[0].freshness,'unavailable');
  body=apply(body,'books.journal.reverse',{entryId:books(body).entries[0].id,date:'2025-01-02',reason:'Withdraw unsupported posting',notes:''});assert.equal(caseSnapshot(body,records).books.sourcesCurrent,true);assert.equal(caseSnapshot(body,records).books.sources[0].active,false);assert.equal(report(body).bankCents,0);
});
test('draft review binds exact book version and becomes stale even for a later balanced adjustment',()=>{
  let body=create();body=apply(body,'request.add',{requestId:'source-request',title:'Income source',due:'',notes:''});body=apply(body,'document.review',{requestId:'source-request',document:reference,decision:'reviewed',notes:''},evidence);
  const draftReference={...reference,objectId:'synthetic-draft'},draft={reference:draftReference,payload:newReturn('1040')},records=new Map([reference,draftReference].map(value=>[value.objectId,value]));
  body=apply(body,'draft.link',{document:draftReference,notes:''},draft);assert.equal(caseSnapshot(body,records).ready,true);
  body=open(body);assert.equal(caseSnapshot(body,records).draft.booksFreshness,'stale');assert.equal(caseSnapshot(body,records).ready,false);
  assert.throws(()=>apply(body,'draft.link',{document:draftReference,notes:''},draft));assert.throws(()=>apply(body,'draft.link',{document:draftReference,notes:'',booksVersion:'wrong-version'},draft));
  body=apply(body,'draft.link',{document:draftReference,notes:'Book review complete',booksVersion:books(body).version},draft);assert.equal(caseSnapshot(body,records).ready,true);
  const unchanged=structuredClone(body);body=post(body,'2025-05-01','Adjustment',[line(6000,1234,0),line(1000,0,1234)]);assert.deepEqual(unchanged.draft,body.draft);assert.equal(caseSnapshot(body,records).draft.freshness,'current');assert.equal(caseSnapshot(body,records).draft.booksFreshness,'stale');assert.equal(caseSnapshot(body,records).filingReady,false);
});
test('exact decimal inputs and private CSV never silently round or enable spreadsheet formulas',()=>{
  for(const [value,expected]of [['',0],['0.01',1],['12.3',1230],['999999999.99',99999999999]])assert.equal(parseBookAmount(value),expected);
  for(const value of ['1.001','-1','1e3','Infinity','1,000',' 1','1000000000.00'])assert.throws(()=>parseBookAmount(value));
  let body=open(create());body=apply(body,'books.account.add',{account:{number:6010,name:'=HYPERLINK("bad")',classification:'expense'},notes:''});const csv=caseBookCsv(report(body));assert(csv.includes('"\'=HYPERLINK(""bad"")"'));assert(csv.includes('Debit cents'));assert.throws(()=>caseBookReport(books(body),{from:'2026-01-01'}));
});

test('annual cases keep book dates and draft years bound, while 2026 is intake only',()=>{
  for(const year of [2023,2024,2026]){
    let body=apply(null,'case.create',{title:'Synthetic annual case',year,kind:'1040'});
    body=apply(body,'books.open',{title:'Annual working books',currency:'USD',from:`${year}-01-01`,through:`${year}-12-31`,accounts:structuredClone(DEFAULT_BOOK_ACCOUNTS),notes:''});
    body=post(body,`${year}-01-01`,'Annual opening',[line(1000,100,0),line(3000,0,100)]);assert.equal(report(body).bankCents,100);
    const wrong={reference,payload:newReturn('1040',2025)},input={document:reference,notes:'',booksVersion:books(body).version};assert.throws(()=>apply(body,'draft.link',input,wrong));
    if(year!==2026){const right={reference,payload:newReturn('1040',year)};body=apply(body,'draft.link',input,right);assert.equal(body.year,year);assertCaseBody(body);}
    assert.equal(caseSnapshot(body,new Map()).filingReady,false);
  }
  for(const year of [2022,2027,'2023'])assert.throws(()=>apply(null,'case.create',{title:'Unsupported case',year,kind:'1040'}));
});
