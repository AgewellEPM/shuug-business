import { dateOnly, decimalCents, type ExpenseFields } from "./model";

/** Suggestions only. Never mark an OCR amount as a reviewed accounting record. */
export function receiptSuggestions(text: string): Partial<ExpenseFields> {
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const result: Partial<ExpenseFields>={};
  const merchant=lines.slice(0,6).find(s=>/[a-z]{3}/i.test(s)&&!/^\s*(receipt|invoice|date|tel|phone|www\.|https?:|\d)/i.test(s));
  if(merchant)result.merchant=merchant.slice(0,160);
  const iso=text.match(/\b(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)\b/);
  const us=text.match(/\b([01]?\d)[/-]([0-3]?\d)[/-](20\d{2})\b/);
  const date=iso?`${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`:us?`${us[3]}-${us[1].padStart(2,"0")}-${us[2].padStart(2,"0")}`:null;
  if(date&&dateOnly.safeParse(date).success)result.date=date;
  const amount=(line:string)=>{const values=[...line.matchAll(/(?:\$|£|€)?\s*(\d[\d,]*\.\d{2})(?!\d)/g)];try{return values.length?decimalCents(values.at(-1)![1].replace(/,/g,"")):null;}catch{return null;}};
  const totals=lines.filter(s=>/^(?:(?:grand|sale[s]?)\s+)?total\b|^amount\s+(?:paid|due)\b/i.test(s)&&!/(?:subtotal|sub total|tax|saving|discount|change)/i.test(s)).map(amount).filter((n):n is number=>n!==null&&n>0&&n<=100000000);
  // Conflicting total lines remain blank for the owner to decide.
  if(new Set(totals).size===1)result.amountCents=totals[0];
  const taxes=lines.filter(s=>/^(?:sales\s+)?tax\b/i.test(s)).map(amount).filter((n):n is number=>n!==null);
  if(taxes.length===1&&taxes[0]<=(result.amountCents??Infinity))result.taxCents=taxes[0];
  const currency=text.match(/\b(USD|CAD|GBP|EUR|AUD)\b/);
  if(currency)result.currency=currency[1] as ExpenseFields["currency"];
  else if(text.includes("£"))result.currency="GBP";else if(text.includes("€"))result.currency="EUR";
  return result;
}
