// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ShopifyStore } from "./store";
const shop = "client.myshopify.com", id = "gid://shopify/Product/1", at = "2026-09-10T00:00:00.000Z";
let dir: string, store: ShopifyStore;
beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "shuug-store-")); store = new ShopifyStore(path.join(dir, "db.sqlite")); });
afterEach(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });
describe("persistent Shopify state", () => {
  it("survives reopening and isolates stores without leaking records or jobs", () => {
    store.upsert(shop, "products", { id, updatedAt: at, title: "Client product" });
    const receipt = store.enqueue(shop, "delivery:1", "webhook", "products/update", { id: "1" });
    store.close(); store = new ShopifyStore(path.join(dir, "db.sqlite"));
    expect(store.list(shop, "products").records[0].data.title).toBe("Client product");
    expect(store.getJob(shop, receipt.job.id)?.status).toBe("pending");
    expect(store.list("other.myshopify.com", "products").records).toEqual([]);
    expect(store.getJob("other.myshopify.com", receipt.job.id)).toBeNull();
  });
  it("deduplicates delivery and command retries, rejects changed intent under the same key", () => {
    const a = store.enqueue(shop, "write:1", "command", "product_update", { title: "First" });
    expect(store.enqueue(shop, "write:1", "command", "product_update", { title: "First" })).toMatchObject({ duplicate: true, job: { id: a.job.id } });
    expect(() => store.enqueue(shop, "write:1", "command", "product_update", { title: "Different" })).toThrow("different command");
  });
  it("does not let stale changes or retries resurrect a deleted product", () => {
    store.upsert(shop, "products", { id, updatedAt: at, title: "Current" });
    store.upsert(shop, "products", { id, updatedAt: "2025-01-01T00:00:00.000Z", title: "Stale" });
    expect(store.list(shop, "products").records[0].data.title).toBe("Current");
    store.remove(shop, "products", id);
    store.upsert(shop, "products", { id, updatedAt: "2027-01-01T00:00:00.000Z", title: "Zombie" });
    expect(store.list(shop, "products").records).toEqual([]);
  });
  it("excludes duplicate worker ownership and marks crashed writes uncertain", () => {
    const other = new ShopifyStore(path.join(dir, "db.sqlite"));
    try {
      const lease = store.acquire(shop, 1000)!;
      expect(other.acquire(shop, 1001)).toBeNull();
      const { job } = store.enqueue(shop, "write:1", "command", "product_update", { title: "New" });
      expect(store.claim(shop)?.id).toBe(job.id);
      const next = other.acquire(shop, 122000)!;
      expect(next).toBeTruthy();
      expect(other.getJob(shop, job.id)?.status).toBe("uncertain");
      store.release(shop, lease);
      expect(store.acquire(shop, 122001)).toBeNull();
      other.release(shop, next);
    } finally { other.close(); }
  });
  it("commits a page and its cursor together, then hides missing catalog records only on a complete scan", () => {
    store.upsert(shop, "products", { id, updatedAt: at }, "2026-01-01T00:00:00.000Z");
    store.savePage(shop, "products", [], "cursor-2", at, false);
    expect(store.list(shop, "products").records).toHaveLength(1);
    expect(store.cursor(shop, "products")?.cursor).toBe("cursor-2");
    store.savePage(shop, "products", [], null, at, true);
    expect(store.list(shop, "products").records).toHaveLength(0);
  });
  it("redacts one customer and their orders without allowing later reimport", () => {
    const customerId = "gid://shopify/Customer/1";
    store.upsert(shop, "customers", { id: customerId, updatedAt: at, email: "private@example.test" });
    store.upsert(shop, "orders", { id: "gid://shopify/Order/1", updatedAt: at, customer: { id: customerId } });
    store.upsert(shop, "orders", { id: "gid://shopify/Order/2", updatedAt: at, customer: { id: "gid://shopify/Customer/2" } });
    store.redactCustomer(shop, customerId);
    store.upsert(shop, "orders", { id: "gid://shopify/Order/3", updatedAt: at, customer: { id: customerId } });
    expect(store.customerOrders(shop, customerId)).toEqual([]);
    expect(store.list(shop, "customers").records).toEqual([]);
    expect(store.list(shop, "orders").records).toHaveLength(1);
  });
  it("preserves uninstall and privacy work when disconnect cancels pending writes", () => {
    const write = store.enqueue(shop, "write", "command", "product_update", {});
    const uninstall = store.enqueue(shop, "uninstall", "webhook", "app/uninstalled", {});
    store.disconnect(shop);
    expect(store.getJob(shop, write.job.id)?.status).toBe("failed");
    expect(store.claim(shop)?.id).toBe(uninstall.job.id);
  });
  it("continues delivery reads while an uncertain command blocks subsequent writes", () => {
    const first = store.enqueue(shop, "first", "command", "product_update", {});
    store.db.prepare("UPDATE jobs SET status='uncertain' WHERE id=?").run(first.job.id);
    const next = store.enqueue(shop, "next", "command", "product_update", {});
    const read = store.enqueue(shop, "read", "webhook", "products/update", { id: "1" });
    expect(store.claim(shop)?.id).toBe(read.job.id);
    expect(store.getJob(shop, next.job.id)?.status).toBe("pending");
  });
});
