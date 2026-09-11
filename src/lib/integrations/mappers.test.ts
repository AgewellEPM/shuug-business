import { describe, it, expect } from "vitest";
import { mapShopifyCustomer, mapShopifyOrder } from "./shopify-map";
import type { ShopifyCustomerRaw, ShopifyOrderRaw } from "./shopify-map";
import { buildQboInvoice, buildQboCustomer, centsToAmount } from "./quickbooks-map";

const CUSTOMER: ShopifyCustomerRaw = {
  id: 998877,
  first_name: "Joe",
  last_name: "Ferraro",
  email: "joe@joesmarket.example",
  default_address: {
    company: "Joe's Market",
    address1: "12 Main St",
    city: "Springfield",
    province: "MA",
    zip: "01103",
    country: "USA",
  },
};

const ORDER: ShopifyOrderRaw = {
  id: 5001,
  name: "#1001",
  email: "joe@joesmarket.example",
  note_attributes: [{ name: "PO Number", value: "JM-7781" }],
  customer: CUSTOMER,
  line_items: [
    { sku: "shuug-amba", title: "Amba Hot Sauce", quantity: 12, price: "66.00" },
    { sku: "shuug-harissa", title: "Harissa Hot Sauce", quantity: 10, price: "68.00" },
  ],
  subtotal_price: "1472.00",
  total_shipping_price_set: { shop_money: { amount: "0.00" } },
  total_price: "1472.00",
};

describe("mapShopifyCustomer", () => {
  it("maps company, buyer, email, address; money-free", () => {
    const c = mapShopifyCustomer(CUSTOMER);
    expect(c.externalId).toBe("998877");
    expect(c.company).toBe("Joe's Market");
    expect(c.buyerName).toBe("Joe Ferraro");
    expect(c.buyerEmail).toBe("joe@joesmarket.example");
    expect(c.billingAddress).toContain("12 Main St");
  });

  it("falls back to a name when there's no company", () => {
    const c = mapShopifyCustomer({ id: 1, first_name: "A", last_name: "B", email: "a@b.c" });
    expect(c.company).toBe("A B");
  });
});

describe("mapShopifyOrder", () => {
  it("converts decimal-string money to cents and pulls the PO", () => {
    const o = mapShopifyOrder(ORDER);
    expect(o.externalId).toBe("5001");
    expect(o.name).toBe("#1001");
    expect(o.customerExternalId).toBe("998877");
    expect(o.customer?.company).toBe("Joe's Market");
    expect(o.poNumber).toBe("JM-7781");
    expect(o.lines[0].unitPriceCents).toBe(6600);
    expect(o.lines[1].unitPriceCents).toBe(6800);
    expect(o.subtotalCents).toBe(147200);
    expect(o.shippingCents).toBe(0);
    expect(o.totalCents).toBe(147200);
  });

  it("derives subtotal from lines when Shopify omits it", () => {
    const o = mapShopifyOrder({ ...ORDER, subtotal_price: null, total_price: null });
    expect(o.subtotalCents).toBe(6600 * 12 + 6800 * 10);
  });
});

describe("centsToAmount", () => {
  it("converts cents to a 2-dp dollar number", () => {
    expect(centsToAmount(7200)).toBe(72);
    expect(centsToAmount(6650)).toBe(66.5);
    expect(centsToAmount(5)).toBe(0.05);
  });
});

describe("buildQboInvoice", () => {
  it("builds one QBO line per order line with item refs and amounts", () => {
    const order = mapShopifyOrder(ORDER);
    const inv = buildQboInvoice(order, "QBO-42", {
      "shuug-amba": "IT-1",
      "shuug-harissa": "IT-3",
    });
    expect(inv.CustomerRef.value).toBe("QBO-42");
    expect(inv.DocNumber).toBe("1001");
    expect(inv.PrivateNote).toBe("PO JM-7781");
    expect(inv.Line).toHaveLength(2);
    expect(inv.Line[0].Amount).toBe(792); // 66 * 12
    expect(inv.Line[0].SalesItemLineDetail.ItemRef?.value).toBe("IT-1");
    expect(inv.Line[0].SalesItemLineDetail.UnitPrice).toBe(66);
    expect(inv.Line[0].SalesItemLineDetail.Qty).toBe(12);
  });

  it("omits ItemRef when the SKU isn't mapped", () => {
    const order = mapShopifyOrder(ORDER);
    const inv = buildQboInvoice(order, "QBO-42"); // no item map
    expect(inv.Line[0].SalesItemLineDetail.ItemRef).toBeUndefined();
  });
});

describe("buildQboCustomer", () => {
  it("maps display/company/email/address", () => {
    const c = buildQboCustomer(mapShopifyCustomer(CUSTOMER));
    expect(c.DisplayName).toBe("Joe's Market");
    expect(c.PrimaryEmailAddr?.Address).toBe("joe@joesmarket.example");
    expect(c.BillAddr?.Line1).toContain("12 Main St");
  });
});
