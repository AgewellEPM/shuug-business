import { describe, it, expect } from "vitest";
import { settleInvoice, agingFromStatuses, type Invoice, type Payment } from "./collections";

const TODAY = "2026-09-11";
const inv = (id: string, totalCents: number, dueDateISO: string, over: Partial<Invoice> = {}): Invoice => ({ id, customerId: "c", company: "Joe's", totalCents, dueDateISO, ...over });
const pay = (invoiceId: string, amountCents: number, over: Partial<Payment> = {}): Payment => ({ id: "p", invoiceId, amountCents, method: "check", receivedAtISO: TODAY, feeCents: 0, refunded: false, ...over });

describe("settleInvoice", () => {
  it("paid in full", () => {
    const s = settleInvoice(inv("i1", 10000, "2026-09-20"), [pay("i1", 10000)], undefined, TODAY);
    expect(s.status).toBe("paid");
    expect(s.balanceCents).toBe(0);
    expect(s.nextAction).toMatch(/paid/i);
  });
  it("partial payment, not yet due", () => {
    const s = settleInvoice(inv("i2", 10000, "2026-09-30"), [pay("i2", 4000)], undefined, TODAY);
    expect(s.status).toBe("partial");
    expect(s.balanceCents).toBe(6000);
  });
  it("overdue with balance → escalating next actions by reminder count", () => {
    const base = inv("i3", 10000, "2026-08-20"); // ~22 days overdue
    expect(settleInvoice(base, [], { invoiceId: "i3", reminders: 0 }, TODAY).nextAction).toMatch(/first reminder/i);
    expect(settleInvoice(base, [], { invoiceId: "i3", reminders: 1 }, TODAY).nextAction).toMatch(/reminder \(1 sent\)/i);
    expect(settleInvoice(base, [], { invoiceId: "i3", reminders: 3 }, TODAY).nextAction).toMatch(/escalate|personal call/i);
  });
  it("honors a promised date and flags a broken promise", () => {
    const base = inv("i4", 10000, "2026-08-20");
    expect(settleInvoice(base, [], { invoiceId: "i4", promisedDate: "2026-09-20" }, TODAY).nextAction).toMatch(/promised 2026-09-20/i);
    expect(settleInvoice(base, [], { invoiceId: "i4", promisedDate: "2026-09-01" }, TODAY).nextAction).toMatch(/broken/i);
  });
  it("refunded payments don't count toward paid; fees tallied", () => {
    const s = settleInvoice(inv("i5", 10000, "2026-09-30"), [pay("i5", 10000, { refunded: true }), pay("i5", 3000, { feeCents: 90 })], undefined, TODAY);
    expect(s.paidCents).toBe(3000);
    expect(s.feeCents).toBe(90);
    expect(s.balanceCents).toBe(7000);
  });
});

describe("agingFromStatuses", () => {
  it("buckets open balances by days overdue, excludes paid", () => {
    const statuses = [
      settleInvoice(inv("a", 1000, "2026-09-30"), [], undefined, TODAY),      // current
      settleInvoice(inv("b", 2000, "2026-09-01"), [], undefined, TODAY),      // 1-30
      settleInvoice(inv("c", 3000, "2026-07-01"), [], undefined, TODAY),      // 61-90
      settleInvoice(inv("d", 4000, "2026-09-30"), [pay("d", 4000)], undefined, TODAY), // paid → excluded
    ];
    const a = agingFromStatuses(statuses);
    expect(a.currentCents).toBe(1000);
    expect(a.d1_30Cents).toBe(2000);
    expect(a.d61_90Cents).toBe(3000);
    expect(a.totalCents).toBe(6000);
  });
});
