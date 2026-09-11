import { describe, it, expect } from "vitest";
import { buildAlerts, alertCounts, type AlertInput } from "./engine";

const EMPTY: AlertInput = {
  reorder: [], expiringLots: [], overdueTasks: [], pendingSamples: 0,
  heldInvoices: [], unroutedEmails: [], failingCcp: [],
};

describe("buildAlerts", () => {
  it("ranks critical before warning before info", () => {
    const alerts = buildAlerts({
      ...EMPTY,
      reorder: [{ skuId: "s1", name: "Zhoug", onHandCases: 0, reorderPointCases: 20 }], // critical (0 on hand)
      heldInvoices: [{ vendor: "GlassCo", invoiceNumber: "G-1120", atRiskCents: 116000 }], // warning
      pendingSamples: 2, // info
    });
    expect(alerts.map((a) => a.severity)).toEqual(["critical", "warning", "info"]);
    expect(alerts[0].title).toContain("Zhoug");
    expect(alerts[1].detail).toContain("$1,160.00");
  });

  it("flags expired lots as critical and expiring-soon as warning", () => {
    const a = buildAlerts({
      ...EMPTY,
      expiringLots: [
        { lotCode: "AMBA-1", name: "Amba", daysToExpiry: -5, expired: true },
        { lotCode: "ZHOUG-1", name: "Zhoug", daysToExpiry: 40, expired: false },
      ],
    });
    expect(a.find((x) => x.id === "expiry-AMBA-1")?.severity).toBe("critical");
    expect(a.find((x) => x.id === "expiry-ZHOUG-1")?.severity).toBe("warning");
  });

  it("HACCP failures are critical; overdue tasks are warnings", () => {
    const a = buildAlerts({
      ...EMPTY,
      failingCcp: [{ ccp: "Cook temp", lotCode: "AMBA-1" }],
      overdueTasks: [{ id: "T1", title: "Call buyer", assignee: "Alex", dueDate: "2026-09-01" }],
    });
    expect(a.find((x) => x.category === "Food safety")?.severity).toBe("critical");
    expect(a.find((x) => x.category === "Tasks")?.severity).toBe("warning");
  });

  it("bundles unrouted emails into one info alert with a count", () => {
    const a = buildAlerts({ ...EMPTY, unroutedEmails: [{ subject: "Order", category: "order" }, { subject: "PO", category: "order" }] });
    const email = a.find((x) => x.id === "emails-unrouted")!;
    expect(email.title).toContain("2 emails");
  });

  it("counts by severity and returns nothing when all clear", () => {
    expect(buildAlerts(EMPTY)).toHaveLength(0);
    const counts = alertCounts(buildAlerts({ ...EMPTY, reorder: [{ skuId: "s", name: "X", onHandCases: 5, reorderPointCases: 20 }] }));
    expect(counts.warning).toBe(1);
  });
});
