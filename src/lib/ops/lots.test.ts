import { describe, it, expect } from "vitest";
import { allocateFefo, applyAllocation, expiryReport, recallTrace, toTraceabilityRows } from "./lots";
import type { Lot, TraceEvent } from "./model";

const LOTS: Lot[] = [
  { id: "L1", skuId: "shuug-amba", lotCode: "AMBA-2608", producedOn: "2026-08-01", expiresOn: "2027-02-01", quantityCases: 20, remainingCases: 20 },
  { id: "L2", skuId: "shuug-amba", lotCode: "AMBA-2606", producedOn: "2026-06-01", expiresOn: "2026-12-01", quantityCases: 15, remainingCases: 10 },
  { id: "L3", skuId: "shuug-amba", lotCode: "AMBA-2601", producedOn: "2026-01-01", expiresOn: "2026-07-01", quantityCases: 5, remainingCases: 5 }, // expired as of Sep
];

describe("allocateFefo", () => {
  it("takes oldest-expiry lots first and skips expired ones", () => {
    const r = allocateFefo(LOTS, "shuug-amba", 12, "2026-09-10");
    expect(r.ok).toBe(true);
    expect(r.shortfallCases).toBe(0);
    // L3 expired (skipped); L2 expires Dec (10 cases) then L1 (2 cases)
    expect(r.allocations.map((a) => a.lotCode)).toEqual(["AMBA-2606", "AMBA-2608"]);
    expect(r.allocations[0].cases).toBe(10);
    expect(r.allocations[1].cases).toBe(2);
  });

  it("reports a shortfall when non-expired stock is insufficient", () => {
    const r = allocateFefo(LOTS, "shuug-amba", 40, "2026-09-10");
    expect(r.ok).toBe(false);
    // available non-expired = 10 + 20 = 30 -> shortfall 10
    expect(r.shortfallCases).toBe(10);
  });

  it("applies the allocation immutably", () => {
    const r = allocateFefo(LOTS, "shuug-amba", 12, "2026-09-10");
    const after = applyAllocation(LOTS, r.allocations);
    expect(after.find((l) => l.id === "L2")?.remainingCases).toBe(0);
    expect(after.find((l) => l.id === "L1")?.remainingCases).toBe(18);
    expect(LOTS.find((l) => l.id === "L2")?.remainingCases).toBe(10); // original untouched
  });
});

describe("expiryReport", () => {
  it("flags expired lots and sorts by soonest expiry", () => {
    const rows = expiryReport(LOTS, "2026-09-10");
    expect(rows[0].lot.lotCode).toBe("AMBA-2601");
    expect(rows[0].expired).toBe(true);
    expect(rows[rows.length - 1].lot.lotCode).toBe("AMBA-2608");
  });
});

const EVENTS: TraceEvent[] = [
  { id: "E1", type: "receiving", lotCode: "AMBA-2608", skuId: null, itemDescription: "Amba paste", quantityCases: 0, eventDate: "2026-07-30", location: "Plant", reference: "PO-1", counterparty: "SpiceCo", inputLotCodes: [] },
  { id: "E2", type: "transformation", lotCode: "AMBA-2608", skuId: "shuug-amba", itemDescription: "Amba Hot Sauce", quantityCases: 20, eventDate: "2026-08-01", location: "Plant", reference: "PROD-9", counterparty: "", inputLotCodes: ["PASTE-118", "BTL-2607"] },
  { id: "E3", type: "shipping", lotCode: "AMBA-2608", skuId: "shuug-amba", itemDescription: "Amba Hot Sauce", quantityCases: 6, eventDate: "2026-08-20", location: "Plant", reference: "SHP-3", counterparty: "Joe's Market", inputLotCodes: [] },
];

describe("recallTrace", () => {
  it("traces a lot both directions: who got it and what made it", () => {
    const t = recallTrace("AMBA-2608", EVENTS);
    expect(t.events).toHaveLength(3);
    expect(t.shippedTo).toEqual([{ customer: "Joe's Market", reference: "SHP-3", quantityCases: 6, date: "2026-08-20" }]);
    expect(t.madeFromLotCodes.sort()).toEqual(["BTL-2607", "PASTE-118"]);
  });
});

describe("toTraceabilityRows", () => {
  it("produces FSMA-style sortable rows with the key data elements", () => {
    const rows = toTraceabilityRows(EVENTS);
    expect(rows[0]).toMatchObject({ EventType: "receiving", TraceabilityLotCode: "AMBA-2608", EventDate: "2026-07-30" });
    expect(rows[1].InputLotCodes).toBe("PASTE-118|BTL-2607");
  });
});
