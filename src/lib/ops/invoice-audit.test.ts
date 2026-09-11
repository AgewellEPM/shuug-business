import { describe, it, expect } from "vitest";
import { auditInvoices, priceBook, median } from "./invoice-audit";
import type { SupplierInvoice } from "./model";

const INVOICES: SupplierInvoice[] = [
  {
    id: "inv-1", vendor: "Hartford Hydraulics", invoiceNumber: "30071", date: "2026-08-01",
    lines: [{ itemCode: "HYD-4410", description: "Hydraulic unit", unitPriceCents: 295000, quantity: 1 }],
  },
  {
    id: "inv-2", vendor: "Nutmeg Concrete", invoiceNumber: "30072", date: "2026-08-05",
    lines: [{ itemCode: "HYD-4410", description: "Hydraulic unit", unitPriceCents: 290000, quantity: 1 }],
  },
  {
    id: "inv-3", vendor: "Nutmeg Concrete", invoiceNumber: "30070", date: "2026-07-20",
    lines: [{ itemCode: "HYD-4410", description: "Hydraulic unit", unitPriceCents: 300000, quantity: 1 }],
  },
  {
    id: "inv-4", vendor: "Hartford Hydraulics", invoiceNumber: "30099", date: "2026-09-01",
    lines: [{ itemCode: "HYD-4410", description: "Hydraulic unit", unitPriceCents: 598000, quantity: 2 }], // overcharge
  },
];

describe("median", () => {
  it("odd and even length", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // round((2+3)/2)=3
    expect(median([])).toBe(0);
  });
});

describe("priceBook", () => {
  it("builds median + sample count per item code", () => {
    const book = priceBook(INVOICES);
    const hyd = book.get("HYD-4410")!;
    expect(hyd.samples).toBe(4);
    expect(hyd.medianCents).toBe(median([295000, 290000, 300000, 598000])); // (295000+300000)/2=297500
  });
});

describe("auditInvoices", () => {
  const report = auditInvoices(INVOICES);

  it("flags the overcharge with median + samples and computes at-risk", () => {
    const flagged = report.invoices.find((i) => i.id === "inv-4")!;
    expect(flagged.status).toBe("held");
    expect(flagged.flags).toHaveLength(1);
    const f = flagged.flags[0];
    expect(f.itemCode).toBe("HYD-4410");
    expect(f.medianCents).toBe(297500);
    expect(f.samples).toBe(4);
    // overcharge = (598000 - 297500) * 2
    expect(f.overchargeCents).toBe((598000 - 297500) * 2);
    expect(flagged.atRiskCents).toBe(f.overchargeCents);
  });

  it("marks in-range invoices clean and totals at-risk across all", () => {
    const clean = report.invoices.find((i) => i.id === "inv-2")!;
    expect(clean.status).toBe("clean");
    expect(report.flaggedInvoiceCount).toBe(1);
    expect(report.totalAtRiskCents).toBe((598000 - 297500) * 2);
  });

  it("does not flag when there aren't enough samples", () => {
    const sparse = auditInvoices([
      { id: "a", vendor: "V", invoiceNumber: "1", date: "2026-01-01", lines: [{ itemCode: "X", description: "d", unitPriceCents: 100, quantity: 1 }] },
      { id: "b", vendor: "V", invoiceNumber: "2", date: "2026-01-02", lines: [{ itemCode: "X", description: "d", unitPriceCents: 10000, quantity: 1 }] },
    ]);
    expect(sparse.flaggedInvoiceCount).toBe(0); // n=2 < MIN_SAMPLES
  });
});
