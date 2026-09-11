import { describe, it, expect } from "vitest";
import {
  produceRun,
  ship,
  recall,
  listLots,
  traceabilityExportRows,
  recipeCostPerCaseCents,
  skuAllergens,
  getInventory,
} from "./store";

describe("production → lot → ship → recall (end-to-end traceability)", () => {
  it("produces a lot and adds it to inventory", () => {
    const before = getInventory().find((i) => i.skuId === "shuug-zhoug")!.onHandCases;
    const lot = produceRun("shuug-zhoug");
    expect(lot.remainingCases).toBe(24); // batch yield
    expect(lot.lotCode).toMatch(/^ZHOUG-/);
    expect(getInventory().find((i) => i.skuId === "shuug-zhoug")!.onHandCases).toBe(before + 24);
    expect(listLots().some((l) => l.lotCode === lot.lotCode)).toBe(true);
  });

  it("shipping records a lot-level trail so a recall finds the customer", () => {
    ship({
      kind: "order",
      refId: "ORD-RECALL",
      toCompany: "Recall Test Co",
      lines: [{ skuId: "shuug-zhoug", cases: 2 }],
      carrier: "Ground",
      shippingCostCents: 0,
    });
    // FEFO ships the oldest-expiry lot first (seeded ZHOUG-2607).
    const trace = recall("ZHOUG-2607");
    expect(trace.shippedTo.some((s) => s.customer === "Recall Test Co")).toBe(true);
    expect(trace.events.length).toBeGreaterThan(0);
  });

  it("FSMA export has sortable rows with lot codes", () => {
    const rows = traceabilityExportRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty("TraceabilityLotCode");
    expect(rows[0]).toHaveProperty("EventType");
  });
});

describe("recipe cost + allergen roll-up", () => {
  it("derives true mfg cost per case from the BOM", () => {
    // amba batch = 54000+12000+4000+38000 = 108000 over 30 cases = 3600
    expect(recipeCostPerCaseCents("shuug-amba")).toBe(3600);
    expect(recipeCostPerCaseCents("nope")).toBeNull();
  });
  it("rolls up allergens from the recipe", () => {
    expect(skuAllergens("shuug-amba")).toEqual(["Sesame"]);
    expect(skuAllergens("shuug-zhoug")).toEqual([]);
  });
});
