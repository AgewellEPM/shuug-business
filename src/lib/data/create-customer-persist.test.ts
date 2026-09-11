import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { MemoryDealStore } from "./store";

/**
 * Regression: a customer added through the UI must survive an in-memory store
 * rebuild (dev HMR / server restart). Before the fix, createCustomer only put
 * the deal in the Map and it vanished on the next reload — "not creating
 * anything". The store must persist it to the durable archive on create.
 */
const INPUT = {
  company: "Test Bodega LLC",
  channel: "store" as const,
  buyerName: "Pat Buyer",
  buyerEmail: "pat@testbodega.com",
  website: null,
  accountOwner: "Alex Rivera",
  region: "MA",
  billingAddress: "1 Test St",
  shippingAddress: "1 Test St",
  quickbooksCustomerId: null,
  requiresPO: false,
};

let dir = "";
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "dd-cust-")); vi.stubEnv("DEALDESK_DATA_DIR", dir); });
afterEach(async () => { vi.unstubAllEnvs(); await rm(dir, { recursive: true, force: true }); });

describe("createCustomer persistence", () => {
  it("survives a fresh store instance (rebuild)", async () => {
    const s1 = new MemoryDealStore();
    const created = await s1.createCustomer(INPUT);
    const id = created.customer.id;
    expect(id).toBeTruthy();

    // Brand-new instance = what happens after HMR / restart.
    const s2 = new MemoryDealStore();
    const got = await s2.getDeal(id);
    expect(got, "new customer was lost after store rebuild").toBeTruthy();
    expect(got!.customer.company).toBe("Test Bodega LLC");
    expect((await s2.listCustomers()).some((c) => c.id === id)).toBe(true);
  });

  it("does not duplicate on repeated rebuilds", async () => {
    const s1 = new MemoryDealStore();
    const id = (await s1.createCustomer(INPUT)).customer.id;
    const s2 = new MemoryDealStore();
    const s3 = new MemoryDealStore();
    expect((await s3.listCustomers()).filter((c) => c.id === id)).toHaveLength(1);
    void s2;
  });
});
