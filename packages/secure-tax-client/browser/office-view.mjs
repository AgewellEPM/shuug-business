import {officeSnapshot} from '../office-model.mjs';
import {renderCaseBooks,bookMoney} from './case-books-view.mjs';
import {feeLineTotal} from '../office-billing.mjs';
const node=(document,tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
export function renderOffice(document,record,records){
  const section=node(document,'section');section.className='client-finance';
  if(!record?.verifiedOffice){section.append(node(document,'p','The firm signature on this client finance record could not be verified.'));return section;}
  const view=officeSnapshot(record.verifiedOffice,records);section.append(node(document,'h3',view.title),node(document,'p','Verified encrypted client books and firm billing. Updates require separate firm approval.'));
  const totals=view.fees.totals,fees=node(document,'section');fees.className='firm-fee-balance';fees.dataset.balanceCents=String(totals.outstandingCents);
  fees.append(node(document,'h4','Your account with the tax firm'),node(document,'strong',totals.outstandingCents<0?`Client credit: ${bookMoney(-totals.outstandingCents)} USD`:`Amount owed: ${bookMoney(totals.outstandingCents)} USD`),node(document,'p',`Invoices ${bookMoney(totals.invoicedCents)} · credits ${bookMoney(totals.creditedCents)} · recorded payments ${bookMoney(totals.paidCents)} · refunds ${bookMoney(totals.refundedCents)} USD`),node(document,'p','These are approved billing records. Recording a payment or refund does not move money. Uploaded invoice files and your business receivables are separate.'));
  for(const invoice of view.fees.invoices){
    const item=node(document,'details');item.className='firm-invoice';item.append(node(document,'summary',`Invoice ${invoice.number} · ${invoice.voided?'void':`${bookMoney(invoice.balance.outstandingCents)} USD outstanding`}`),node(document,'p',`Issued ${invoice.date} · due ${invoice.due}`),node(document,'p',`From: ${invoice.issuer}`),node(document,'p',`Bill to: ${invoice.billTo}`));
    for(const line of invoice.lines)item.append(node(document,'p',`${line.description} · quantity ${line.quantity} · unit ${bookMoney(line.unitCents)} · discount ${bookMoney(line.discountCents)} · tax ${bookMoney(line.taxCents)} · total ${bookMoney(feeLineTotal(line).totalCents)} USD`));
    item.append(node(document,'p',`Invoice total ${bookMoney(invoice.totals.totalCents)} USD`));if(invoice.terms)item.append(node(document,'p',invoice.terms));if(invoice.notes)item.append(node(document,'p',invoice.notes));
    for(const event of invoice.events)item.append(node(document,'p',`${event.input.date} · ${event.type.replace('fee.','')} · ${event.input.amountCents?bookMoney(event.input.amountCents)+' USD · ':''}${event.input.reason??event.input.reference??event.input.number}${event.input.notes?' · '+event.input.notes:''}`));
    for(const source of invoice.sources)item.append(node(document,'p',`Recorded payment/refund evidence: ${source.freshness}. The historical financial entry is retained.`));fees.append(item);
  }
  if(!view.fees.invoices.length)fees.append(node(document,'p','No firm invoices have been issued in this encrypted account.'));section.append(fees,node(document,'h4','Shared business ledger periods'));
  if(!view.ledgers.length)section.append(node(document,'p','No shared ledger period has been approved. Case working ledgers and older books have not been imported automatically.'));
  for(const ledger of view.ledgers)section.append(renderCaseBooks(document,ledger,{scope:'client'}));return section;
}
