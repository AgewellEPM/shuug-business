import type { DatabaseSync } from "node:sqlite";
import type { WebsitePayment } from "../website-payments/state";
import { billingStateInDatabase } from "./billing-share";
import { applyBillingSettlement } from "./billing-store";
import { journalStateName } from "./book-scope";
/** Provider confirmation and the journal commit share the receipt transaction. */
export function settleBillingProvider(db: DatabaseSync, p: WebsitePayment, intent: string) {
  if (p.kind !== "book_invoice" || !p.bookId || !p.invoiceId || !p.live) throw new Error("Invalid native invoice payment.");
  const state = billingStateInDatabase(db,p.bookId), doc = state.billing?.find(d=>d.id===p.invoiceId && d.kind==="invoice");
  if (!doc) throw new Error("The paid invoice is unavailable. Staff review required.");
  const old = doc.settlements.find(s=>s.providerPaymentId===p.id);
  if (old) return { recordId:doc.id,paymentId:old.id };
  const paymentId = applyBillingSettlement(state,db,p.bookId,doc,{id:doc.id,revision:doc.revision,reviewed:true,date:new Date().toISOString().slice(0,10),direction:"payment",amountCents:p.amount,accountNumber:1010,method:"Stripe",reference:intent,evidence:`Verified Stripe Checkout ${p.sessionId}`},"Stripe verified receipt",p.id);
  db.prepare("UPDATE documents SET body=? WHERE id=? AND kind='state'").run(JSON.stringify(state),`state:${journalStateName(p.bookId)}`);
  return {recordId:doc.id,paymentId};
}
