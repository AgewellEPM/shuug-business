import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {officeObjectId,officeSnapshot,officeLedgers} from '../packages/secure-tax-client/office-model.mjs';
import {caseSnapshot,caseBookVersion} from '../packages/secure-tax-client/case-model.mjs';
import {DEFAULT_BOOK_ACCOUNTS} from '../packages/secure-tax-client/case-books.mjs';

/** Uses the parent proof's actual HTTP-backed readers and approval/publication
 * path. All values are synthetic; no separate live custody is implied. */
export async function proveClientFinance({scope,readers,caseIds,taxReturns,caseAction,reference,marker}){
  const id=await caseAction(null,'office.create',{title:`Synthetic client finance ${marker}`,notes:marker});
  assert.equal(id,await officeObjectId(scope));
  const ledgerId=randomUUID(),invoiceId=randomUUID();
  await caseAction(id,'ledger.open',{ledgerId,title:`Synthetic canonical ledger ${marker}`,currency:'USD',from:'2025-01-01',through:'2025-12-31',accounts:structuredClone(DEFAULT_BOOK_ACCOUNTS),notes:marker});
  await caseAction(id,'ledger.journal.post',{ledgerId,date:'2025-01-01',memo:`Synthetic shared revenue ${marker}`,lines:[{accountNumber:1000,debitCents:12000,creditCents:0},{accountNumber:4000,debitCents:0,creditCents:12000}],document:null,notes:''});
  await caseAction(id,'ledger.period.close',{ledgerId,through:'2025-01-31',notes:'Synthetic reconciled January'});
  async function reviewCases(){
    const ledger=officeLedgers(readers[0].records.get(id).verifiedOffice.history)[0];
    for(const item of caseIds){
      await caseAction(item.id,'books.link',{document:reference(id),ledgerId,ledgerVersion:ledger.version,notes:'Synthetic shared books review'},id);
      const body=readers[0].records.get(item.id).verifiedCase,draft=taxReturns.find(value=>value.kind===item.kind);
      await caseAction(item.id,'draft.link',{document:reference(draft.objectId),booksVersion:caseBookVersion(body.history,body.year),notes:'Synthetic draft reviewed against shared books'},draft.objectId);
    }
  }
  await reviewCases();
  const check=(balance,review='current')=>{
    for(const reader of readers){
      const finance=officeSnapshot(reader.records.get(id).verifiedOffice,reader.records);
      assert.equal(finance.fees.totals.outstandingCents,balance);assert.equal(finance.ledgers[0].report.bankCents,12000);
      for(const item of caseIds){const snapshot=caseSnapshot(reader.records.get(item.id).verifiedCase,reader.records);assert.equal(snapshot.books.report.bankCents,12000);assert.equal(snapshot.draft.booksFreshness,review);}
    }
  };
  await caseAction(id,'fee.issue',{invoiceId,number:'SYNTHETIC-001',date:'2026-11-01',due:'2026-12-01',issuer:`Synthetic firm ${marker}`,billTo:`Synthetic client ${marker}`,lines:[{description:'Synthetic preparation fee',quantity:'1',unitCents:10000,discountCents:0,taxCents:0}],terms:'Synthetic invoice only',notes:marker});check(10000);
  await caseAction(id,'fee.payment',{invoiceId,date:'2026-11-02',amountCents:4000,method:'check',reference:'SYNTHETIC-PAYMENT-1',document:null,notes:''});check(6000);
  await caseAction(id,'fee.credit',{invoiceId,date:'2026-11-03',amountCents:2000,reason:'Synthetic adjustment',notes:''});check(4000);
  await caseAction(id,'fee.payment',{invoiceId,date:'2026-11-04',amountCents:4000,method:'check',reference:'SYNTHETIC-PAYMENT-2',document:null,notes:''});check(0);
  await caseAction(id,'fee.credit',{invoiceId,date:'2026-11-05',amountCents:1000,reason:'Synthetic retained refund credit',notes:''});check(-1000);
  await caseAction(id,'fee.refund',{invoiceId,date:'2026-11-06',amountCents:1000,method:'check',reference:'SYNTHETIC-REFUND-1',document:null,notes:''});check(0);
  await caseAction(id,'ledger.account.add',{ledgerId,account:{number:1050,name:'Synthetic second bank',classification:'bank'},notes:''});check(0,'stale');
  await reviewCases();check(0);
  return {id,body:structuredClone(readers[0].records.get(id).verifiedOffice),proof:{canonicalPerEnrolledClientAccount:true,sharedAcrossCases:caseIds.length,clientAndStaffBalanceCents:0,invoiceCents:10000,paymentsCents:8000,creditsCents:3000,refundsCents:1000,businessBankCents:12000,feeChangesPreserveBookReview:true,bookChangesInvalidateAllLinkedCases:true,exactSharedBookReviewRestored:true,paymentCollectionActivated:false,legacyDataImported:false}};
}

export function verifyRestoredFinance(expected,readers){
  for(const reader of readers){const body=reader.records.get(expected.id).verifiedOffice;assert.deepEqual(body,expected.body);const finance=officeSnapshot(body,reader.records);assert.equal(finance.fees.totals.outstandingCents,0);assert.equal(finance.fees.totals.refundedCents,1000);assert.equal(finance.ledgers[0].report.bankCents,12000);}
  expected.proof.cleanRestoreVerified=true;
}
