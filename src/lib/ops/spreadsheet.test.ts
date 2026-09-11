import { describe, it, expect } from "vitest";
import { rowsToInvoices } from "./spreadsheet";

describe("rowsToInvoices", () => {
  it("maps fuzzy headers and groups rows into invoices", () => {
    const rows = [
      { Vendor: "GlassCo", "Invoice #": "G-1", Date: "2026-08-01", "Item Code": "BTL-12OZ", Description: "Bottles", "Unit Price": "$4.80", Qty: 500 },
      { Vendor: "GlassCo", "Invoice #": "G-1", "Item Code": "CAP-28", "Unit Price": 0.12, Quantity: 500 },
      { supplier: "CoPack", invoice: "CP-9", sku: "RUN", price: "900.00", units: 3 },
    ];
    const r = rowsToInvoices(rows);
    expect(r.rowsRead).toBe(3);
    expect(r.linesMapped).toBe(3);
    // GlassCo/G-1 has two lines; CoPack/CP-9 has one -> 2 invoices
    expect(r.invoices).toHaveLength(2);
    const glass = r.invoices.find((i) => i.vendor === "GlassCo")!;
    expect(glass.lines).toHaveLength(2);
    expect(glass.lines[0].unitPriceCents).toBe(480); // "$4.80"
    expect(glass.lines[1].unitPriceCents).toBe(12); // 0.12 number
    const copack = r.invoices.find((i) => i.vendor === "CoPack")!;
    expect(copack.lines[0].unitPriceCents).toBe(90000);
    expect(copack.lines[0].quantity).toBe(3);
  });

  it("skips rows without an item code or a usable price (counted)", () => {
    const rows = [
      { itemCode: "OK", unitPrice: "5.00" },
      { description: "no code" },
      { itemCode: "NOPRICE" },
      { itemCode: "BADPRICE", unitPrice: "abc" },
    ];
    const r = rowsToInvoices(rows);
    expect(r.linesMapped).toBe(1);
    expect(r.skipped).toBe(3);
  });
});
