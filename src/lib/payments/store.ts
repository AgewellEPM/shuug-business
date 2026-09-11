import { persistentState } from "../workspace/state";
export type PaymentStatus = "pending" | "paid" | "canceled";
export interface PaymentRecord { orderId: string; sessionId: string; url: string; amountCents: number; status: PaymentStatus; createdAt: string }
const legacy = globalThis as unknown as { __payments?: { byOrder: Map<string, PaymentRecord> } };
const durable = persistentState<PaymentRecord[]>("order-payments", () => [...legacy.__payments?.byOrder.values() ?? []]);
export function recordPayment(rec: Omit<PaymentRecord, "createdAt" | "status"> & { status?: PaymentStatus }): PaymentRecord {
  return durable.change(state => {
    const existing = state.find(p => p.orderId === rec.orderId);
    if (existing && existing.status !== "canceled") { if (existing.sessionId !== rec.sessionId) throw new Error("An active payment session already exists for this order."); return existing; }
    const record: PaymentRecord = { ...rec, status: rec.status ?? "pending", createdAt: new Date().toISOString() };
    const index = state.findIndex(p => p.orderId === rec.orderId); if (index >= 0) state[index] = record; else state.push(record); return record;
  });
}
export function getPayment(orderId: string): PaymentRecord | null { return durable.read().find(p => p.orderId === orderId) ?? null; }
export function listPayments(): PaymentRecord[] { return durable.read(); }
export function setPaymentStatus(orderId: string, status: PaymentStatus): PaymentRecord | null {
  return durable.change(state => { const p = state.find(p => p.orderId === orderId); if (!p) return null; if (p.status === "paid" && status !== "paid") throw new Error("Paid payments require a recorded refund, not a status reversal."); p.status = status; return p; });
}
