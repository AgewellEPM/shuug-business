import { describe, it, expect } from "vitest";
import { moneyToCents, mapAmazonOrder, mapAmazonOrders } from "./map";

describe("moneyToCents", () => {
  it("parses Amazon string/number money to cents", () => {
    expect(moneyToCents({ CurrencyCode: "USD", Amount: "12.99" })).toBe(1299);
    expect(moneyToCents({ Amount: 72 })).toBe(7200);
    expect(moneyToCents(null)).toBe(0);
    expect(moneyToCents({ Amount: "-1" })).toBe(0);
  });
});

describe("mapAmazonOrder", () => {
  it("normalizes an SP-API order incl. item count and buyer email", () => {
    const o = mapAmazonOrder({
      AmazonOrderId: "111-2233445-6677889",
      PurchaseDate: "2026-09-01T12:00:00Z",
      OrderStatus: "Shipped",
      SalesChannel: "Amazon.com",
      MarketplaceId: "ATVPDKIKX0DER",
      NumberOfItemsShipped: 2,
      NumberOfItemsUnshipped: 1,
      OrderTotal: { CurrencyCode: "USD", Amount: "47.97" },
      BuyerInfo: { BuyerEmail: "buyer@marketplace.amazon.com" },
    });
    expect(o.orderId).toBe("111-2233445-6677889");
    expect(o.status).toBe("Shipped");
    expect(o.itemsCount).toBe(3);
    expect(o.totalCents).toBe(4797);
    expect(o.buyerEmail).toBe("buyer@marketplace.amazon.com");
    expect(o.salesChannel).toBe("Amazon.com");
  });

  it("defaults gracefully on sparse orders and drops id-less rows", () => {
    const o = mapAmazonOrder({ AmazonOrderId: "X" });
    expect(o.totalCents).toBe(0);
    expect(o.itemsCount).toBe(0);
    expect(o.buyerEmail).toBeNull();
    // @ts-expect-error — intentionally malformed to test the filter
    expect(mapAmazonOrders([{ AmazonOrderId: 5 }, { AmazonOrderId: "ok" }])).toHaveLength(1);
  });
});
