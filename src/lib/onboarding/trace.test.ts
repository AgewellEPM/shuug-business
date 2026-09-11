import { describe, it, expect } from "vitest";
import {
  parseShopifyProducts,
  extractBusinessMeta,
  detectPlatform,
  findPresence,
  parseJsonLdProducts,
} from "./trace";

describe("parseShopifyProducts", () => {
  it("maps products.json to titles + prices in cents", () => {
    const data = {
      products: [
        { title: "Amba Hot Sauce", handle: "amba", variants: [{ price: "11.99", sku: "AMBA-12" }], images: [{ src: "https://x/amba.jpg" }] },
        { title: "Combo Pack", handle: "combo", variants: [{ price: 21.99 }] },
      ],
    };
    const p = parseShopifyProducts(data);
    expect(p).toHaveLength(2);
    expect(p[0]).toMatchObject({ title: "Amba Hot Sauce", priceCents: 1199, sku: "AMBA-12", imageUrl: "https://x/amba.jpg" });
    expect(p[1].priceCents).toBe(2199);
  });
});

describe("extractBusinessMeta / detectPlatform / findPresence", () => {
  const html = `
    <title>Shuug — Hot Sauce</title>
    <meta property="og:site_name" content="Shuug">
    <meta name="description" content="Amba, Zhoug & Harissa hot sauces">
    <script src="https://cdn.shopify.com/s/files/x.js"></script>
    <a href="https://www.amazon.com/stores/shuug">Amazon</a>
    <a href="https://instagram.com/shuug">IG</a>
    <a href="https://instagram.com/shuug">IG dup</a>
  `;
  it("pulls business name + description", () => {
    expect(extractBusinessMeta(html)).toEqual({ name: "Shuug", description: "Amba, Zhoug & Harissa hot sauces" });
  });
  it("detects Shopify", () => {
    expect(detectPlatform(html)).toBe("Shopify");
  });
  it("finds online presence, deduped", () => {
    const p = findPresence(html);
    expect(p.map((x) => x.label).sort()).toEqual(["Amazon", "Instagram"]);
  });
});

describe("parseJsonLdProducts", () => {
  it("reads JSON-LD Product offers as fallback", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Product","name":"Harissa","sku":"HAR-1","offers":{"price":"11.99"},"image":"https://x/h.jpg"}
    </script>`;
    const p = parseJsonLdProducts(html);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ title: "Harissa", priceCents: 1199, sku: "HAR-1" });
  });
});
