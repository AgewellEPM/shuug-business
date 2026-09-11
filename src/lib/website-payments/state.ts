import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { workspaceDatabase } from "../workspace/database";

export type PaymentStatus = "creating" | "open" | "processing" | "paid" | "test_paid" | "expired" | "review" | "paid_review";
export interface WebsitePayment {
  id: string; kind: "invoice" | "donation"; invoiceId: string | null; accountId: string | null;
  amount: number; currency: string; title: string; status: PaymentStatus; live: boolean;
  createdAt: string; checkedAt: string | null; nextCheck: number; attempts: number;
  sessionId: string | null; intentId: string | null; checkoutUrl: string | null;
  sealedKey: string; parameters: string; requestHash: string; receiptHash: string | null;
  donor: { name: string; email: string; purpose: string; fund: string | null; campaign: string | null; consentAt: string } | null;
  recordId: string | null; paymentId: string | null; error: string | null;
}
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function paymentSchema(db: DatabaseSync) {
  db.exec(`CREATE TABLE IF NOT EXISTS website_payments (id TEXT PRIMARY KEY, invoice_id TEXT, status TEXT NOT NULL, session_id TEXT UNIQUE, intent_id TEXT UNIQUE, body TEXT NOT NULL CHECK(json_valid(body)));
    CREATE UNIQUE INDEX IF NOT EXISTS website_invoice_pending ON website_payments(invoice_id) WHERE invoice_id IS NOT NULL AND status IN ('creating','open','processing','review','paid_review');
    CREATE TABLE IF NOT EXISTS website_payment_events (id TEXT PRIMARY KEY, payment_id TEXT NOT NULL, session_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS website_payment_rates (bucket TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
}
export function paymentRows(db: DatabaseSync): WebsitePayment[] { paymentSchema(db); return (db.prepare("SELECT body FROM website_payments ORDER BY rowid DESC").all() as { body: string }[]).map(r => JSON.parse(r.body)); }
export function getPayment(db: DatabaseSync, id: string): WebsitePayment | null { paymentSchema(db); const r = db.prepare("SELECT body FROM website_payments WHERE id=?").get(id) as { body: string } | undefined; return r ? JSON.parse(r.body) : null; }
export function putPayment(db: DatabaseSync, p: WebsitePayment) { paymentSchema(db); db.prepare("INSERT INTO website_payments VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,session_id=excluded.session_id,intent_id=excluded.intent_id,body=excluded.body").run(p.id, p.invoiceId, p.status, p.sessionId, p.intentId, JSON.stringify(p)); return p; }
export function pendingInvoice(db: DatabaseSync, id: string) { paymentSchema(db); const r = db.prepare("SELECT body FROM website_payments WHERE invoice_id=? AND status IN ('creating','open','processing','review','paid_review')").get(id) as { body: string } | undefined; return r ? JSON.parse(r.body) as WebsitePayment : null; }
export function assertNoInvoiceCheckout(db: DatabaseSync, id: string) { if (pendingInvoice(db, id)) throw new Error("An online payment is pending for this invoice. Refresh or expire its Checkout session in Website payments before changing the balance."); }
export function listWebsitePayments() { return workspaceDatabase(db => paymentRows(db).map(p => ({ id: p.id, kind: p.kind, title: p.title, amount: p.amount, currency: p.currency, status: p.status, live: p.live, createdAt: p.createdAt, checkedAt: p.checkedAt, sessionId: p.sessionId, paymentId: p.paymentId, recordId: p.recordId, error: p.error }))); }
/** Return false instead of throwing so denied attempts remain counted on commit. */
export function paymentRate(db: DatabaseSync, bucket: string, limit: number) { paymentSchema(db); db.prepare("DELETE FROM website_payment_rates WHERE expires<=?").run(Date.now()); const row = db.prepare("SELECT count FROM website_payment_rates WHERE bucket=?").get(bucket) as { count: number } | undefined; if ((row?.count ?? 0) >= limit) return false; db.prepare("INSERT INTO website_payment_rates VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1").run(bucket, Date.now() + 3600000); return true; }
