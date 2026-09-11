import { describe, it, expect } from "vitest";
import { buildCheckoutForm } from "./stripe";

describe("buildCheckoutForm", () => {
  const base = "https://app.example";
  it("builds a one-line Checkout body with cents, metadata, and redirects", () => {
    const f = buildCheckoutForm({ orderId: "ORD-9", amountCents: 494500, description: "Joe's Market bulk order", customerEmail: "joe@x.co" }, base);
    expect(f.get("mode")).toBe("payment");
    expect(f.get("line_items[0][price_data][unit_amount]")).toBe("494500"); // $4,945.00
    expect(f.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(f.get("metadata[orderId]")).toBe("ORD-9");
    expect(f.get("payment_intent_data[metadata][orderId]")).toBe("ORD-9");
    expect(f.get("customer_email")).toBe("joe@x.co");
    expect(f.get("success_url")).toBe("https://app.example/billing?paid=ORD-9");
    expect(f.get("cancel_url")).toBe("https://app.example/billing?canceled=ORD-9");
  });

  it("omits email when absent and rejects non-positive amounts", () => {
    const f = buildCheckoutForm({ orderId: "ORD-1", amountCents: 100, description: "x" }, base);
    expect(f.get("customer_email")).toBeNull();
    expect(() => buildCheckoutForm({ orderId: "x", amountCents: 0, description: "x" }, base)).toThrow();
    expect(() => buildCheckoutForm({ orderId: "x", amountCents: -5, description: "x" }, base)).toThrow();
  });
});
