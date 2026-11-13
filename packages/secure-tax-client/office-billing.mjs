import {reject,exact,identifier,text,date,cents,add,reference} from './office-validation.mjs';
export const FEE_ACTIONS=['fee.issue','fee.credit','fee.payment','fee.refund','fee.void'];
export function feeLineTotal(line){
  exact(line,['description','quantity','unitCents','discountCents','taxCents']);text(line.description,500);cents(line.unitCents);cents(line.discountCents);cents(line.taxCents);
  if(typeof line.quantity!=='string'||!/^\d{1,7}(?:\.\d{1,4})?$/.test(line.quantity))reject('Enter a positive quantity with at most four decimal places.');
  const [whole,fraction='']=line.quantity.split('.'),quantity=BigInt(whole)*10000n+BigInt(fraction.padEnd(4,'0'));if(quantity<=0n)reject('Quantity must be positive.');
  const gross=(quantity*BigInt(line.unitCents)+5000n)/10000n;if(gross>99999999999n||line.discountCents>Number(gross))reject('Review the line price and discount.');
  const total=Number(gross)-line.discountCents+line.taxCents;cents(total);return {grossCents:Number(gross),discountCents:line.discountCents,taxCents:line.taxCents,totalCents:total};
}
export function feeTotals(lines){
  if(!Array.isArray(lines)||lines.length<1||lines.length>100)reject('An invoice needs 1–100 lines.');
  const result={grossCents:0,discountCents:0,taxCents:0,totalCents:0};for(const line of lines){const amounts=feeLineTotal(line);for(const key of Object.keys(result))result[key]=add(result[key],amounts[key]);}cents(result.totalCents,true);return result;
}
export function assertFeeInput(type,input){
  if(!FEE_ACTIONS.includes(type))reject();
  if(type==='fee.issue'){
    exact(input,['invoiceId','number','date','due','issuer','billTo','lines','terms','notes']);identifier(input.invoiceId);text(input.number,80);date(input.date);date(input.due);if(input.due<input.date)reject('The due date cannot precede the invoice date.');text(input.issuer,2000);text(input.billTo,2000);feeTotals(input.lines);text(input.terms,3000,false);text(input.notes,2000,false);
  }else{
    exact(input,['invoiceId','date',...(type==='fee.void'?['reason']:type==='fee.credit'?['amountCents','reason']:['amountCents','method','reference','document']),'notes']);identifier(input.invoiceId);date(input.date);text(input.notes,2000,false);
    if(type!=='fee.void')cents(input.amountCents,true);
    if(['fee.credit','fee.void'].includes(type))text(input.reason,1000);
    else{text(input.method,80);text(input.reference,160);if(input.document!==null)reference(input.document);}
  }return input;
}
export const feeBalance=invoice=>({totalCents:invoice.totals.totalCents,creditedCents:invoice.creditedCents,paidCents:invoice.paidCents,refundedCents:invoice.refundedCents,outstandingCents:invoice.voided?0:invoice.totals.totalCents-invoice.creditedCents-invoice.paidCents+invoice.refundedCents});
export function replayFees(history){
  const invoices=new Map(),numbers=new Set(),settlements=new Set();
  for(const event of history){
    if(!FEE_ACTIONS.includes(event.type))continue;const input=assertFeeInput(event.type,event.input);
    if(input.date>event.at.slice(0,10))reject('A posted financial event cannot have a future date.');
    if(event.type==='fee.issue'){
      if(invoices.has(input.invoiceId)||numbers.has(input.number.trim().toLocaleLowerCase('en-US')))reject('Invoice identifiers and numbers must be unique for this client.');numbers.add(input.number.trim().toLocaleLowerCase('en-US'));
      invoices.set(input.invoiceId,{...structuredClone(input),totals:feeTotals(input.lines),creditedCents:0,paidCents:0,refundedCents:0,voided:false,events:[structuredClone(event)],lastDate:input.date});continue;
    }
    const invoice=invoices.get(input.invoiceId);if(!invoice||invoice.voided)reject('Select an issued, nonvoid invoice.');if(input.date<invoice.lastDate)reject('Financial events must retain chronological posting dates.');
    const balance=feeBalance(invoice).outstandingCents;
    if(event.type==='fee.credit'){if(input.amountCents>invoice.totals.totalCents-invoice.creditedCents)reject('Credit cannot exceed the uncredited invoice total.');invoice.creditedCents=add(invoice.creditedCents,input.amountCents);}
    if(event.type==='fee.payment'||event.type==='fee.refund'){
      const key=JSON.stringify([event.type,input.method.trim().toLocaleLowerCase('en-US'),input.reference.trim()]);if(settlements.has(key))reject('This payment/refund reference was already recorded for this client.');settlements.add(key);
      if(event.type==='fee.payment'){if(input.amountCents>balance)reject('Payment cannot exceed the outstanding balance.');invoice.paidCents=add(invoice.paidCents,input.amountCents);}
      else{if(input.amountCents>Math.max(0,-balance)||input.amountCents>invoice.paidCents-invoice.refundedCents)reject('Refund cannot exceed the client credit and net recorded payments.');invoice.refundedCents=add(invoice.refundedCents,input.amountCents);}
    }
    if(event.type==='fee.void'){if(invoice.events.length!==1)reject('An invoice with financial activity needs retained credits/refunds, not voiding.');invoice.voided=true;}
    invoice.events.push(structuredClone(event));invoice.lastDate=input.date;
  }
  const items=[...invoices.values()].map(invoice=>({...invoice,balance:feeBalance(invoice)}));
  const totals={invoicedCents:0,creditedCents:0,paidCents:0,refundedCents:0,outstandingCents:0};
  for(const invoice of items){if(invoice.voided)continue;totals.invoicedCents=add(totals.invoicedCents,invoice.totals.totalCents);for(const key of ['creditedCents','paidCents','refundedCents'])totals[key]=add(totals[key],invoice[key]);totals.outstandingCents=add(totals.outstandingCents,invoice.balance.outstandingCents);}
  return {currency:'USD',invoices:items,totals,source:'certified-client-fee-history',paymentCollectionActivated:false};
}
