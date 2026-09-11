import { describe, it, expect } from "vitest";
import { reconcileTotals, mappingCoverage, buildReport, type LedgerTotals } from "./engine";

const local: LedgerTotals = { arCents: 100000, incomeCents: 500000, salesTaxCents: 35000, feesCents: 1200, paymentsCents: 400000 };

describe("reconcileTotals", () => {
  it("marks lines unknown when accounting isn't connected (never a fake match)", () => {
    const lines = reconcileTotals(local, null);
    expect(lines.every((l) => l.status === "unknown" && l.accountingCents === null)).toBe(true);
  });
  it("matches within tolerance, flags mismatches with the variance", () => {
    const acct: LedgerTotals = { ...local, incomeCents: 500050, arCents: 90000 };
    const lines = reconcileTotals(local, acct, 100);
    expect(lines.find((l) => l.key === "incomeCents")!.status).toBe("match"); // $0.50 within tolerance
    const ar = lines.find((l) => l.key === "arCents")!;
    expect(ar.status).toBe("mismatch");
    expect(ar.varianceCents).toBe(10000); // we say 100000, they say 90000
  });
});

describe("mappingCoverage", () => {
  it("counts mapped vs unmapped and lists the gaps", () => {
    const c = mappingCoverage("Customers", [
      { id: "a", label: "A", mappedId: "QB1" },
      { id: "b", label: "B", mappedId: null },
      { id: "c", label: "C", mappedId: null },
    ]);
    expect(c.mapped).toBe(1);
    expect(c.pctMapped).toBe(33);
    expect(c.unmapped.map((u) => u.id)).toEqual(["b", "c"]);
  });
});

describe("buildReport", () => {
  it("not-connected when no accounting side", () => {
    expect(buildReport(local, null, []).status).toBe("not-connected");
  });
  it("mismatched > unmapped > reconciled precedence", () => {
    const cov = [mappingCoverage("Customers", [{ id: "b", label: "B", mappedId: null }])];
    expect(buildReport(local, { ...local, arCents: 0 }, cov).status).toBe("mismatched");
    expect(buildReport(local, local, cov).status).toBe("unmapped");
    expect(buildReport(local, local, [mappingCoverage("Customers", [{ id: "a", label: "A", mappedId: "Q" }])]).status).toBe("reconciled");
  });
});
