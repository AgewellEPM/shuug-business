import { describe, it, expect } from "vitest";
import { containsStatement, checkLabel, haccpSummary } from "./compliance";
import type { CcpCheck, ProductLabel } from "./model";

describe("containsStatement", () => {
  it("builds the FDA Contains line and dedupes", () => {
    expect(containsStatement(["Sesame", "Milk", "Sesame"])).toBe("Contains: Sesame, Milk.");
    expect(containsStatement([])).toBe("");
  });
});

describe("checkLabel", () => {
  const good: ProductLabel = { skuId: "shuug-amba", ingredientsStatement: "Mango, spices, sesame oil.", allergens: ["Sesame"], netWeight: "12 fl oz (355 mL)", shelfLifeDays: 540 };
  it("passes a complete label and flags non-major allergens as info", () => {
    const r = checkLabel({ ...good, allergens: ["Sesame", "Mustard"] });
    expect(r.ok).toBe(true);
    expect(r.nonMajorAllergens).toEqual(["Mustard"]);
  });
  it("catches missing elements", () => {
    const r = checkLabel({ ...good, ingredientsStatement: "", netWeight: "", shelfLifeDays: 0 });
    expect(r.ok).toBe(false);
    expect(r.issues).toHaveLength(3);
  });
});

describe("haccpSummary", () => {
  const checks: CcpCheck[] = [
    { id: "1", ccp: "pH", hazard: "C. bot", criticalLimit: "pH <= 4.0", measured: "3.6", withinLimit: true, correctiveAction: "", checkedBy: "A", checkedAt: "2026-09-01", lotCode: "AMBA-2608" },
    { id: "2", ccp: "Cook temp", hazard: "Pathogens", criticalLimit: ">= 165F", measured: "150F", withinLimit: false, correctiveAction: "Re-cooked batch", checkedBy: "A", checkedAt: "2026-09-01", lotCode: "AMBA-2608" },
    { id: "3", ccp: "Metal", hazard: "Foreign", criticalLimit: "no detect", measured: "detect", withinLimit: false, correctiveAction: "", checkedBy: "B", checkedAt: "2026-09-02", lotCode: "ZHOUG-2609" },
  ];
  it("counts out-of-limit and open corrective actions", () => {
    const s = haccpSummary(checks);
    expect(s.total).toBe(3);
    expect(s.outOfLimit).toBe(2);
    expect(s.openCorrectiveActions).toBe(1); // check #3 has no corrective action
    expect(s.failing.map((c) => c.ccp)).toEqual(["Cook temp", "Metal"]);
  });
});
