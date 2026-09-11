import { z } from "zod";

export const CATEGORIES = ["Advertising", "Travel & mileage", "Meals", "Office & supplies", "Software", "Rent & utilities", "Shipping", "Professional services", "Payroll", "Inventory & ingredients", "Equipment", "Other"] as const;
export const CURRENCIES = ["USD", "CAD", "GBP", "EUR", "AUD"] as const;
export const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => {const d=new Date(`${s}T12:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s&&s>="1900-01-01"&&s<="2199-12-31";}, "Enter a valid date between 1900 and 2199.");
export const expenseFieldsSchema = z.object({
  merchant: z.string().trim().max(160), date: dateOnly,
  amountCents: z.number().int().min(1).max(100000000).nullable(),
  taxCents: z.number().int().min(0).max(100000000).nullable(),
  currency: z.enum(CURRENCIES), category: z.enum(CATEGORIES),
  treatment: z.enum(["operating", "inventory", "asset", "transfer"]),
  kind: z.enum(["expense", "refund"]),
  channel: z.enum(["shared", "bulk", "stores", "online"]),
  paymentStatus: z.enum(["paid", "unpaid"]),
  paymentMethod: z.string().trim().max(80), reference: z.string().trim().max(120),
  notes: z.string().trim().max(5000),
}).refine(d => d.taxCents===null||d.amountCents===null||d.taxCents<=d.amountCents, {message:"Tax cannot exceed the receipt total.",path:["taxCents"]});
export type ExpenseFields = z.infer<typeof expenseFieldsSchema>;
export type ExpenseStatus = "draft" | "recorded" | "archived";
export interface ReceiptFile {
  hash: string; name: string; extension: string; mime: string; bytes: number;
  text: string; extraction: "read" | "unavailable" | "failed"; message: string;
}
export interface ExpenseRevision { revision: number; at: string; action: string; status: ExpenseStatus; fields: ExpenseFields; actor?: string }
export interface Expense {
  accounting?: import("./accounting-model").ExpenseAccounting;
  id: string; revision: number; createdAt: string; updatedAt: string;
  status: ExpenseStatus; archivedFrom?: "draft"|"recorded";
  fields: ExpenseFields; receipt: ReceiptFile|null; history: ExpenseRevision[];
}
export function blankExpense(date: string): ExpenseFields {
  return {merchant:"",date,amountCents:null,taxCents:null,currency:"USD",category:"Other",treatment:"operating",kind:"expense",channel:"shared",paymentStatus:"paid",paymentMethod:"",reference:"",notes:""};
}
export function signedAmount(f: ExpenseFields) {return (f.amountCents??0)*(f.kind==="refund"?-1:1);}
export function decimalCents(value: string): number|null {
  const s=value.trim();if(!s)return null;
  if(!/^\d{1,7}(\.\d{1,2})?$/.test(s))throw new Error("Enter an amount with up to two decimal places.");
  const [whole,fraction=""]=s.split(".");return Number(whole)*100+Number(fraction.padEnd(2,"0"));
}
export function money(cents: number, currency="USD") {return new Intl.NumberFormat("en-US",{style:"currency",currency}).format(cents/100);}
export function csvCell(value: unknown) {const s=String(value??"");return `"${(typeof value!=="number"&&/^[\s]*[=+@-]|^[\t\r\n]/.test(s)?"'":"")+s.replace(/"/g,'""')}"`;}
export function expensesCsv(records: Expense[]) {
  return [["ID","Status","Date","Merchant","Kind","Total","Tax included","Currency","Category","Treatment","Channel","Payment status","Payment method","Reference","Notes","Receipt file"],...records.map(r=>[r.id,r.status,r.fields.date,r.fields.merchant,r.fields.kind,signedAmount(r.fields)/100,r.fields.taxCents===null?"":r.fields.taxCents/100,r.fields.currency,r.fields.category,r.fields.treatment,r.fields.channel,r.fields.paymentStatus,r.fields.paymentMethod,r.fields.reference,r.fields.notes,r.receipt?.name])].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
