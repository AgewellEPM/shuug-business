import { describe, it, expect } from "vitest";
import { QB_FEATURES, QB_GROUPS, coverage, featuresByGroup } from "./features";

describe("QuickBooks feature map", () => {
  it("has unique ids and valid groups", () => {
    const ids = QB_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of QB_FEATURES) expect(QB_GROUPS).toContain(f.group);
  });

  it("coverage counts add up", () => {
    const c = coverage();
    expect(c.live + c.partial + c.planned).toBe(c.total);
    expect(c.total).toBe(QB_FEATURES.length);
    expect(c.pctReady).toBe(Math.round(c.live / c.total * 100));
    expect(c.manualParity).toBe(false);
  });

  it("every LIVE feature exposes a route or an API path", () => {
    for (const f of QB_FEATURES.filter((f) => f.status === "live")) {
      expect(!!(f.route || f.apiPath), `${f.id} has no route/api`).toBe(true);
    }
  });

  it("groups partition the features", () => {
    const summed = QB_GROUPS.reduce((n, g) => n + featuresByGroup(g).length, 0);
    expect(summed).toBe(QB_FEATURES.length);
  });
});
