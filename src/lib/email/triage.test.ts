import { describe, it, expect } from "vitest";
import { triageEmail } from "./triage";

describe("triageEmail", () => {
  it("routes a purchase order to Sales, needs a human", () => {
    const t = triageEmail({ subject: "Reorder request", body: "We'd like to place an order for 20 cases.", from: "buyer@bigy.com" });
    expect(t.category).toBe("order");
    expect(t.suggestedRole).toBe("Sales");
    expect(t.autoHandle).toBe(false);
  });

  it("auto-handles a sample request", () => {
    const t = triageEmail({ subject: "Can we get samples?", body: "Would love to taste before we buy.", from: "grocer@x.com" });
    expect(t.category).toBe("sample_request");
    expect(t.autoHandle).toBe(true);
  });

  it("flags an AP invoice to Money", () => {
    const t = triageEmail({ subject: "Invoice #4410 past due", body: "Please remit payment.", from: "ap@glassco.com" });
    expect(t.category).toBe("invoice_ap");
    expect(t.suggestedRole).toBe("Money");
  });

  it("sends a complaint to the owner", () => {
    const t = triageEmail({ subject: "Damaged bottles", body: "Three bottles leaked, we want a refund.", from: "store@x.com" });
    expect(t.category).toBe("support");
    expect(t.suggestedRole).toBe("Owner");
    expect(t.autoHandle).toBe(false);
  });

  it("auto-archives spam", () => {
    const t = triageEmail({ subject: "Rank your website #1", body: "Our SEO services guarantee traffic. Unsubscribe here.", from: "spam@seo.biz" });
    expect(t.category).toBe("spam");
    expect(t.autoHandle).toBe(true);
  });

  it("falls back to other→owner", () => {
    const t = triageEmail({ subject: "Hello", body: "Just saying hi.", from: "someone@x.com" });
    expect(t.category).toBe("other");
    expect(t.suggestedRole).toBe("Owner");
  });
});
