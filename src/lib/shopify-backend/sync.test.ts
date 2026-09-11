// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { ShopifyStore } from "./store";
import { syncTick } from "./sync";
import { ConnectorError } from "./model";
import { fetchPage, graphClient, sendCommand, type GraphRequest } from "./client";
const shop = "client.myshopify.com", at = "2026-09-10T00:00:00.000Z";
const product = { id: "gid://shopify/Product/1", title: "Current", updatedAt: at, variants: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
const empty = { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
let store: ShopifyStore, dir: string;
beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), "shuug-sync-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); store = new ShopifyStore(path.join(dir, "db.sqlite")); });
afterEach(() => { store.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
describe("sync execution", () => {
  it("makes no network request without a store", async () => {
    vi.stubEnv("SHOPIFY_STORE_DOMAIN", "");
    const graph = vi.fn();
    expect(await syncTick({ store, graph })).toEqual({ state: "disabled" });
    expect(graph).not.toHaveBeenCalled();
  });
  it("fetches current data for a webhook and records duplicates only once", async () => {
    const job = store.enqueue(shop, "delivery:1", "webhook", "products/update", { id: "1" });
    const graph: GraphRequest = vi.fn().mockResolvedValue({ product });
    await syncTick({ store, shop, graph, force: true });
    expect(store.getJob(shop, job.job.id)?.status).toBe("done");
    expect(store.list(shop, "products").records[0].data.title).toBe("Current");
    expect(store.enqueue(shop, "delivery:1", "webhook", "products/update", { id: "1" }).duplicate).toBe(true);
    expect(graph).toHaveBeenCalledTimes(1);
  });
  it("keeps an acknowledged mutation done even when refresh cannot finish", async () => {
    const { job } = store.enqueue(shop, "write:1", "command", "product_update", { type: "product_update", productId: product.id, title: "Updated" });
    const graph = vi.fn().mockResolvedValueOnce({ productUpdate: { product: { id: product.id }, userErrors: [] } }).mockRejectedValue(new ConnectorError("temporary", 502, true));
    await syncTick({ store, shop, graph, force: true });
    await syncTick({ store, shop, graph, force: true });
    expect(store.getJob(shop, job.id)?.status).toBe("done");
    expect(graph.mock.calls.filter(([q]) => String(q).startsWith("mutation"))).toHaveLength(1);
  });
  it("does not automatically replay ambiguous writes", async () => {
    const { job } = store.enqueue(shop, "write:1", "command", "product_update", { type: "product_update", productId: product.id, title: "Updated" });
    const graph = vi.fn().mockRejectedValue(new ConnectorError("lost response", 502, false, true));
    await syncTick({ store, shop, graph, force: true });
    expect(store.getJob(shop, job.id)?.status).toBe("uncertain");
    expect(store.claim(shop)).toBeNull();
  });
  it("commits pagination only after complete nested variants have arrived", async () => {
    const graph = vi.fn().mockResolvedValueOnce({ products: { nodes: [{ ...product, variants: { nodes: [{ id: "v1" }], pageInfo: { hasNextPage: true, endCursor: "v1" } } }], pageInfo: { hasNextPage: true, endCursor: "p1" } } }).mockResolvedValueOnce({ product: { variants: { nodes: [{ id: "v2" }], pageInfo: { hasNextPage: false, endCursor: "v2" } } } });
    await syncTick({ store, shop, graph, force: true });
    expect(store.cursor(shop, "products")?.cursor).toBe("p1");
    expect(store.list(shop, "products").records[0].data.variants).toMatchObject({ nodes: [{ id: "v1" }, { id: "v2" }] });
  });
  it("rejects a stuck cursor without pretending synchronization is complete", async () => {
    const graph = vi.fn().mockResolvedValue({ products: { ...empty, pageInfo: { hasNextPage: true, endCursor: "same" } } });
    await expect(fetchPage("products", "same", graph)).rejects.toThrow("did not advance");
    expect(store.cursor(shop, "products")).toBeUndefined();
  });
  it("includes both Shopify's required idempotency directive and quantity comparison", async () => {
    const graph = vi.fn().mockResolvedValue({ inventorySetQuantities: { userErrors: [], inventoryAdjustmentGroup: { createdAt: at } } });
    await sendCommand({ type: "inventory_set", inventoryItemId: "gid://shopify/InventoryItem/1", locationId: "gid://shopify/Location/2", quantity: 12, compareQuantity: 10 }, "command-uuid", graph);
    expect(graph.mock.calls[0][0]).toContain("@idempotent(key:$key)");
    expect(graph.mock.calls[0][1]).toMatchObject({ key: "command-uuid", input: { quantities: [{ quantity: 12, compareQuantity: 10 }] } });
    expect(graph.mock.calls[0][1].input.ignoreCompareQuantity).toBeUndefined();
  });
  it("distinguishes throttled requests from ambiguous write failures", async () => {
    const config = { storeDomain: shop, adminToken: "fixture-token", apiVersion: "2026-07" };
    const limited = graphClient(config, vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(limited("query{}", {}, false)).rejects.toMatchObject({ retryable: true, uncertain: false });
    const broken = graphClient(config, vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(broken("mutation{}", {}, true)).rejects.toMatchObject({ uncertain: true });
  });
  it("exports all stored customer orders and redacts exports even with sync disabled", async () => {
    vi.stubEnv("SHOPIFY_BACKEND_ENABLED", "false");
    for (let i = 1; i <= 101; i++) store.upsert(shop, "orders", { id: `gid://shopify/Order/${i}`, updatedAt: at, customer: { id: "gid://shopify/Customer/1" } });
    const request = store.enqueue(shop, "export", "webhook", "customers/data_request", { customer: { id: 1 } });
    const graph = vi.fn();
    await syncTick({ store, shop, graph });
    const result = store.getJob(shop, request.job.id)?.result as { orders: unknown[]; requiresOwnerDelivery: boolean };
    expect(result.requiresOwnerDelivery).toBe(true);
    expect(result.orders).toHaveLength(101);
    store.enqueue(shop, "redact", "webhook", "customers/redact", { customer: { id: 1 } });
    await syncTick({ store, shop, graph });
    expect(store.getJob(shop, request.job.id)?.result).toBeNull();
    expect(store.list(shop, "orders").records).toHaveLength(0);
    expect(graph).not.toHaveBeenCalled();
  });
});
